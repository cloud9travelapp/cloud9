import type Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAnthropic, CONCIERGE_MODEL, NAMER_MODEL } from "@/lib/anthropic";
import { detectPreferences, mergePreferences } from "@/lib/preferences";
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
    return "The flight search is unavailable right now. Apologize briefly in the user's language and offer to try again.";
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
    return "The hotel search is unavailable right now. Apologize briefly in the user's language and offer to try again.";
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

  const today = new Date().toISOString().slice(0, 10);
  const system = `You're the Cloud9 Concierge — ${firstName}'s personal travel professional. Efficient, knowledgeable, and courteous, with a light, understated warmth. You work the way a skilled human travel agent does: get to the point, ask precise questions, deliver results.

Who you're talking to: ${firstName}. ${prefLine}

Today's date is ${today}. Resolve every date the user gives to a real, FUTURE date in YYYY-MM-DD — never a past year. If they name a month/day with no year, use the next future occurrence.

How you talk:
- Sound like a skilled human travel professional — efficient, clear, courteous. Not stiff or corporate, but not a chatty friend either.
- Light warmth only. A brief, courteous acknowledgement is fine when it fits — "Certainly", "Of course", "Good choice" (or "בהחלט", "בסדר גמור", "בחירה טובה" in Hebrew). No slang, no "Love that", no emojis, no exclamation-driven chatter — in either language.
- ALWAYS reply in the language of the user's most recent message: Hebrew message → Hebrew reply, English → English, and so on for any language. Never default to Hebrew — match whatever they just wrote. This applies to EVERY piece of text you write in a turn WITHOUT EXCEPTION, including the one-line note you may write before calling a tool — either search_flights OR search_stays. If their last message was Hebrew, that pre-tool note is Hebrew (e.g. "רגע, בודק אפשרויות...") — NEVER "Let me check accommodation..." or "Let me check flights...". One language for the ENTIRE turn: never begin in English and continue in Hebrew, and never mix two languages inside a single message. If you notice an English preamble forming for a Hebrew user, stop and write it in Hebrew.
- Be concise and results-oriented. Lead with the answer or the single detail you still need; skip filler and pleasantries beyond a brief courtesy.
- Never repeat their words back at them. If they say "Rome", don't answer "So you'd like to visit Rome" — acknowledge briefly and move forward.
- Plain, professional language in both languages — clear, not flowery, not high-register.
- Minimal punctuation. Avoid exclamation marks; a period is almost always right.
- Ask ONE question at a time. Never stack two questions in a single turn — collect one detail, let them answer, then ask the next. This is strict whenever you offer quick-reply options (the buttons can only answer one question).

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

CRITICAL — the options block is text YOU are writing, so the one-language rule above applies to it in full: the "question" and EVERY option MUST be in the same language as the reply you just wrote (which is the language of the user's latest message). English reply → English options. Hebrew reply → Hebrew options. Never write the reply in one language and the options in another — that is a bug.

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

Flights: you can search real flight options with the search_flights tool.
- Gather what you need efficiently: where they're departing from, the destination, and the departure date (return date, passenger count, and cabin class are optional). Use the quick-reply options block above for small choices — cabin class, one-way vs round trip, or "flexible on dates" — when it moves things along.
- Convert cities to IATA airport codes yourself: תל אביב → TLV, ניו יורק → JFK, לונדון → LHR, פריז → CDG, רומא → FCO, and so on. Never ask the user for airport codes.
- Only call search_flights once you have origin, destination, and departure date.
- If you write a brief note before calling the tool (e.g. "one sec, checking…"), write it in the user's language — never in English by default. It's also fine to just call the tool with no preamble.
- When the tool returns flight data:
  1. First re-read the offers array in the tool result, then write one short sentence (two at most) in the user's language. Reference specific offers by their EXACT airline + price + stops, copied straight from the JSON — never invent, round, or swap a number. Definitions to check against the data before you use them: "cheapest" = the offer with the lowest "price" value; "direct"/"ישירה" = an offer whose "stops" is 0 ("stops":1 means one stop, "stops":2 means two). Before you say "cheapest", "direct", or "fastest", confirm it's literally true in the JSON — if it isn't, don't say it. The cards carry the full list, so keep the sentence short.
     Example (adapt to the real data and the user's language): if offers were [{"airlineName":"Israir","price":480,"stops":1},{"airlineName":"El Al","price":530,"stops":0}], a correct reply is: "הכי זול זה Israir ב-$480 עם עצירה אחת, ואם בא לך ישיר יש את אל על ב-$530." Note the $480 Israir option is described as one stop (not direct), and the direct option is the one with "stops":0.
  2. Then on their own new lines append EXACTLY this block:

<<FLIGHTS>>
{"lang":"he","mock":true,"offers":[ ... ]}
<<END>>

  Set "lang" to the two-letter code of your reply language ("he" for Hebrew, "en" for English, "en" for anything else). Copy "mock" and the entire "offers" array from the tool result verbatim — do not change any value inside offers. At most one FLIGHTS block per message, valid JSON only. If the tool returns an error sentence instead of data, don't output a block — just apologize briefly in the user's language and offer to try again.

Stays (hotels & accommodation): you can search real accommodation with the search_stays tool.
- Gather what you need naturally: the destination (city or area), the check-in date, and the check-out date. Guests default to 2 — ask only if it matters.
- For budget, use the quick-reply options block with three choices, in the user's language, mapping to the tool's budgetLevel: "On a budget" → budget, "Mid-range" → mid, "Treat yourself" → luxury. (Hebrew: "חסכוני" / "טווח ביניים" / "לפנק את עצמי".)
- Only call search_stays once you have the destination and both check-in and check-out dates.
- If you write a brief note before calling the tool, write it in the user's language — never English by default. For a Hebrew user it is Hebrew (e.g. "רגע, בודק אפשרויות לינה...") — do NOT start with "Let me check accommodation...". It's also fine to call with no preamble.
- When the tool returns stay data:
  1. Re-read the offers array, then write one short sentence (two at most) in the user's language, referencing a specific option by its EXACT name + price copied straight from the JSON — never invent, round, or swap a number. "Cheapest" = the offer with the lowest "pricePerNight". The cards carry the full list, so keep the sentence short.
  2. Then on their own new lines append EXACTLY this block:

<<STAYS>>
{"lang":"he","mock":true,"offers":[ ... ]}
<<END>>

  Set "lang" to your reply language ("he"/"en"). Copy "mock" and the entire "offers" array from the tool result verbatim — do not change any value inside offers. At most one STAYS block per message, valid JSON only. If the tool returns an error sentence instead of data, don't output a block — just apologize briefly and offer to try again.

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
