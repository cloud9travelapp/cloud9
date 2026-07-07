"use client";

import { CLOUD_MARKS } from "@/components/brand/cloud-marks";

// TEMP — Step 1 mark variations for review. Deleted at the end of the brand
// mini-project.
const PHASES = ["sunrise", "morning", "midday", "sunset", "night"];
const SIZES = [
  { px: 16, label: "16px · favicon" },
  { px: 48, label: "48px · header" },
  { px: 200, label: "200px · large" },
];

export default function MarkPreview() {
  const setPhase = (p: string) => {
    document.documentElement.dataset.phase = p;
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold text-c-ink">
        Cloud9 mark — 4 options
      </h1>
      <p className="mt-2 text-c-muted">
        Each shown at 16 / 48 / 200px, in ink and in the phase accent. Switch the
        phase to judge the accent across the day.
      </p>

      {/* phase switcher */}
      <div className="mt-5 flex flex-wrap gap-2">
        {PHASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className="rounded-full border border-c-border bg-c-surface px-4 py-1.5 text-sm font-medium capitalize text-c-ink transition-colors hover:bg-c-accent-soft"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-8">
        {CLOUD_MARKS.map(({ id, name, note, Mark }) => (
          <div
            key={id}
            className="rounded-3xl border border-c-border bg-c-surface/60 p-6 backdrop-blur"
          >
            <div className="flex items-baseline gap-3">
              <span className="font-display text-xl font-bold text-c-ink">
                {id}. {name}
              </span>
              <span className="text-sm text-c-muted">{note}</span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {(["ink", "accent"] as const).map((tone) => (
                <div key={tone}>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-c-muted">
                    {tone === "ink" ? "Ink" : "Phase accent"}
                  </div>
                  <div
                    className={`flex items-end gap-6 ${
                      tone === "ink" ? "text-c-ink" : "text-c-accent"
                    }`}
                  >
                    {SIZES.map((s) => (
                      <div key={s.px} className="flex flex-col items-center gap-2">
                        <div
                          style={{ width: s.px, height: s.px }}
                          className="flex items-center justify-center"
                        >
                          <Mark className="h-full w-full" />
                        </div>
                        <span className="text-[10px] text-c-muted">
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
