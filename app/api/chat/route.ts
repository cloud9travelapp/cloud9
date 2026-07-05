import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAnthropic, CONCIERGE_MODEL, NAMER_MODEL } from "@/lib/anthropic";
import { detectPreferences, mergePreferences } from "@/lib/preferences";

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
- Lead with a quick, warm acknowledgment when it fits — "Sure", "Love that", "Great choice", "Absolutely", or in Hebrew "בטח", "אחלה", "מעולה", "יאללה". Mix Hebrew and English the way a bilingual Israeli friend naturally would; don't force it.
- Follow their language: Hebrew in, Hebrew out; English in, English out. A light, natural code-switch is fine; a jarring full switch is not.
- Keep it short. One or two sentences of lead-in at most, then get to the point. A simple question gets a simple answer — only go deeper when they ask.
- Never repeat their words back at them. If they say "Rome", don't answer "So you'd like to visit Rome" — just react and keep moving.
- Use everyday words in both languages. Skip the fancy, high-register vocabulary.
- Go light on punctuation. No strings of exclamation marks — just what you actually need.
- Ask one or two questions at most, and only when they belong together, then stop and let them answer.

One honest thing: you can't book flights or hotels yet — that part's still being wired up. If it comes up, just say so casually and steer back to the good stuff: where to go, the vibe, timing, food, things to do.

${
    isFirstMessage
      ? "First time you two are talking: one short, warm hello as the Cloud9 Concierge, then ask where they're thinking of heading. Nothing more."
      : "You've talked before: greet them by name like a friend, use what you already know about their taste, and skip the introductions."
  }`;

  const anthropicMessages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const msgStream = getAnthropic().messages.stream({
          model: CONCIERGE_MODEL,
          max_tokens: 4096,
          thinking: { type: "disabled" },
          system,
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
        await msgStream.finalMessage();
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
