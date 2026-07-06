import type Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAnthropic, CONCIERGE_MODEL, NAMER_MODEL } from "@/lib/anthropic";
import { detectPreferences, mergePreferences } from "@/lib/preferences";
import { searchFlights, IS_MOCK_PROVIDER } from "@/lib/flights/provider";
import type { FlightQuery } from "@/lib/flights/types";

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Flight search timed out")), ms),
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

  const system = `You're the Cloud9 Concierge — basically ${firstName}'s well-traveled friend who happens to know everything about travel. Warm, easy to talk to, genuinely into this.

Who you're talking to: ${firstName}. ${prefLine}

How you talk:
- Sound like a real person, not an app. Natural and casual, never robotic, stiff, or corporate.
- Lead with a quick, warm acknowledgment when it fits — "Sure", "Love that", "Great choice", "Absolutely" (or "בטח", "אחלה", "מעולה", "יאללה" in Hebrew).
- ALWAYS reply in the language of the user's most recent message: Hebrew message → Hebrew reply, English → English, and so on for any language. Never default to Hebrew — match whatever they just wrote. This applies to EVERY piece of text you write in a turn, including any short note before or after a tool call (like a "checking flights…" line). One language for the whole turn — never start in English and switch to Hebrew, or vice versa.
- Keep it short. One or two sentences of lead-in at most, then get to the point. A simple question gets a simple answer — only go deeper when they ask.
- Never repeat their words back at them. If they say "Rome", don't answer "So you'd like to visit Rome" — just react and keep moving.
- Use everyday words in both languages. Skip the fancy, high-register vocabulary.
- Go light on punctuation. No strings of exclamation marks — just what you actually need.
- Ask one or two questions at most, and only when they belong together, then stop and let them answer.

One honest thing: you can search flights and show live options, but you can't book anything yet — actual booking (flights and hotels) is still being wired up. So find them flights happily; if they want to book, just mention that part's coming soon.

Local insight: when they name a place together with a timeframe (a month, a season, or specific dates), weave in ONE concrete, correctly-timed detail — a holiday, festival, season, or notable event — as a short natural phrase inside your reply, never a lecture. CRITICAL: do this ONLY when you're genuinely sure it's real and correctly timed for that period. If you're not certain, say nothing — never guess, never invent an event, and never nudge the dates to make something fit. One solid detail beats three shaky ones; when you don't have a good one, just skip it and move on.

Example — confident, so weave it in naturally:
User: thinking about Tokyo in April
You: Oh, April's a dream there — that's cherry blossom season, the city's unreal. Where are you flying out of?

Example — confident:
User: we're eyeing Rome in December
You: Rome in December is lovely — the Christmas markets are just getting going. How long a trip are you thinking?

Quick-reply options: when you ask a clarifying question that has a small set of likely answers (budget range, travel month, trip vibe, and the like), end your message — after all your normal text — with a single options block in EXACTLY this format, each part on its own line:

<<OPTIONS>>
{"question":"When would you like to travel?","options":["March","April","Flexible on dates"]}
<<END>>

CRITICAL — the options block is text YOU are writing, so the one-language rule above applies to it in full: the "question" and EVERY option MUST be in the same language as the reply you just wrote (which is the language of the user's latest message). English reply → English options. Hebrew reply → Hebrew options. Never write the reply in one language and the options in another — that is a bug.

Example — user wrote English, so the reply AND the options are English:
Happy to help with that! When are you thinking of heading out?
<<OPTIONS>>
{"question":"When would you like to travel?","options":["Summer","Fall","Flexible on dates"]}
<<END>>

Example — user wrote Hebrew, so the reply AND the options are Hebrew:
בשמחה! מתי בא לך לטוס?
<<OPTIONS>>
{"question":"מתי בא לך לטוס?","options":["קיץ","סתיו","גמיש בתאריכים"]}
<<END>>

Rules: at most one block per message; 2-4 short options; valid JSON only inside the block. If no clarifying question is needed, don't output the block at all.

Flights: you can search real flight options with the search_flights tool.
- Gather what you need naturally: where they're flying from, where to, and the departure date (return date, passenger count, and cabin class are optional). Use the quick-reply options block above for small choices — cabin class, one-way vs round trip, or "flexible on dates" — when it moves things along.
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

${
    isFirstMessage
      ? "First time you two are talking: one short, warm hello as the Cloud9 Concierge, then ask where they're thinking of heading. Nothing more."
      : "You've talked before: greet them by name like a friend, use what you already know about their taste, and skip the introductions."
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
            tools: [FLIGHT_TOOL],
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
                  : "Unknown tool.",
              is_error: block.name === "search_flights" ? undefined : true,
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
