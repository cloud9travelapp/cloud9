import Link from "next/link";
import PhaseTypewriter from "@/components/landing/phase-typewriter";

// Shared hero copy: eyebrow, the kept display headline (typewriter), a
// first-person concierge sub-line (the "warm" voice signal), and the one
// unified CTA + a quiet secondary. `align` flips centered vs. left for the
// different hero layouts.
export default function HeroCopy({
  align = "center",
}: {
  align?: "center" | "start";
}) {
  const isCenter = align === "center";
  return (
    <div className={isCenter ? "text-center" : "text-center lg:text-start"}>
      <span className="inline-flex items-center gap-2 rounded-full border border-c-border bg-c-surface/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-c-accent backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-c-accent" />
        AI travel concierge
      </span>

      <div className="mt-7">
        <PhaseTypewriter />
      </div>

      <p
        className={`mt-6 text-lg leading-relaxed text-c-muted ${
          isCenter ? "mx-auto max-w-xl" : "mx-auto max-w-md lg:mx-0"
        }`}
      >
        Tell me where you&apos;re dreaming of. I&apos;ll shape the route, the
        days, and the tables — so the trip plans itself, and you just go.
      </p>

      <div
        className={`mt-9 flex flex-col items-center gap-3 sm:flex-row ${
          isCenter ? "justify-center" : "lg:justify-start"
        }`}
      >
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-full bg-c-accent px-7 py-3.5 text-base font-semibold text-c-on-accent shadow-rest transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-c-accent/40 focus-visible:ring-offset-2"
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
  );
}
