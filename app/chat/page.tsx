import { auth, signIn } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import ChatShell from "@/components/chat/chat-shell";
import type { Trip } from "@/components/chat/trip-sidebar";

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string }>;
}) {
  const session = await auth();

  // Signed-out visitors get a sign-in gate that returns them here afterwards.
  if (!session?.user?.googleId) {
    return (
      <div dir="rtl" className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-c-accent text-c-on-accent shadow-sm">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.9" />
          </svg>
        </span>
        <h1 className="font-display mt-6 text-3xl font-extrabold tracking-tight text-c-ink">
          Sign in to start planning
        </h1>
        <p className="mt-2 max-w-sm text-c-muted">
          The Cloud9 Concierge remembers your trips and preferences, so you need
          to be signed in.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/chat" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="rounded-full bg-c-accent px-8 py-3.5 text-base font-semibold text-c-on-accent shadow-sm transition-opacity hover:opacity-90"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    );
  }

  const firstName =
    (session.user.name ?? "").trim().split(/\s+/)[0] || "traveler";

  let trips: Trip[] = [];
  let initialMessages: Message[] = [];
  let activeTripId: string | null = null;

  try {
    const admin = getSupabaseAdmin();

    // Ensure a user row exists, then load their trips.
    const { data: user } = await admin
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
      .select("id")
      .single();

    if (user) {
      const { data: tripRows } = await admin
        .from("trips")
        .select("id, name, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      trips = (tripRows ?? []) as Trip[];

      const requested = (await searchParams).trip;
      if (typeof requested === "string" && trips.some((t) => t.id === requested)) {
        activeTripId = requested;
        const { data } = await admin
          .from("chat_messages")
          .select("role, content, created_at")
          .eq("trip_id", requested)
          .order("created_at", { ascending: true })
          .limit(200);
        initialMessages = (data ?? []) as Message[];
      }
    }
  } catch (err) {
    console.error("Failed to load trips:", err);
  }

  return (
    <ChatShell
      trips={trips}
      activeTripId={activeTripId}
      initialMessages={initialMessages}
      firstName={firstName}
    />
  );
}
