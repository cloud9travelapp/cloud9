import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import HeroDithering from "@/components/landing/hero-dithering";
import PhaseTypewriter from "@/components/landing/phase-typewriter";
import ChatDemo from "@/components/landing/chat-demo";
import PhaseShowcase from "@/components/landing/phase-showcase";

const capabilities = [
  {
    label: "Where",
    title: "Find your where",
    body: "Describe the trip you're dreaming of — the pace, the season, the mood. Cloud9 comes back with places that actually fit.",
    icon: (
      <>
        <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  },
  {
    label: "Days",
    title: "Shape the days",
    body: "A plan that breathes — mornings that aren't rushed, evenings left open. Reshape any day just by saying so.",
    icon: (
      <>
        <path d="M8 2v3M16 2v3M3.5 8.5h17" />
        <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
        <path d="M8 13h3M8 17h5" />
      </>
    ),
  },
  {
    label: "Tables",
    title: "Eat like a local",
    body: "The small places locals quietly love — matched to what you're into, tucked into the right night of the trip.",
    icon: (
      <>
        <path d="M6 2v7c0 1.1.9 2 2 2h1M9 2v20M9 11V2" />
        <path d="M17 2c-1.7 0-3 2-3 5s1.3 4 3 4h0v11" />
      </>
    ),
  },
];

function initialsFrom(name?: string | null, email?: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) return "☁";
  const parts = source.split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : source[0];
  return letters.toUpperCase();
}

function realPhotoUrl(image?: string | null): string | null {
  if (!image) return null;
  if (image.includes("default-user")) return null;
  return image;
}

function Wordmark() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-c-accent/40"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-c-accent text-c-on-accent">
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
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
      <span className="font-display text-lg font-extrabold tracking-tight text-c-ink">
        Cloud9
      </span>
    </Link>
  );
}

/**
 * A hand-drawn-style thought-bubble cloud: overlapping lobes form the bumpy
 * body, and three shrinking circles trail off the bottom-left as the tail.
 * Fill follows the phase surface token so cards theme with the sky (dark at
 * night instead of glaring white). Stretches to fill its card.
 */
function CloudShape({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <g style={{ fill: "var(--c-surface)", transition: "fill 900ms ease" }}>
        {/* body */}
        <ellipse cx="200" cy="150" rx="150" ry="80" />
        <ellipse cx="118" cy="108" rx="62" ry="55" />
        <ellipse cx="200" cy="86" rx="70" ry="60" />
        <ellipse cx="288" cy="104" rx="60" ry="54" />
        <ellipse cx="66" cy="156" rx="52" ry="55" />
        <ellipse cx="338" cy="160" rx="52" ry="55" />
        <ellipse cx="132" cy="206" rx="60" ry="50" />
        <ellipse cx="214" cy="216" rx="68" ry="52" />
        <ellipse cx="296" cy="204" rx="58" ry="48" />
        {/* tail */}
        <ellipse cx="96" cy="262" rx="18" ry="12" />
        <ellipse cx="70" cy="280" rx="11" ry="8" />
        <ellipse cx="52" cy="292" rx="7" ry="5" />
      </g>
    </svg>
  );
}

export default async function Home() {
  const session = await auth();

  async function startPlanning() {
    "use server";
    await signIn("google", { redirectTo: "/chat" });
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="flex-1">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-c-border bg-c-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark />
          <nav className="flex items-center gap-5">
            <a
              href="#handles"
              className="hidden text-sm font-medium text-c-muted transition-colors hover:text-c-ink sm:block"
            >
              How it works
            </a>
            {session?.user ? (
              <div className="flex items-center gap-3">
                {realPhotoUrl(session.user.image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={realPhotoUrl(session.user.image)!}
                    alt={session.user.name ?? "Your profile"}
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-c-surface"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-c-accent text-xs font-semibold text-c-on-accent ring-2 ring-c-surface"
                  >
                    {initialsFrom(session.user.name, session.user.email)}
                  </span>
                )}
                <form action={handleSignOut}>
                  <button
                    type="submit"
                    className="rounded-full border border-c-border bg-c-surface px-4 py-2 text-sm font-medium text-c-ink transition-colors hover:bg-c-accent-soft"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <form action={startPlanning}>
                <button
                  type="submit"
                  className="rounded-full border border-c-border bg-c-surface px-4 py-2 text-sm font-medium text-c-ink transition-colors hover:bg-c-accent-soft"
                >
                  Sign in
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>

      {/* Hero — living sky: phase gradient + SkyClouds + the Dithering mist.
         No `isolate`: the mist blends (screen on night) against the sky behind. */}
      <section className="relative overflow-hidden">
        <HeroDithering />
        <div className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-24 text-center sm:pt-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-c-border bg-c-surface/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-c-accent backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-c-accent" />
            AI travel concierge
          </span>

          <div className="mt-7">
            <PhaseTypewriter />
          </div>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-c-muted">
            Tell Cloud9 where you&apos;re dreaming of. Your concierge shapes the
            route, the days, and the tables — so the trip plans itself and you
            just go.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-c-accent px-7 py-3.5 text-base font-semibold text-c-on-accent shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-c-accent/40 focus-visible:ring-offset-2"
            >
              Start planning
              <span aria-hidden="true">→</span>
            </Link>
            <a
              href="#handles"
              className="inline-flex items-center rounded-full px-5 py-3.5 text-base font-semibold text-c-ink transition-colors hover:text-c-accent"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Live chat demo — the actual product, playing a scripted trip */}
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-4 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-c-ink sm:text-4xl">
          Watch a trip take shape
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-lg text-c-muted">
          This is the real concierge — ask for what you want, and the plan
          starts filling itself in.
        </p>
        <div className="mt-10">
          <ChatDemo />
        </div>
      </section>

      {/* Capabilities */}
      <section id="handles" className="mx-auto max-w-6xl px-6 pb-28 pt-4">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-c-ink">
            What Cloud9 handles
          </h2>
          <p className="mt-3 text-lg text-c-muted">
            Not another booking form. A concierge that does the thinking, then
            hands you a trip worth taking.
          </p>
        </div>

        {/* Real cloud-shaped cards (SVG), drifting in a zigzag: left → right(lower) → left(lower) */}
        <div className="mx-auto mt-14 flex max-w-3xl flex-col items-center gap-10 sm:items-stretch sm:gap-6">
          {capabilities.map((c, i) => {
            const placement =
              i === 1
                ? "sm:self-end sm:mt-8"
                : i === 2
                  ? "sm:self-start sm:mt-8"
                  : "sm:self-start";
            return (
              <div
                key={c.label}
                className={`card-float-${i + 1} relative w-full max-w-sm ${placement}`}
                style={{
                  filter: "drop-shadow(0 18px 30px rgba(2,8,23,0.20))",
                }}
              >
                <CloudShape className="absolute inset-0 h-full w-full" />
                <div className="relative px-12 pb-16 pt-11 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-c-accent text-c-on-accent">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {c.icon}
                    </svg>
                  </div>
                  <p className="mt-4 font-display text-xs font-extrabold uppercase tracking-[0.22em] text-c-accent">
                    {c.label}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-c-ink">
                    {c.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-[15rem] text-sm leading-relaxed text-c-muted">
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Time-of-day showcase */}
      <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-c-ink sm:text-4xl">
          An app that lives with your day
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-lg text-c-muted">
          Cloud9&apos;s sky shifts from dawn to midnight with your local time.
          Tap a moment to try it on.
        </p>
        <div className="mt-10">
          <PhaseShowcase />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-28 text-center">
        <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-c-ink sm:text-5xl">
          Your next trip is one message away.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-c-muted">
          No forms, no twenty tabs. Just tell Cloud9 where you&apos;re dreaming
          of — and go.
        </p>
        <div className="mt-9">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-full bg-c-accent px-9 py-4 text-lg font-semibold text-c-on-accent shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-c-accent/40 focus-visible:ring-offset-2"
          >
            Start planning
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-c-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-c-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Cloud9</span>
          <span>Planning from cloud nine.</span>
        </div>
      </footer>
    </div>
  );
}
