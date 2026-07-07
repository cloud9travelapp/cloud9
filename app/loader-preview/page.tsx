"use client";

import { CloudMarkClassic } from "@/components/brand/cloud-marks";
import { CloudBubble } from "@/components/chat/message-parts";

// TEMP — Step 5 thinking-loader variants for review. Deleted after the pick.
// All CSS-only, accent-coloured, reduced-motion → static mark.
const CSS = `
@keyframes ld-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.09)} }
@keyframes ld-sway { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
@keyframes ld-morph { 0%,100%{transform:scale(1.05,0.95)} 50%{transform:scale(0.96,1.06)} }
@media (prefers-reduced-motion: no-preference){
  .ld-breathe{animation:ld-breathe 2.4s ease-in-out infinite}
  .ld-sway{animation:ld-sway 3s ease-in-out infinite}
  .ld-morph{animation:ld-morph 2.6s ease-in-out infinite}
}
`;

const VARIANTS = [
  { id: "breathe", name: "A · Breathe", cls: "ld-breathe", note: "Gentle scale pulse — the cloud inhales/exhales" },
  { id: "sway", name: "B · Sway", cls: "ld-sway", note: "Slow rock left/right — drifting cloud" },
  { id: "morph", name: "C · Morph", cls: "ld-morph", note: "Soft squash & stretch — a subtle shape-shift" },
];

export default function LoaderPreview() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <h1 className="font-display text-3xl font-bold text-c-ink">
        Thinking loader — pick one
      </h1>
      <p className="mt-2 text-c-muted">
        The cloud mark as the &ldquo;thinking&rdquo; animation, replacing the
        typing dots. Shown large and inside a chat bubble (real size). Calm,
        reduced-motion falls back to a static mark.
      </p>

      <div className="mt-8 flex flex-col gap-8">
        {VARIANTS.map((v) => (
          <div
            key={v.id}
            className="rounded-3xl border border-c-border bg-c-surface/60 p-8 backdrop-blur"
          >
            <div className="font-display text-lg font-bold text-c-ink">
              {v.name}
            </div>
            <div className="text-sm text-c-muted">{v.note}</div>
            <div className="mt-6 flex flex-wrap items-center gap-12">
              <div className="text-c-accent">
                <CloudMarkClassic className={`h-16 w-16 ${v.cls}`} />
              </div>
              <div className="flex flex-col items-start">
                <CloudBubble>
                  <span className="inline-flex py-1 text-c-accent">
                    <CloudMarkClassic className={`h-6 w-6 ${v.cls}`} />
                  </span>
                </CloudBubble>
                <span className="mt-1.5 px-1 text-[11px] text-c-muted">
                  in a bubble (chat size)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
