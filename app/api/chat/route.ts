import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAnthropic, CONCIERGE_MODEL, NAMER_MODEL } from "@/lib/anthropic";
import { getStayDetail } from "@/lib/stays/detail";
import { detectReplyLanguage } from "@/lib/language";
import { sanitizeTripTitle } from "@/lib/trip-title";
import { logDiag } from "@/lib/diag";
import { searchFlights, IS_MOCK_PROVIDER } from "@/lib/flights/provider";
import type { FlightQuery } from "@/lib/flights/types";
import { searchStays, IS_MOCK_STAY_PROVIDER } from "@/lib/stays/provider";
import type { StayQuery } from "@/lib/stays/types";

// Give the streamed Concierge reply headroom past Vercel's 10s default so long
// responses aren't cut off mid-stream in production.
export const maxDuration = 60;

type ChatRow = { role: "user" | "assistant"; content: string };

/**
 * Ask a cheap model for an updated trip title covering ALL of the trip's
 * destinations ("Japan & Korea"), given the current title and the traveler's
 * recent message(s) — or null when nothing should change (it answers KEEP).
 */
async function deriveTripTitle(
  currentTitle: string,
  signal: string,
): Promise<string | null> {
  try {
    const res = await getAnthropic().messages.create({
      model: NAMER_MODEL,
      max_tokens: 24,
      system:
        'You title travel trips. Given a trip\'s current title and the traveler\'s recent message(s), reply with ONLY the updated title for the trip\'s destinations, in English. Each destination is its SHORTEST natural name — "Budva" or "Montenegro", NEVER both and never any "City, Country" form; prefer the form the traveler used. One destination: its name ("Greece"). Two: both names joined by " & " ("Zagreb & Ljubljana"). Three or more: a natural regional name when one clearly covers them ("Balkan Trip", "Scandinavia"); otherwise the first two names + " & more" ("Zagreb, Ljubljana & more") — no commas anywhere else. A destination is a place the traveler STAYS or VISITS. The departure/origin city ("טיסה מתל אביב ל...", "flying from London") is NEVER a destination and NEVER appears in the title, no matter how often it is mentioned. Keep destinations already in the current title unless the traveler drops or replaces them; add newly chosen ones. Use country names for international multi-city trips, city names otherwise. Reply with exactly KEEP only when the message(s) neither name a trip destination missing from the current title nor change the existing ones.',
      messages: [
        {
          role: "user",
          content: `Current title: ${currentTitle}\nTraveler's recent message(s):\n${signal}`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    return sanitizeTripTitle(text);
  } catch (err) {
    console.error("Trip titling failed:", err);
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
    "Search for hotels and accommodation in a destination. Only call this once you know the destination (city or area), the check-in date, and the check-out date. ALWAYS include the destination's latitude and longitude — you know city coordinates; never ask the user for them.",
  input_schema: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        description: "City or area name, e.g. Rome",
      },
      latitude: {
        type: "number",
        description: "Latitude of the destination's center, e.g. 41.9028 for Rome",
      },
      longitude: {
        type: "number",
        description: "Longitude of the destination's center, e.g. 12.4964 for Rome",
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
      distanceFilter: {
        type: "string",
        enum: ["near", "any"],
        description:
          '"near" (default) prefers offers close to the searched point. Pass "any" ONLY when the user explicitly wants outskirts or says distance does not matter.',
      },
    },
    required: ["destination", "checkIn", "checkOut"],
  },
};

const HOTEL_DETAILS_TOOL: Anthropic.Tool = {
  name: "get_hotel_details",
  description:
    'Fetch a searched hotel\'s details — rooms with prices and board options, amenities, description, address — by its offer "id" from a previous search_stays result. Use whenever the user asks about rooms, room differences, amenities, or the hotel itself. NEVER answer such questions from memory.',
  input_schema: {
    type: "object",
    properties: {
      hotelId: {
        type: "string",
        description: 'The offer "id" from a search_stays result, e.g. "hb-12345"',
      },
    },
    required: ["hotelId"],
  },
};

/** Run a get_hotel_details call — compact JSON for the model (image URLs are
 *  useless in context; the modal shows them). */
async function runHotelDetails(input: unknown): Promise<string> {
  try {
    const q = (input ?? {}) as { hotelId?: unknown };
    const hotelId = typeof q.hotelId === "string" ? q.hotelId.trim() : "";
    if (!hotelId) {
      return "Invalid request: hotelId is required (the offer id from search_stays).";
    }
    const { images, ...detail } = await getStayDetail(hotelId);
    return JSON.stringify({ ...detail, imageCount: images.length });
  } catch (err) {
    console.error("Hotel details failed:", err);
    await logDiag("hotel_details_error", { message: String(err).slice(0, 300) });
    return "Hotel details are unavailable right now.";
  }
}

const PREFERENCE_TOOL: Anthropic.Tool = {
  name: "remember_preference",
  description:
    'Record a preference the traveler EXPLICITLY stated or confirmed — never one you inferred. scope "stable" = person-level, true across trips ("dislikes huge hotels", "needs reliable wifi"). scope "trip" = this trip only (budget level, central-vs-quiet this time, resort mood). When unsure, use "trip".',
  input_schema: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["stable", "trip"] },
      preference: {
        type: "string",
        description: "Short plain-language statement in English, max ~80 chars",
      },
    },
    required: ["scope", "preference"],
  },
};

/**
 * Persist an explicitly-stated preference: stable → users.preferences
 * (person-level, crosses trips), trip → trips.preferences (dies with the
 * trip). Degrades gracefully if the trips.preferences column isn't migrated
 * yet — the chat continues either way.
 */
async function rememberPreference(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  tripId: string,
  input: unknown,
): Promise<string> {
  try {
    const q = (input ?? {}) as { scope?: unknown; preference?: unknown };
    const pref =
      typeof q.preference === "string" ? q.preference.trim().slice(0, 120) : "";
    if (!pref) return "Nothing to save: empty preference.";
    const table = q.scope === "stable" ? "users" : "trips";
    const id = q.scope === "stable" ? userId : tripId;
    const { data } = await admin
      .from(table)
      .select("preferences")
      .eq("id", id)
      .single();
    const existing: string[] = Array.isArray(
      (data as { preferences?: unknown } | null)?.preferences,
    )
      ? ((data as { preferences: string[] }).preferences)
      : [];
    if (!existing.includes(pref)) {
      const { error } = await admin
        .from(table)
        .update({ preferences: [...existing, pref] })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    return q.scope === "stable"
      ? "Saved as a stable preference."
      : "Saved for this trip.";
  } catch (err) {
    console.error("remember_preference failed:", err);
    return "Could not save the preference — continue without it.";
  }
}

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
    await logDiag("flight_search_error", { message: String(err).slice(0, 300) });
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
      latitude: typeof q.latitude === "number" ? q.latitude : undefined,
      longitude: typeof q.longitude === "number" ? q.longitude : undefined,
      distanceFilter: q.distanceFilter === "any" ? "any" : undefined,
    };
    if (
      !query.destination ||
      !/^\d{4}-\d{2}-\d{2}$/.test(query.checkIn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(query.checkOut)
    ) {
      return "Invalid search: need a destination and both check-in and check-out dates as YYYY-MM-DD.";
    }
    const results = await withTimeout(searchStays(query), 15000);
    // A worth-it deal rides the array marked with .deal — split it out so the
    // cards never include it silently; the model OFFERS it (teaser sentence).
    const deal = results.find((o) => o.deal);
    const offers = results.filter((o) => !o.deal);
    // A real provider can hand back mock offers (daily quota guard); their
    // "mock-" ids re-label the cards as test data so the fallback stays honest.
    const mock =
      IS_MOCK_STAY_PROVIDER ||
      (results.length > 0 && results.every((o) => o.id.startsWith("mock-")));
    return JSON.stringify({ mock, offers, ...(deal ? { deal } : {}) });
  } catch (err) {
    console.error("Stay search failed:", err);
    await logDiag("stay_search_error", { message: String(err).slice(0, 300) });
    if (err instanceof Error && err.message.includes("latitude")) {
      return "Invalid search: include the destination's latitude and longitude in the tool call and try again.";
    }
    return "The hotel search is unavailable right now. Apologize briefly in this turn's reply language and offer to try again.";
  }
}

export async function POST(request: Request) {
  const t0 = Date.now();
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
  // start a fresh one for a brand-new conversation. For an existing trip, the
  // ownership check and the history load are independent — run them in
  // parallel (history is only USED after the ownership check passes). History
  // = the LATEST 40 messages, fetched newest-first and flipped back to
  // chronological (taking the oldest 40 was the silent "context bleed"). A
  // brand-new trip has no history, so that path skips the query entirely.
  let trip: { id: string; name: string };
  let history: ChatRow[];
  let tripPrefs: string[] = [];
  if (rawTripId) {
    const [tripRes, historyRes, prefsRes] = await Promise.all([
      admin
        .from("trips")
        .select("id, name")
        .eq("id", rawTripId)
        .eq("user_id", user.id)
        .single(),
      admin
        .from("chat_messages")
        .select("role, content")
        .eq("trip_id", rawTripId)
        .order("created_at", { ascending: false })
        .limit(40),
      // Best-effort: errors (e.g. column not migrated yet) yield [].
      admin.from("trips").select("preferences").eq("id", rawTripId).single(),
    ]);
    if (!tripRes.data) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }
    trip = tripRes.data;
    history = ((historyRes.data ?? []) as ChatRow[]).reverse();
    const rawPrefs = (prefsRes.data as { preferences?: unknown } | null)
      ?.preferences;
    tripPrefs = Array.isArray(rawPrefs)
      ? rawPrefs.filter((p): p is string => typeof p === "string")
      : [];
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
    history = [];
  }

  const isFirstMessage = history.length === 0;

  // Save the user's message before we start generating. (Preferences are no
  // longer keyword-scraped from messages — ask-don't-assume: the concierge
  // records only what the user explicitly states, via remember_preference.)
  await admin.from("chat_messages").insert({
    user_id: user.id,
    trip_id: trip.id,
    role: "user",
    content: message,
  });

  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";
  const stablePrefs: string[] = Array.isArray(user.preferences)
    ? (user.preferences as string[])
    : [];
  const prefLine = stablePrefs.length
    ? `Known travel preferences: ${stablePrefs.join(", ")}.`
    : "No saved preferences yet.";

  // The reply language is decided HERE, deterministically, once per turn —
  // never re-inferred by the model (see lib/language.ts for the policy).
  const replyLang = detectReplyLanguage(message, history);
  // For non-Hebrew turns the directive quotes the message verbatim and makes
  // English the deterministic fallback, so a one-word message ("Flight") in a
  // Hebrew-heavy context can't be pulled back to Hebrew by momentum.
  const quotedMessage =
    message.length > 80 ? `${message.slice(0, 80)}…` : message;
  const langDirective =
    replyLang === "he"
      ? "Hebrew"
      : `the language of the traveler's latest message — NOT Hebrew. Their message: «${quotedMessage}». If that message is English, or you cannot tell which language it is, write English`;

  const today = new Date().toISOString().slice(0, 10);
  // The static block is byte-identical across a user's turns (and across the
  // hops of one turn), so it — plus the tool definitions before it — is served
  // from the Anthropic prompt cache; only the small dynamic tail below is
  // reprocessed each turn. Per-turn text must NEVER be added here.
  const systemStatic = `You're the Cloud9 Concierge — ${firstName}'s personal travel professional. Efficient, knowledgeable, and courteous, with a light, understated warmth. You work the way a skilled human travel agent does: get to the point, ask precise questions, deliver results.

Who you're talking to: ${firstName}. ${prefLine}

Today's date is ${today}. Resolve every date the user gives to a real, FUTURE date in YYYY-MM-DD — never a past year. If they name a month/day with no year, use the next future occurrence.
When their dates arrive as a RELATIVE phrase ("שני עד שישי שבוע הבא", "next weekend"), your next message must STATE the resolved dates inline — day-first with the night count ("27-07 עד 31-07, 4 לילות") — folded into whatever you were about to say (usually the budget question). A statement, not a question: they see the resolution and can object, with zero added friction. Ask a confirming question ONLY when the phrase is genuinely ambiguous ("סופ״ש הקרוב" said on a weekend, "בחגים") — and then with options, not open-ended.

How you talk:
- Sound like a skilled human travel professional — efficient, clear, courteous. Not stiff or corporate, but not a chatty friend either.
- Light warmth only. A brief, courteous acknowledgement is fine when it fits — "Certainly", "Of course", "Good choice" (or "בהחלט", "בסדר גמור", "בחירה טובה" in Hebrew). No slang, no "Love that", no emojis, no exclamation-driven chatter — in either language.
- Be concise and results-oriented. Lead with the answer or the single detail you still need; skip filler and pleasantries beyond a brief courtesy.
- Never repeat their words back at them. If they say "Rome", don't answer "So you'd like to visit Rome" — acknowledge briefly and move forward.
- Plain, professional language in both languages — clear, not flowery, not high-register.
- Minimal punctuation. Avoid exclamation marks; a period is almost always right.
- Hebrew writing: normative spelling (באזור, not באיזור) and ALWAYS a space after a period. When naming a non-famous neighborhood or district, prefix a classifier word — "שכונת ברצלונטה", "רובע Eixample", "אזור Navigli" — so an unfamiliar name can't read as a typo; famous areas (מונמארטר, סוהו) need none.
- Ask ONE question at a time. Never stack two questions in a single turn — collect one detail, let them answer, then ask the next. This is strict whenever you offer quick-reply options (the buttons can only answer one question).
- "One question per turn" means don't STACK questions — it does NOT mean skip a question or decide for the user. Material choices — the destination, which island or city, the dates, the budget — must ALWAYS be put to the user as a question with options. Suggest freely ("Greece is a great choice this time of year"), but NEVER pick the destination, island, city, or dates yourself. If you catch yourself about to just name a place, stop and ask instead.
- Open door: every consultation question (budget, area, and the like) ends with ONE short standing-invitation STATEMENT — e.g. "ואם משהו חשוב לכם — אזור, אווירה, נוף — ספרו לי ואתחשב". It is a statement, not a question: it gets no pills, doesn't count toward the one-question law, and stays brief with varied phrasing. When they answer it in free text, fold what they said into the search and the preference rules.

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

Rules: at most one block per message; 2-4 short options; valid JSON only inside the block. If no clarifying question is needed, don't output the block at all. The "question" field inside the block is metadata — the user NEVER sees it. The question itself must appear in your visible message text before the block; pills without a visible question are a bug.

Pills are REAL answers: when the question is a choice between concrete alternatives — which flight, which hotel, which destination, direct vs connection — the pills MUST be the alternatives themselves, as short labels (e.g. "El Al · 1 stop · $245" / "Lufthansa · direct · $320", or "אל על · עצירה אחת · $245" in Hebrew), optionally plus one escape option like "Show me both" / "Something else". NEVER offer Yes/No pills for a real choice — Yes/No is only for a genuine yes/no confirmation (like "same dates and budget?").

Never close the conversation on a "no": when they decline an option or answer "no thanks", that means REDIRECT, not stop. Acknowledge in a few words and immediately offer a concrete next step with options — different dates, other airlines, a different budget level, another area or destination. Never sign off with "I'm here if you need anything" (or any goodbye) while a trip is still being planned; the conversation ends only when THEY end it or the plan is complete.

Date picker: when the next detail you need is a CONCRETE date — the departure date, the trip dates, or hotel check-in/check-out — don't ask them to type it and don't offer date options as pills. The calendar IS the question: do NOT also ask "when are you going?" in words. Write ONE short lead-in line that is not a question (e.g. "מצוין. נבחר תאריכים:" / "Great — pick your dates:"), then end the message with a DATES block in EXACTLY this format, each part on its own line:

<<DATES>>
{"lang":"he","mode":"range"}
<<END>>

- "mode": "range" when the answer is two dates (trip start and end, check-in and check-out) — the calendar collects both in one pick, so a range still counts as ONE question. "single" when the answer is exactly one date (e.g. a one-way departure).
- "lang": the two-letter code of your reply language, like the other blocks ("he" for Hebrew, "en" for English or anything else).
- Optional "min" and "max" (YYYY-MM-DD) to bound the calendar when the trip is already anchored — e.g. hotel dates inside an already-chosen flight range. Never send a past "min"; the calendar blocks past dates regardless.
- Their pick comes back as a message like "בחרתי תאריכים: 10-08-2026 עד 15-08-2026 (5 לילות)" / "Selected date: 10-08-2026". IMPORTANT: those dates are DD-MM-YYYY (day first — 10-08-2026 is August 10th), so convert them to YYYY-MM-DD for tool calls. Treat the pick as their answer and move on; don't re-confirm the dates they just picked, and when you mention a date to the user write it day-first (DD-MM-YYYY), never YYYY-MM-DD.
- CROSS-CHECK the night count: a range pick includes its night count. If they stated a trip length earlier in the conversation (e.g. "12 nights", "שבועיים") and the picked range disagrees, do NOT proceed silently — point out the mismatch in one sentence and ask which is right, with options (e.g. "13 לילות זה נכון" / "לתקן את התאריכים"). If they never stated a length, there's nothing to check — move on.
- The block rules apply: at most ONE block per message (never DATES together with OPTIONS), valid JSON only, and the DATES block is your one question for that turn.
- The calendar is for concrete dates only. For vague timing ("which month?", "flexible?") keep using the quick-reply OPTIONS block; and if they already stated their dates in words, don't send a calendar — just use what they gave you.

Guided narrowing (for UNDECIDED users only): if the user is exploring a broad destination — a country or region — don't jump to a specific place. Guide them down in natural steps, ONE question per turn, each with quick-reply options, using your own geography: country/region → sub-region or island group → specific place. In EVERY narrowing question, make the last option an escape hatch — "כיוון אחר" / "Something different" — so they can bail out of the direction you're suggesting; if they tap it, zoom back out and ask what draws them instead (beach, city, nature — or another region entirely), never re-offer the same list. If they ask "what's the difference", give a one-line comparison of the current options, then re-offer them. IMPORTANT: this is ONLY for undecided users. If they already name a specific place ("hotels in Rhodes"), skip narrowing entirely and go straight to collecting the remaining details (dates, etc.) for that place.

Example — undecided, so narrow one step at a time:
User: I want a Greek island holiday
You: Greece has a few distinct island groups. Which draws you?
<<OPTIONS>>
{"question":"Which island group?","options":["Cyclades","Ionian","Crete","Something different"]}
<<END>>
(If they then ask what the difference is: "Cyclades — iconic white-and-blue, lively (Santorini, Mykonos). Ionian — green, Italian-influenced (Corfu). Crete — the largest, a bit of everything." then re-offer the same options.)
Once they pick a group, narrow to a specific island the same way — one question with options — and only search once they've settled on a place and you have the dates.

Multi-destination trips: when they want ONE trip spanning two or more places ("a combined trip on two islands", "Rome and then Florence"), settle the STRUCTURE first — before any date calendar and before any search: (1) which places, if not already named (narrow with options as usual); (2) how many nights in each (one question, options like "3+4" / "4+3" / "לחלק שווה"). Only once the split is settled send ONE range calendar for the overall trip dates, then search leg by leg — flights per leg, stays per place using that leg's dates. Never send a date calendar while the trip is still an undivided "two places" idea — the split comes first.
CRITICAL — one leg at a time: you can present only ONE set of offers per message, so never run stay searches for two places in the same turn. Search the first place, present its cards, let them pick, and only then move to the next place. Batching legs forces offers into text, which is forbidden.

Track the open pieces of the trip: at every point, know what's still missing to complete the plan — outbound flight, return flight, and a stay for each place (each leg, on a multi-destination trip). When the user defers a piece ("not yet", "flights later"), respect it and continue with what they want — but the piece stays OPEN, not forgotten: once the current step is settled, circle back to the next open piece yourself ("נשאר לסגור טיסה הלוך — נבדוק עכשיו?" with options). TIMING: never circle back in the same message as offer cards — the offers own that message; raise the next open piece in your NEXT turn, after they react. Never treat the plan as finished while something is missing: any wrap-up or summary must distinguish what's booked-ready from what's still open, and end by offering to close the next gap — never with a goodbye over a plan with holes.

Second thoughts about a picked offer (any phrasing — "אני מתחרט", "לא בטוח לגבי המלון", "show me other options"): that choice REOPENS — the old selection is replaced, not still standing, and later summaries never mention the abandoned offer as if it holds. Don't just re-show the same list, and don't read regret as quitting the planning. FIRST ask ONE sharp clarifying question with options carrying real dimensions, folding the AREA SCOPE into the same options (e.g. "המחיר" / "המיקום — לנסות אזור אחר" / "משהו אחר") — still one question. If their answer doesn't touch area (price, vibe), re-search the SAME area and say so in passing ("נשארתי באותו אזור"). THEN search again with the refined preference and present fresh cards. What you learn is a STANDING preference for the rest of this trip ("wants a pool", "closer to the beach", "cheaper") — apply it to every later search without being asked again. Their screen no longer shows old cards: if they ask what the options were ("מה היו האופציות?"), run the search again and present cards — never recite remembered offers in text.

Preferences — ask, don't assume: NEVER conclude a preference from indirect signals (a single choice, tone, what they didn't say). When a preference seems likely but wasn't stated, ask ONE clarifying question with options. Only what they explicitly state or confirm counts as known. A known preference is the STARTING POINT OF A QUESTION, never a silent filter: "בטיולים קודמים העדפת מלונות קטנים — גם הפעם?" — they confirm or change it, and their answer wins. This applies doubly to anything carried across trips.
Recording: when they explicitly state or confirm a preference, save it with the remember_preference tool — silently: no announcement, and NO text of any kind alongside the tool call itself (your user-facing reply comes after the tool result). scope "stable" ONLY for person-level truths stated as general ("אני תמיד...", "אני שונא מלונות ענקיים") — these follow the traveler to future trips and appear in your profile line. scope "trip" for this trip's context (budget level, central vs quiet this time, resort mood) and for regret-flow learnings, unless they say it's general. When unsure — "trip". Never record an inference. This trip's stated preferences, when any, appear at the end of these instructions.

Context across the conversation: remember what they tell you (dates, budget, origin, travellers) and reuse it — don't re-ask what you already know. BUT when they switch the destination (or another major parameter) mid-conversation, briefly CONFIRM the carried-over details before searching, with quick-reply options — e.g. "Rhodes — same dates (Aug 10-15) and budget?" with options ["Yes", "Change"] (in this turn's reply language). Never silently reuse the old dates or budget for a new destination.

Flights: you can search real flight options with the search_flights tool.
- Gather what you need efficiently: where they're departing from, the destination, and the departure date (return date, passenger count, and cabin class are optional). Use the quick-reply options block above for small choices — cabin class, one-way vs round trip, or "flexible on dates" — when it moves things along. When you ask for the travel dates themselves, use the DATES calendar block ("range" for a round trip, "single" for one-way).
- Convert cities to IATA airport codes yourself: תל אביב → TLV, ניו יורק → JFK, לונדון → LHR, פריז → CDG, רומא → FCO, and so on. Never ask the user for airport codes.
- Only call search_flights once you have origin, destination, and departure date.
- If you write a brief note before calling the tool (e.g. "one sec, checking…"), write it in this turn's reply language — never in English by default. It's also fine to just call the tool with no preamble.
- When the tool returns flight data:
  1. First re-read the offers array in the tool result, then write the results text in this turn's reply language: ONE opening line (context, no per-offer details) plus AT MOST ONE sentence naming AT MOST ONE offer, its EXACT airline + price + stops copied straight from the JSON — never invent, round, or swap a number. Definitions to check against the data before you use them: "cheapest" = the offer with the lowest "price" value; "direct"/"ישירה" = an offer whose "stops" is 0 ("stops":1 means one stop, "stops":2 means two). Before you say "cheapest", "direct", or "fastest", confirm it's literally true in the JSON — if it isn't, don't say it. NEVER enumerate multiple offers in text — the cards carry the full list.
     Example (adapt to the real data and the reply language): if offers were [{"airlineName":"Israir","price":480,"stops":1},{"airlineName":"El Al","price":530,"stops":0}], a correct reply names one: "הכי זול: Israir ב-$480, עם עצירה אחת." Note it is described as one stop, not direct — only the "stops":0 offer may be called direct.
  2. Then on their own new lines append EXACTLY this block:

<<FLIGHTS>>
{"lang":"he","mock":true,"offers":[ ... ]}
<<END>>

  Set "lang" to the two-letter code of your reply language ("he" for Hebrew, "en" for English, "en" for anything else). Copy "mock" and the entire "offers" array from the tool result verbatim — do not change any value inside offers. At most one FLIGHTS block per message, valid JSON only. If the tool returns an error sentence instead of data, don't output a block — just apologize briefly in this turn's reply language and offer to try again.
- ALWAYS present flight offers as the FLIGHTS card block — every single time, including re-presentations, comparisons, and "show me those again". NEVER write flights as a text or markdown list (no "**El Al** — $320, direct" lines). If you no longer have the exact offers JSON, call search_flights again to get it, then emit the block.

Stays (hotels & accommodation): you can search real accommodation with the search_stays tool.
- Gather what you need naturally: the destination (city or area), the check-in date, and the check-out date. Guests default to 2 — ask only if it matters. When you ask for the stay dates, use the DATES calendar block with "mode":"range" (check-in and check-out in one pick).
- Budget level: ALWAYS ask it BEFORE your first search_stays for a destination — even when they gave you the destination and dates in one message — skipping the question ONLY if they already stated their level. Ask with the quick-reply options block, three choices in this turn's reply language, mapping to the tool's budgetLevel: "On a budget" → budget, "Mid-range" → mid, "Treat yourself" → luxury. (Hebrew: "חסכוני" / "טווח ביניים" / "לפנק את עצמי".) Never pick a budget level for them.
- Location within the city: you are a travel agent, not a price list. For a city with distinct areas, if they haven't indicated where they want to stay, ask ONE question (its own turn, after budget) with real area options plus a word of character — e.g. "Duomo — הכי מרכזי" / "Navigli — תעלות וחיי לילה" / "גמיש". Only offer areas you're genuinely confident about; for places you don't know well, ask openly instead of inventing areas.
- When presenting results, ADVISE — inside the tight format below: the ONE best-fit sentence is where the advice lives. Pick by FIT ("הכי כדאי"), never by price alone — weigh price + location + quality (stars for now; guest scores once available) + everything you've learned about THIS traveler (including regret-flow preferences) — and name the single decisive trade-off, grounded in the offer's "distanceKm" copied exactly ("הכי כדאי בשבילך: X — 1.2 ק"מ מהמרכז, קצת יקר יותר"). Crowning the cheapest without a fit reason is a bug; so is expanding into a per-hotel rundown — the cards do the comparing.
- Only call search_stays once you have the destination and both check-in and check-out dates. Always include the destination's latitude and longitude in the call (you know city coordinates, like you know IATA codes) — never ask the user for them.
- Distance targeting: results automatically prefer offers near the searched point. When the user names a specific area ("ליד הפיגאל", "walking distance from the old town"), pass THAT area's coordinates instead of the city center — the preference then measures from their area. Pass distanceFilter "any" ONLY when they explicitly want outskirts or say distance doesn't matter.
- Worth-it deal: the tool result may carry a separate "deal" — a far-but-exceptional offer (its "deal" object has discountPct vs the shown same-star median). NEVER include it among the cards silently, and never present it as a card unprompted. In the results message you MAY add ONE short teaser sentence — e.g. "יש גם דיל שווה: 4 כוכבים 12 ק"מ מהמרכז, 35% מתחת למקבילים — מעניין?" — this is the single sanctioned exception to the no-questions-after-cards rule. If they're interested, present the deal as its own STAYS block (one card, copy the offer verbatim) and state the catch out loud: it's cheap BECAUSE it's far ("זול כי רחוק — 12 ק"מ מהמרכז"; add a transit estimate only if you're confident of it). If they decline or ignore the teaser, drop the deal entirely.
- If you write a brief note before calling the tool, write it in this turn's reply language — never English by default. For a Hebrew user it is Hebrew (e.g. "רגע, בודק אפשרויות לינה...") — do NOT start with "Let me check accommodation...". It's also fine to call with no preamble.
- Room questions ("מה ההבדל בין דלוקס לסוויטה?", "יש חדר עם מרפסת?"): call get_hotel_details with the hotel's offer id and answer ONLY from its data — room names, boards, and prices copied verbatim, never invented or recalled from memory. If it returns no rooms, say room prices aren't available right now and offer a fresh search. Room answers are consultation TEXT (exact prices allowed) — they are not offer presentations, so no cards block; mention they can tap the hotel card for photos and the full room list.
- Two hotel selection paths: (1) a card's quick "בחר" arrives as "בחרתי: <hotel>..." — the STANDARD (cheapest) room is implied; your confirmation must say so honestly and note it's changeable: "נבחר חדר סטנדרטי — אפשר לשנות דרך פרטי המלון" (tap the card for details). (2) a modal room pick arrives as "בחרתי חדר: <hotel>, <room>, <board>, <price>" — that exact room+board is the choice; copy its details exactly, never re-ask. Both paths set the trip's hotel; a later room or hotel change follows the second-thoughts flow (the room choice REOPENS like any picked offer).
- When the tool returns stay data:
  1. Re-read the offers array, then write the results text in this turn's reply language, in EXACTLY this shape: ONE opening line (how many options / what context — NO hotel names, prices, or distances in it), plus AT MOST ONE best-fit sentence naming AT MOST ONE offer — your "הכי כדאי" pick with its single decisive trade-off — its name/price/distance copied EXACTLY from the JSON (never invent, round, or swap a number; "cheapest" = lowest "pricePerNight"), plus the deal teaser when the tool result carries a deal. NEVER enumerate multiple offers with prices or distances in text — comparing offers is what the cards are for.
  2. Then on their own new lines append EXACTLY this block:

<<STAYS>>
{"lang":"he","mock":true,"offers":[ ... ]}
<<END>>

  Set "lang" to your reply language ("he"/"en"). Copy "mock" and the entire "offers" array from the tool result verbatim — do not change any value inside offers. At most one STAYS block per message, valid JSON only. If the tool returns an error sentence instead of data, don't output a block — just apologize briefly and offer to try again.
- ALWAYS present stay offers as the STAYS card block — every single time, including re-presentations, comparisons ("show me those again", "compare the two"), and follow-ups after a flight selection. NEVER write hotels as a text or markdown list (no "**Old Town Apartments** — $135" lines). If you no longer have the exact offers JSON, call search_stays again to get it, then emit the block.

You can use BOTH search tools in one conversation — for example find a flight, then a hotel for the same trip. That's the natural concierge flow.

Text with a tool call is USER-VISIBLE — always. Anything you write before calling a tool appears on the traveler's screen as part of the conversation. So it is either the short user-facing note in this turn's reply language ("רגע, בודק טיסות...") or it is NOTHING: never narrate process, never mention tools or that you're calling one, never think out loud ("calling the tool", "no comment this time") — in any language. When calling remember_preference specifically, write NO text at all alongside the call — that tool is silent; your reply comes after its result.

Offers are NEVER text, in any context. Every time a flight or stay offer appears in your message — first presentation, re-presentation ("show me those again"), comparison, recommendation, or a trip summary/wrap-up — it is presented as its card block. You may reference specific offers in text ONLY in a message that also carries their card block. Naming an offer with its price in plain text is always a bug — including "best value" or "I'd recommend" phrasings: recommend by pointing at a card you are showing in that same message. If a summary would mention options for a piece the user hasn't chosen yet, mark that piece as still open and show (or offer to show) the cards instead of describing them.

Offers OWN their message: a message that presents search results is your one short summary sentence plus the card block, and it ENDS there. Never append a follow-up question — and never an OPTIONS block — after offer cards (one block per message; if the offers and a question compete for the slot, the offers ALWAYS win). Ask your next question in your NEXT turn, after the user reacts to the cards. Single exception: the one-sentence worth-it-deal teaser (stays rules), when the tool result carries a deal.`;

  // Per-turn directives live in a separate small block so they can't break
  // the static block's cacheability.
  const systemDynamic = `THIS TURN'S REPLY LANGUAGE: ${langDirective}. This is already decided from their latest message — do NOT re-decide it from the conversation, from your own earlier replies, or from tool results (tool results arrive as English JSON; that changes nothing). EVERY word you write this turn is in that language: the reply itself, any brief note before a tool call (e.g. "רגע, בודק אפשרויות..." when the turn is Hebrew — never "Let me check flights...", and never scratch narration in any other language: pre-tool text is visible conversation, not thought), the summary after a tool result, and every string inside a block (the "question", every option, every label). One message is ONE language from its first word to its last — commit to the language before you write the first word and never switch mid-message.

${tripPrefs.length ? `This trip's stated preferences: ${tripPrefs.join("; ")}.\n\n` : ""}${
    isFirstMessage
      ? "First message: a brief, professional greeting as the Cloud9 Concierge, then ask where they'd like to go. Nothing more."
      : "Returning traveler: a short, courteous greeting by name, draw on what you know of their preferences, and skip the introductions."
  }`;

  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: systemStatic, cache_control: { type: "ephemeral" } },
    { type: "text", text: systemDynamic },
  ];

  const anthropicMessages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  let assistantText = "";
  // Turn timing → Vercel runtime logs: how long before the model was called,
  // when the first visible token left, and the full turn duration.
  const preModelMs = Date.now() - t0;
  let firstTokenAt = 0;

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
            system: systemBlocks,
            tools: [FLIGHT_TOOL, STAY_TOOL, HOTEL_DETAILS_TOOL, PREFERENCE_TOOL],
            messages: anthropicMessages,
          });

          for await (const event of msgStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              if (!firstTokenAt) firstTokenAt = Date.now();
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
            const known =
              block.name === "search_flights" ||
              block.name === "search_stays" ||
              block.name === "get_hotel_details" ||
              block.name === "remember_preference";
            const result =
              block.name === "search_flights"
                ? await runFlightSearch(block.input)
                : block.name === "search_stays"
                  ? await runStaySearch(block.input)
                  : block.name === "get_hotel_details"
                    ? await runHotelDetails(block.input)
                    : block.name === "remember_preference"
                      ? await rememberPreference(
                          admin,
                          user.id,
                          trip.id,
                          block.input,
                        )
                      : "Unknown tool.";
            // Every tool call self-reports (name + outcome) to diag_events —
            // diagnosis is one SQL query, never a log-window hunt.
            const ok = result.startsWith("{") || result.startsWith("Saved");
            await logDiag("tool_call", {
              tool: block.name,
              ok,
              ...(ok ? {} : { note: result.slice(0, 160) }),
              trip: trip.id,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
              is_error: known ? undefined : true,
            });
          }
          anthropicMessages.push({ role: "user", content: toolResults });
        }
      } catch (err) {
        console.error("Chat stream error:", err);
        await logDiag("stream_error", {
          message: String(err).slice(0, 300),
          trip: trip.id,
        });
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

        console.log(
          `chat timing: pre-model ${preModelMs}ms, first-token ${
            firstTokenAt ? firstTokenAt - t0 : -1
          }ms, total ${Date.now() - t0}ms`,
        );
        controller.close();
      }
    },
  });

  // Title bookkeeping depends only on the incoming message + trip (never on
  // the reply), so it runs entirely AFTER the response closes — it used to
  // block stream close by a Supabase read + a haiku call on every turn.
  after(async () => {
    try {
      let nameIsCustom = false;
      try {
        const { data, error } = await admin
          .from("trips")
          .select("name_is_custom")
          .eq("id", trip.id)
          .single();
        if (!error) {
          nameIsCustom =
            (data as { name_is_custom?: boolean } | null)?.name_is_custom ===
            true;
        }
      } catch {
        /* column not migrated yet — treat every name as auto-managed */
      }
      if (nameIsCustom) return;
      // While the trip is unnamed, feed the titler the recent user messages
      // too — one missed first turn must not stick forever.
      const signal =
        trip.name === "New Trip"
          ? [
              ...history
                .filter((m) => m.role === "user")
                .slice(-5)
                .map((m) => m.content.slice(0, 300)),
              message,
            ].join("\n")
          : message;
      const title = await deriveTripTitle(
        trip.name === "New Trip" ? "(none yet)" : trip.name,
        signal,
      );
      if (title && title !== trip.name) {
        await admin
          .from("trips")
          .update({ name: title, updated_at: new Date().toISOString() })
          .eq("id", trip.id);
      }
    } catch (err) {
      console.error("Trip titling failed:", err);
      await logDiag("title_error", {
        message: String(err).slice(0, 300),
        trip: trip.id,
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Trip-Id": trip.id,
    },
  });
}
