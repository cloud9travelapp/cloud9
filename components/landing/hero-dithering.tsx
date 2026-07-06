"use client";

import { lazy, Suspense, useEffect, useState } from "react";

// Lazy-load the WebGL shader so it never blocks first paint and stays out of
// the initial route bundle. Only the hero pulls this chunk, after mount.
const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((m) => ({ default: m.Dithering })),
);

/** Read the resolved --c-accent as a concrete color the shader can consume. */
function readAccent(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--c-accent")
    .trim();
  return v || "#0369a1";
}

/**
 * A soft, drifting Dithering texture behind the hero — reads like living
 * clouds/mist. Its front colour tracks the current phase accent (--c-accent),
 * re-read whenever <html data-phase> changes, so it lives with the clock.
 * Omitted entirely under prefers-reduced-motion.
 */
export default function HeroDithering() {
  const [accent, setAccent] = useState("#0369a1");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setAccent(readAccent());
    setEnabled(true);

    // Follow the clock. A short settle delay lets the ~900ms token transition
    // land near its target before we sample the accent.
    let t: number | undefined;
    const obs = new MutationObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setAccent(readAccent()), 950);
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-phase"],
    });
    return () => {
      obs.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-35"
    >
      <Suspense fallback={null}>
        <Dithering
          colorBack="#00000000"
          colorFront={accent}
          shape="warp"
          type="4x4"
          speed={0.18}
          className="h-full w-full"
          minPixelRatio={1}
        />
      </Suspense>
    </div>
  );
}
