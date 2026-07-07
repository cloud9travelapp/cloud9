"use client";

import { Lockup } from "@/components/brand/lockup";

// TEMP — Step 2 lockup review. Deleted at the end of the brand mini-project.
const PHASES = ["sunrise", "morning", "midday", "sunset", "night"];
const RATIOS = [1.5, 1.8, 2.1];

function RatioRow({ label, fontSize }: { label: string; fontSize: string }) {
  return (
    <div className="rounded-3xl border border-c-border bg-c-surface/60 p-8 backdrop-blur">
      <div className="mb-6 text-xs font-semibold uppercase tracking-wider text-c-muted">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-x-16 gap-y-10">
        {RATIOS.map((r) => (
          <div key={r} className="flex flex-col items-center gap-2">
            <Lockup orientation="horizontal" markScale={r} float style={{ fontSize }} />
            <span className="text-[10px] text-c-muted">mark {r}em</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LockupPreview() {
  const setPhase = (p: string) => {
    document.documentElement.dataset.phase = p;
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold text-c-ink">
        Horizontal lockup — pick the balance
      </h1>
      <p className="mt-2 text-c-muted">
        Mark frame tightened (fills its box now). Three mark-to-type ratios,
        side by side. Switch phase to see the accent mark.
      </p>

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
        <RatioRow label="Header size (~20px type)" fontSize="20px" />
        <RatioRow label="Larger (~40px type)" fontSize="40px" />
      </div>

      {/* stacked reference (already chosen for og/splash) */}
      <div className="mt-8 rounded-3xl border border-c-border bg-c-surface/60 p-8 backdrop-blur">
        <div className="mb-6 text-xs font-semibold uppercase tracking-wider text-c-muted">
          Stacked — reference (og/splash), unchanged
        </div>
        <Lockup orientation="stacked" float style={{ fontSize: "56px" }} />
      </div>
    </div>
  );
}
