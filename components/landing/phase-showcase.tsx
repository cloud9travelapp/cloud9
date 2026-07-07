"use client";

// Tap a phase to try it on — sets <html data-phase>, so the whole page
// re-themes through the same mechanism the clock uses. Each swatch previews its
// OWN palette via an element-scoped data-phase (see the [data-phase] rules in
// globals.css), so there are no hardcoded colours here.
const PHASES = [
  { id: "sunrise", label: "Sunrise" },
  { id: "morning", label: "Morning" },
  { id: "midday", label: "Midday" },
  { id: "sunset", label: "Sunset" },
  { id: "night", label: "Night" },
];

export default function PhaseShowcase() {
  const preview = (id: string) => {
    document.documentElement.dataset.phase = id;
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {PHASES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => preview(p.id)}
          className="group rounded-2xl p-1 text-center outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-c-accent/40"
        >
          {/* the chip carries its own phase palette */}
          <span
            data-phase={p.id}
            className="relative block h-24 overflow-hidden rounded-2xl border border-c-border shadow-sm"
            style={{
              background: "linear-gradient(to bottom, var(--c-bg-1), var(--c-bg-2))",
            }}
          >
            {/* a soft blob of the phase mist */}
            <span
              aria-hidden="true"
              className="absolute -right-4 -top-4 h-16 w-16 rounded-full blur-lg"
              style={{ background: "var(--c-mist)", opacity: 0.7 }}
            />
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-3 h-3 w-3 rounded-full"
              style={{ background: "var(--c-accent)" }}
            />
          </span>
          <span className="mt-2 block text-sm font-medium text-c-ink">
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}
