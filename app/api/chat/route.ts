import type Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAnthropic, CONCIERGE_MODEL, NAMER_MODEL } from "@/lib/anthropic";
import { detectPreferences, mergePreferences } from "@/lib/preferences";
import { detectReplyLanguage } from "@/lib/language";
import { searchFlights, IS_MOCK_PROVIDER } from "@/lib/flights/provider";
import type { FlightQuery } from "@/lib/flights/types";
import { searchStays, IS_MOCK_STAY_PROVIDER } from "@/lib/stays/provider";
import type { StayQuery } from "@/lib/stays/types";

// Give the streamed Concierge reply headroom past Vercel's 10s default so long
// responses aren't cut off mid-stream in production.
export const maxDuration = 60;

type ChatRow = { role: "user" | "assistant"; content: string };

/** Ask a cheap model for the destination named in a message (or NONE). */
async function extractDestination(message: string): Promise<string | null> {
  try {
    const res = await getAnthropic().messages.create({
      model: NAMER_MODEL,
      max_tokens: 16,
      system:
        "You name travel trips. From the user's message, extract the single destination they want to visit — a country or city. Reply with ONLY that place name in English, capitalized, nothing else. If there is no clear destination, reply with exactly NONE.",
      messages: [{ role: "user", content: message }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    if (!text || text.toUpperCase() === "NONE" || text.length > 40) return null;
    return text;
  } catch (err) {
    console.error("Trip naming failed:", err);
    return null;
  }
}

const FLIGHT_TOOL: Anthropic.Tool = {
  name: "search_flights",
  description:
    "Search for flights. Only call this once you know the origin airport, destination airport, and departure date. `origin` and `destination` MUST be 3-letter IATA airport codes (e.g. TLV, JFK, LHR) — convert city names to codes yourself before calling.",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Origin airport IATA code, e.g. TLV" },
      destination: {
        type: "string",
        description: "Destination airport IATA code, e.g. JFK",
      },
      departureDate: { type: "string", description: "Departure date, YYYY-MM-DD" },
      returnDate: {
        type: "string",
        description: "Return date, YYYY-MM-DD (round trips only)",
      },
      passengers: { type: "integer", description: "Number of passengers (default 1)" },
      cabinClass: {
        type: "string",
        enum: ["economy", "premium_economy", "business", "first"],
        description: "Cabin class (default economy)",
      },
    },
    required: ["origin", "destination", "departureDate"],
  },
};

const STAY_TOOL: Anthropic.Tool = {
  name: "search_stays",
  description:
    "Search for hotels and accommodation in a destination. Only call this once you know the destination (city or area), the check-in date, and the check-out date.",
  input_schema: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        description: "City or area name, e.g. Rome",
      },
      checkIn: { type: "string", description: "Check-in date, YYYY-MM-DD" },
      checkOut: { type: "string", description: "Check-out date, YYYY-MM-DD" },
      guests: { type: "integer", description: "Number of guests (default 2)" },
      rooms: { type: "integer", description: "Number of rooms (default 1)" },
      budgetLevel: {
        type: "string",
        enum: ["budget", "mid", "luxury"],
        description: "Budget level (optional)",
      },
    },
    required: ["destination", "checkIn", "checkOut"],
  },
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Search timed out")), ms),
    ),
  ]);
}

/**
 * Run a search_flights tool call and return a string tool result. On success:
 * JSON `{ mock, offers }`. On any failure/timeout: a short error sentence so
 * the model apologizes and the chat keeps going — the flight layer never throws
 * into the stream.
 */
async function runFlightSearch(input: unknown): Promise<string> {
  try {
    const q = (input ?? {}) as Partial<FlightQuery>;
    const query: FlightQuery = {
      origin: String(q.origin ?? "").toUpperCase().slice(0, 3),
      destination: String(q.destination ?? "").toUpperCase().slice(0, 3),
      departureDate: String(q.departureDate ?? ""),
      returnDate: q.returnDate ? String(q.returnDate) : undefined,
      passengers:
        typeof q.passengers === "number" && q.passengers > 0 ? q.passengers : 1,
      cabinClass: q.cabinClass ?? "economy",
    };
    if (
      query.origin.length !== 3 ||
      query.destination.length !== 3 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(query.departureDate)
    ) {
      return "Invalid search: need 3-letter IATA codes for origin and destination and a departure date as YYYY-MM-DD.";
    }
    const offers = await withTimeout(searchFlights(query), 15000);
    return JSON.stringify({ mock: IS_MOCK_PROVIDER, offers });
  } catch (err) {
    console.error("Flight search failed:", err);
    return "The flight search is unavailable right now. Apologize briefly in this turn's reply language and offer to try again.";
  }
}

/**
 * Run a search_stays tool call and return a string tool result. On success:
 * JSON `{ mock, offers }`. On any failure/timeout: a short error sentence — the
 * stay layer never throws into the stream. Mirrors runFlightSearch.
 */
async function runStaySearch(input: unknown): Promise<string> {
  try {
    const q = (input ?? {}) as Partial<StayQuery>;
    const query: StayQuery = {
      destination: String(q.destination ?? "").trim(),
      checkIn: String(q.checkIn ?? ""),
      checkOut: String(q.checkOut ?? ""),
      guests: typeof q.guests === "number" && q.guests > 0 ? q.guests : 2,
      rooms: typeof q.rooms === "number" && q.rooms > 0 ? q.rooms : 1,
      budgetLevel:
        q.budgetLevel === "budget" ||
        q.budgetLevel === "mid" ||
        q.budgetLevel === "luxury"
          ? q.budgetLevel
          : undefined,
    };
    if (
      !query.destination ||
      !/^\d{4}-\d{2}-\d{2}$/.test(query.checkIn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(query.checkOut)
    ) {
      return "Invalid search: need a destination and both check-in and check-out dates as YYYY-MM-DD.";
    }
    const offers = await withTimeout(searchStays(query), 15000);
    return JSON.stringify({ mock: IS_MOCK_STAY_PROVIDER, offers });
  } catch (err) {
    console.error("Stay search failed:", err);
    return "The hotel search is unavailable right now. Apologize briefly in this turn's reply language and offer to try again.";
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { message?: unknown; tripId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }
  const rawTripId = typeof body.tripId === "string" ? body.tripId : null;

  // Constructing the Supabase client throws if its env vars are missing (a
  // common production misconfig). Handle it here so the client gets a clear
  // 500 instead of an opaque crash.
  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("Supabase client init failed:", err);
    return Response.json(
      { error: "Server misconfigured: Supabase environment variables are missing." },
      { status: 500 },
    );
  }

  // Ensure a user row exists and grab id + current preferences in one call.
  const { data: user, error: userError } = await admin
    .from("users")
    .upsert(
      {
        google_id: session.user.googleId,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      },
      { onConflict: "google_id" },
    )
    .select("id, name, preferences")
    .single();

  if (userError || !user) {
    console.error("Failed to load user:", userError?.message);
    return Response.json({ error: "Could not load your profile" }, { status: 500 });
  }

  // Resolve the trip: use the one the client sent (must belong to the user), or
  // start a fresh one for a brand-new conversation.
  let trip: { id: string; name: string };
  if (rawTripId) {
    const { data } = await admin
      .from("trips")
      .select("id, name")
      .eq("id", rawTripId)
      .eq("user_id", user.id)
      .single();
    if (!data) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }
    trip = data;
  } else {
    const { data, error } = await admin
      .from("trips")
      .insert({ user_id: user.id })
      .select("id, name")
      .single();
    if (error || !data) {
      console.error("Failed to create trip:", error?.message);
      return Response.json({ error: "Could not start a trip" }, { status: 500 });
    }
    trip = data;
  }

  // Prior conversation for THIS trip (for context and first-message detection).
  const { data: historyRows } = await admin
    .from("chat_messages")
    .select("role, content")
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: true })
    .limit(40);

  const history = (historyRows ?? []) as ChatRow[];
  const isFirstMessage = history.length === 0;

  // Learn preferences from this message and persist any new ones.
  const existingPrefs: string[] = Array.isArray(user.preferences)
    ? (user.preferences as string[])
    : [];
  const merged = mergePreferences(existingPrefs, detectPreferences(message));
  if (merged.length !== existingPrefs.length) {
    await admin.from("users").update({ preferences: merged }).eq("id", user.id);
  }

  // Save the user's message before we start generating.
  await admin.from("chat_messages").insert({
    user_id: user.id,
    trip_id: trip.id,
    role: "user",
    content: message,
  });

  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";
  const prefLine = merged.length
    ? `Known travel preferences: ${merged.join(", ")}.`
    : "No saved preferences yet.";

  // The reply language is decided HERE, deterministically, once per turn —
  // never re-inferred by the model (see lib/language.ts for the policy).
  const replyLang = detectReplyLanguage(message, history);
  const langDirective =
    replyLang === "he"
      ? "Hebrew"
      : "the language of the traveler's latest message — NOT Hebrew (English if they wrote English, and so on)";

  const today = new Date().toISOString().slice(0, 10);
  const system = `You're the Cloud9 Concierge — ${firstName}'s personal travel professional. Efficient, knowledgeable, and courteous, with a light, understated warmth. You work the way a skilled human travel agent does: get to the point, ask precise questions, deliver results.

Who you're talking to: ${firstName}. ${prefLine}

Today's date is ${today}. Resolve every date the user gives to a real, FUTURE date in YYYY-MM-DD — never a past year. If they name a month/day with no year, use the next future occurrence.

How you talk:
- Sound like a skilled human travel professional — efficient, clear, courteous. Not stiff or corporate, but not a chatty friend either.
- Light warmth only. A brief, courteous acknowledgement is fine when it fits — "Certainly", "Of course", "Good choice" (or "בהחלט", "בסדר גמור", "בחירה טובה" in Hebrew). No slang, no "Love that", no emojis, no exclamation-driven chatter — in either language.
- THIS TURN'S REPLY LANGUAGE: ${langDirective}. This is already decided from their latest message — do NOT re-decide it from the conversation, from your own earlier replies, or from tool results (tool results arrive as English JSON; that changes nothing). EVERY word you write this turn is in that language: the reply itself, any brief note before a tool call (e.g. "רגע, בודק אפשרויות..." when the turn is Hebrew — never "Let me check flights..."), the summary after a tool result, and every string inside a block (the "question", every option, every label). One message is ONE language from its first word to its last — commit to the language before you write the first word and never switch mid-message.
- Be concise and results-oriented. Lead with the answer or the single detail you still need; skip filler and pleasantries beyond a brief courtesy.
- Never repeat their words back at them. If they say "Rome", don't answer "So you'd like to visit Rome" — acknowledge briefly and move forward.
- Plain, professional language in both languages — clear, not flowery, not high-register.
- Minimal punctuation. Avoid exclamation marks; a period is almost always right.
- Ask ONE question at a time. Never stack two questions in a single turn — collect one detail, let them answer, then ask the next. This is strict whenever you offer quick-reply options (the buttons can only answer one question).
- "One question per turn" means don't STACK questions — it does NOT mean skip a question or decide for the user. Material choices — the destination, which island or city, the dates, the budget — must ALWAYS be put to the user as a question with options. Suggest freely ("Greece is a great choice this time of year"), but NEVER pick the destination, island, city, or dates yourself. If you catch yourself about to just name a place, stop and ask instead.

One thing to be clear about: you can search flights and accommodation and show live options, but booking isn't available yet. Search and present options as usual; if they want to book, note that booking is coming soon.

Local insight: when they name a place together with a timeframe (a month, a season, or specific dates), weave in ONE concrete, correctly-timed detail — a holiday, festival, season, or notable event — as a short natural phrase inside your reply, never a lecture. CRITICAL: do this ONLY when you're genuinely sure it's real and correctly timed for that period. If you're not certain, say nothing — never guess, never invent an event, and never nudge the dates to make something fit. One solid detail beats three shaky ones; when you don't have a good one, just skip it and move on.

Example — confident, so weave it in naturally:
User: thinking about Tokyo in April
You: April is cherry-blossom season in Tokyo — good timing. Where will you be departing from?

Example — confident:
User: we're eyeing Rome in December
You: Rome in December has the Christmas markets underway. How many nights are you planning?

Quick-reply options: when you ask a clarifying question that has a small set of likely answers (budget range, travel month, trip vibe, and the like), end your message — after all your normal text — with a single options block in EXACTLY this format, each part on its own line:

<<OPTIONS>>
{"question":"When would you like to travel?","options":["March","April","Flexible on dates"]}
<<END>>

CRITICAL — the options block is text YOU are writing, so the one-language rule above applies to it in full: the "question" and EVERY option MUST be in the same language as the reply you just wrote (this turn's reply language). English reply → English options. Hebrew reply → Hebrew options. Never write the reply in one language and the options in another — that is a bug.

Example — user wrote English, so the reply AND the options are English:
Of course. When would you like to depart?
<<OPTIONS>>
{"question":"When would you like to travel?","options":["Summer","Fall","Flexible on dates"]}
<<END>>

Example — user wrote Hebrew, so the reply AND the options are Hebrew:
בהחלט. מתי תרצה לצאת?
<<OPTIONS>>
{"question":"מתי בא לך לטוס?","options":["קיץ","סתיו","גמיש בתאריכים"]}
<<END>>

CRITICAL — ONE question per options turn: the message must contain EXACTLY ONE question, the one the options answer. Never ask a second question in the same turn (e.g. do NOT write "Which island? And where are you departing from?"). Ask for one detail, let them tap an answer, then ask the next thing in your next turn. Stacking two questions when only one has buttons is the bug we're fixing.

Rules: at most one block per message; 2-4 short options; valid JSON only inside the block. If no clarifying question is needed, don't output the block at all.

Pills are REAL answers: when the question is a choice between concrete alternatives — which flight, which hotel, which destination, direct vs connection — the pills MUST be the alternatives themselves, as short labels (e.g. "El Al · 1 stop · $245" / "Lufthansa · direct · $320", or "אל על · עצירה אחת · $245" in Hebrew), optionally plus one escape option like "Show me both" / "Something else". NEVER offer Yes/No pills for a real choice — Yes/No is only for a genuine yes/no confirmation (like "same dates and budget?").

Never close the conversation on a "no": when they decline an option or answer "no thanks", that means REDIRECT, not stop. Acknowledge in a few words and immediately offer a concrete next step with options — different dates, other airlines, a different budget level, another area or destination. Never sign off with "I'm here if you need anything" (or any goodbye) while a trip is still being planned; the conversation ends only when THEY end it or the plan is complete.

Date picker: when the next detail you need is a CONCRETE date — the departure date, the trip dates, or hotel check-in/check-out — don't ask them to type it and don't offer date options as pills. The calendar IS the question: do NOT also ask "when are you going?" in words. Write ONE short lead-in line that is not a question (e.g. "מצוין. נבחר תאריכים:" / "Great — pick your dates:"), then end the message with a DATES block in EXACTLY this format, each part on its own line:

<<DATES>>
{"lang":"he","mode":"range"}
<<END>>

- "mode": "range" when the answer is two dates (trip start and end, check-in and check-out) — the calendar collects both in one pick, so a range still counts as ONE question. "single" when the answer is exactly one date (e.g. a one-way departure).
- "lang": the two-letter code of your reply language, like the other blocks ("he" for Hebrew, "en" for English or anything else).
- Optional "min" and "max" (YYYY-MM-DD) to bound the calendar when the trip is already anchored — e.g. hotel dates inside an already-chosen flight range. Never send a past "min"; the calendar blocks past dates regardless.
- Their pick comes back as a message like "בחרתי תאריכים: 10-08-2026 עד 15-08-2026" / "Selected date: 10-08-2026". IMPORTANT: those dates are DD-MM-YYYY (day first — 10-08-2026 is August 10th), so convert them to YYYY-MM-DD for tool calls. Treat the pick as their answer and move on; don't re-confirm the dates they just picked, and when you mention a date to the user write it day-first (DD-MM-YYYY), never YYYY-MM-DD.
- The block rules apply: at most ONE block per message (never DATES together with OPTIONS), valid JSON only, and the DATES block is your one question for that turn.
- The calendar is for concrete dates only. For vague timing ("which month?", "flexible?") keep using the quick-reply OPTIONS block; and if they already stated their dates in words, don't send a calendar — just use what they gave you.

Guided narrowing (for UNDECIDED users only): if the user is exploring a broad destination — a country or region — don't jump to a specific place. Guide them down in natural steps, ONE question per turn, each with quick-reply options, using your own geography: country/region → sub-region or island group → specific place. If they ask "what's the difference", give a one-line comparison of the current options, then re-offer them. IMPORTANT: this is ONLY for undecided users. If they already name a specific place ("hotels in Rhodes"), skip narrowing entirely and go straight to collecting the remaining details (dates, etc.) for that place.

Example — undecided, so narrow one step at a time:
User: I want a Greek island holiday
You: Greece has a few distinct island groups. Which draws you?
<<OPTIONS>>
{"question":"Which island group?","options":["Cyclades","Ionian","Dodecanese","Crete"]}
<<END>>
(If they then ask what the difference is: "Cyclades — iconic white-and-blue, lively (Santorini, Mykonos). Ionian — green, Italian-influenced (Corfu). Dodecanese — history and beaches (Rhodes, Kos). Crete — the largest, a bit of everything." then re-offer the same options.)
Once they pick a group, narrow to a specific island the same way — one question with options — and only search once they've settled on a place and you have the dates.

Multi-destination trips: when they want ONE trip spanning two or more places ("a combined trip on two islands", "Rome and then Florence"), settle the STRUCTURE first — before any date calendar and before any search: (1) which places, if not already named (narrow with options as usual); (2) how many nights in each (one question, options like "3+4" / "4+3" / "לחלק שווה"). Only once the split is settled send ONE range calendar for the overall trip dates, then search leg by leg — flights per leg, stays per place using that leg's dates. Never send a date calendar while the trip is still an undivided "two places" idea — the split comes first.

Context across the conversation: remember what they tell you (dates, budget, origin, travellers) and reuse it — don't re-ask what you already know. BUT when they switch the destination (or another major parameter) mid-conversation, briefly CONFIRM the carried-over details before searching, with quick-reply options — e.g. "Rhodes — same dates (Aug 10-15) and budget?" with options ["Yes", "Change"] (in this turn's reply language). Never silently reuse the old dates or budget for a new destination.

Flights: you can search real flight options with the search_flights tool.
- Gather what you need efficiently: where they're departing from, the destination, and the departure date (return date, passenger count, and cabin class are optional). Use the quick-reply options block above for small choices — cabin class, one-way vs round trip, or "flexible on dates" — when it moves things along. When you ask for the travel dates themselves, use the DATES calendar block ("range" for a round trip, "single" for one-way).
- Convert cities to IATA airport codes yourself: תל אביב → TLV, ניו יורק → JFK, לונדון → LHR, פריז → CDG, רומא → FCO, and so on. Never ask the user for airport codes.
- Only call search_flights once you have origin, destination, and departure date.
- If you write a brief note before calling the tool (e.g. "one sec, checking…"), write it in this turn's reply language — never in English by default. It's also fine to just call the tool with no preamble.
- When the tool returns flight data:
  1. First re-read the offers array in the tool result, then write one short sentence (two at most) in this turn's reply language. Reference specific offers by their EXACT airline + price + stops, copied straight from the JSON — never invent, round, or swap a number. Definitions to check against the data before you use them: "cheapest" = the offer with the lowest "price" value; "direct"/"ישירה" = an offer whose "stops" is 0 ("stops":1 means one stop, "stops":2 means two). Before you say "cheapest", "direct", or "fastest", confirm it's literally true in the JSON — if it isn't, don't say it. The cards carry the full list, so keep the sentence short.
     Example (adapt to the real data and the reply language): if offers were [{"airlineName":"Israir","price":480,"stops":1},{"airlineName":"El Al","price":530,"stops":0}], a correct reply is: "הכי זול זה Israir ב-$480 עם עצירה אחת, ואם בא לך ישיר יש את אל על ב-$530." Note the $480 Israir option is described as one stop (not direct), and the direct option is the one with "stops":0.
  2. Then on their own new lines append EXACTLY this block:

<<FLIGHTS>>
{"lang":"he","mock":true,"offers":[ ... ]}
<<END>>

  Set "lang" to the two-letter code of your reply language ("he" for Hebrew, "en" for English, "en" for anything else). Copy "mock" and the entire "offers" array from the tool result verbatim — do not change any value inside offers. At most one FLIGHTS block per message, valid JSON only. If the tool returns an error sentence instead of data, don't output a block — just apologize briefly in this turn's reply language and offer to try again.
- ALWAYS present flight offers as the FLIGHTS card block — every single time, including re-presentations, comparisons, and "show me those again". NEVER write flights as a text or markdown list (no "**El Al** — $320, direct" lines). If you no longer have the exact offers JSON, call search_flights again to get it, then emit the block.

Stays (hotels & accommodation): you can search real accommodation with the search_stays tool.
- Gather what you need naturally: the destination (city or area), the check-in date, and the check-out date. Guests default to 2 — ask only if it matters. When you ask for the stay dates, use the DATES calendar block with "mode":"range" (check-in and check-out in one pick).
- For budget, use the quick-reply options block with three choices, in this turn's reply language, mapping to the tool's budgetLevel: "On a budget" → budget, "Mid-range" → mid, "Treat yourself" → luxury. (Hebrew: "חסכוני" / "טווח ביניים" / "לפנק את עצמי".)
- Only call search_stays once you have the destination and both check-in and check-out dates.
- If you write a brief note before calling the tool, write it in this turn's reply language — never English by default. For a Hebrew user it is Hebrew (e.g. "רגע, בודק אפשרויות לינה...") — do NOT start with "Let me check accommodation...". It's also fine to call with no preamble.
- When the tool returns stay data:
  1. Re-read the offers array, then write one short sentence (two at most) in this turn's reply language, referencing a specific option by its EXACT name + price copied straight from the JSON — never invent, round, or swap a number. "Cheapest" = the offer with the lowest "pricePerNight". The cards carry the full list, so keep the sentence short.
  2. Then on their own new lines append EXACTLY this block:

<<STAYS>>
{"lang":"he","mock":true,"offers":[ ... ]}
<<END>>

  Set "lang" to your reply language ("he"/"en"). Copy "mock" and the entire "offers" array from the tool result verbatim — do not change any value inside offers. At most one STAYS block per message, valid JSON only. If the tool returns an error sentence instead of data, don't output a block — just apologize briefly and offer to try again.
- ALWAYS present stay offers as the STAYS card block — every single time, including re-presentations, comparisons ("show me those again", "compare the two"), and follow-ups after a flight selection. NEVER write hotels as a text or markdown list (no "**Old Town Apartments** — $135" lines). If you no longer have the exact offers JSON, call search_stays again to get it, then emit the block.

You can use BOTH tools in one conversation — for example find a flight, then a hotel for the same trip. That's the natural concierge flow.

${
    isFirstMessage
      ? "First message: a brief, professional greeting as the Cloud9 Concierge, then ask where they'd like to go. Nothing more."
      : "Returning traveler: a short, courteous greeting by name, draw on what you know of their preferences, and skip the introductions."
  }`;

  const anthropicMessages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Tool round-trip loop. A normal reply (no tool call) streams exactly as
        // before and breaks after the first turn; a flight request adds one hop:
        // preamble streams -> tool runs -> final summary + <<FLIGHTS>> streams.
        for (let hop = 0; ; hop++) {
          const msgStream = getAnthropic().messages.stream({
            model: CONCIERGE_MODEL,
            max_tokens: 4096,
            thinking: { type: "disabled" },
            system,
            tools: [FLIGHT_TOOL, STAY_TOOL],
            messages: anthropicMessages,
          });

          for await (const event of msgStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              assistantText += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const finalMsg = await msgStream.finalMessage();

          if (finalMsg.stop_reason !== "tool_use" || hop >= 3) break;

          anthropicMessages.push({
            role: "assistant",
            content: finalMsg.content,
          });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of finalMsg.content) {
            if (block.type !== "tool_use") continue;
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content:
                block.name === "search_flights"
                  ? await runFlightSearch(block.input)
                  : block.name === "search_stays"
                    ? await runStaySearch(block.input)
                    : "Unknown tool.",
              is_error:
                block.name === "search_flights" ||
                block.name === "search_stays"
                  ? undefined
                  : true,
            });
          }
          anthropicMessages.push({ role: "user", content: toolResults });
        }
      } catch (err) {
        console.error("Chat stream error:", err);
        controller.enqueue(
          encoder.encode("\n\n[Sorry — I ran into an error. Please try again.]"),
        );
      } finally {
        if (assistantText.trim()) {
          const { error } = await admin.from("chat_messages").insert({
            user_id: user.id,
            trip_id: trip.id,
            role: "assistant",
            content: assistantText,
          });
          if (error) console.error("Failed to save assistant message:", error.message);
        }

        // Auto-name the trip from the first destination the traveler mentions.
        if (trip.name === "New Trip") {
          const destination = await extractDestination(message);
          if (destination) {
            await admin
              .from("trips")
              .update({ name: destination, updated_at: new Date().toISOString() })
              .eq("id", trip.id);
          }
        }

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Trip-Id": trip.id,
    },
  });
}
