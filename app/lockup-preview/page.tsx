"use client";

import { Lockup } from "@/components/brand/lockup";

// TEMP — Step 2 lockup review. Deleted at the end of the brand mini-project.
const PHASES = ["sunrise", "morning", "midday", "sunset", "night"];

function Row({
  label,
  fontSize,
}: {
  label: string;
  fontSize: string;
}) {
  return (
    <div className="rounded-3xl border border-c-border bg-c-surface/60 p-8 backdrop-blur">
      <div className="mb-6 text-xs font-semibold uppercase tracking-wider text-c-muted">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-x-16 gap-y-10">
        <div className="flex flex-col items-center gap-2">
          <Lockup orientation="horizontal" style={{ fontSize }} />
          <span className="text-[10px] text-c-muted">mark left of text</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Lockup orientation="stacked" style={{ fontSize }} />
          <span className="text-[10px] text-c-muted">mark above text</span>
        </div>
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
        Cloud9 lockup — 2 arrangements
      </h1>
      <p className="mt-2 text-c-muted">
        Classic mark + &ldquo;Cloud9&rdquo; in Suez One. Shown at header size and
        og:image size, in both arrangements. Switch phase to see the accent mark.
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
        <Row label="Header size (~20px type)" fontSize="20px" />
        <Row label="og:image size (~72px type)" fontSize="72px" />
      </div>
    </div>
  );
}
