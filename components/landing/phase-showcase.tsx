// Display-only strip of the five sky phases. Each swatch previews its OWN
// palette via an element-scoped data-phase (see the [data-phase] rules in
// globals.css), so there are no hardcoded colours here.
const PHASES = [
  { id: "sunrise", label: "Sunrise" },
  { id: "morning", label: "Morning" },
  { id: "midday", label: "Midday" },
  { id: "sunset", label: "Sunset" },
  { id: "night", label: "Night" },
];

export default function PhaseShowcase() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {PHASES.map((p) => (
        <div key={p.id} className="text-center">
          {/* the chip carries its own phase palette; the mist colour dominates
             so each phase reads clearly (sunrise yellow-gold vs sunset coral) */}
          <span
            data-phase={p.id}
            className="relative block h-24 overflow-hidden rounded-card border border-c-border shadow-rest"
            style={{
              background:
                "linear-gradient(150deg, var(--c-bg-1) 0%, var(--c-bg-2) 32%, var(--c-mist) 118%)",
            }}
          >
            {/* a concentrated bloom of the phase mist, reinforcing the hue */}
            <span
              aria-hidden="true"
              className="absolute -bottom-5 -right-5 h-20 w-20 rounded-full blur-md"
              style={{ background: "var(--c-mist)" }}
            />
            <span
              aria-hidden="true"
              className="absolute left-3 top-3 h-3 w-3 rounded-full"
              style={{ background: "var(--c-accent)" }}
            />
          </span>
          <span className="mt-2 block text-sm font-medium text-c-ink">
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}
