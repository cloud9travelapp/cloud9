"use client";

import { lazy, Suspense, useEffect, useState } from "react";

// Lazy-load the WebGL shader so it never blocks first paint and stays out of
// the initial route bundle. Only the hero pulls this chunk, after mount.
const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((m) => ({ default: m.Dithering })),
);

type Mist = { color: string; opacity: number; blend: string };

/** Read the phase mist colour + opacity + blend mode (its own tokens, separate
 *  from the UI accent) so the mist can be a bright atmospheric hue while accents
 *  stay readable. The blend mode matters on dark bases: `screen` lets the warm
 *  night mist glow additively over the navy instead of muddying it. */
function readMist(): Mist {
  const cs = getComputedStyle(document.documentElement);
  const color = cs.getPropertyValue("--c-mist").trim() || "#8fc0ea";
  const opacity = parseFloat(cs.getPropertyValue("--c-mist-opacity")) || 0.3;
  const blend = cs.getPropertyValue("--c-mist-blend").trim() || "normal";
  return { color, opacity, blend };
}

/**
 * A soft, drifting Dithering texture behind the hero — reads like living
 * clouds/mist. Colour + opacity track the current phase mist tokens
 * (--c-mist / --c-mist-opacity), re-read whenever <html data-phase> changes,
 * so it lives with the clock. Omitted entirely under prefers-reduced-motion.
 */
export default function HeroDithering() {
  const [mist, setMist] = useState<Mist>({
    color: "#8fc0ea",
    opacity: 0.22,
    blend: "normal",
  });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Day phases carry the mist; night does not (its base does the work).
    const apply = () => {
      if (document.documentElement.dataset.phase === "night") {
        setEnabled(false);
        return;
      }
      setMist(readMist());
      setEnabled(true);
    };
    apply();

    // Follow the clock. A short settle delay lets the ~900ms token transition
    // land near its target before we sample the mist colour.
    let t: number | undefined;
    const obs = new MutationObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(apply, 950);
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
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{
        opacity: mist.opacity,
        mixBlendMode: mist.blend as React.CSSProperties["mixBlendMode"],
        transition: "opacity 900ms ease",
      }}
    >
      <Suspense fallback={null}>
        <Dithering
          colorBack="#00000000"
          colorFront={mist.color}
          shape="warp"
          type="8x8"
          speed={0.18}
          className="h-full w-full"
          minPixelRatio={1}
        />
      </Suspense>
    </div>
  );
}
