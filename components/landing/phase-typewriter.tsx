"use client";

import { useEffect, useState } from "react";

// Our headline copy, unchanged. Typography stays ours (Suez One display, our
// sizes); "Wander more." carries the phase accent, as does the caret.
const HEADLINE =
  "font-display text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-7xl";

/**
 * The hero headline with a smooth left-to-right wipe reveal (adapted from the
 * TypewriterEffectSmooth idea). Implemented in CSS so the base state is the
 * FULL, visible headline — the wipe only plays once, on load, when JS is
 * present and motion is welcome (data-typewriter="on"). So no-JS, reduced
 * motion, or a stalled animation all fall back to the plain visible headline.
 * Reveal uses clip-path (no reflow → no layout shift). See globals.css.
 */
export default function PhaseTypewriter() {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlay(true);
    }
  }, []);

  return (
    <h1
      className={`${HEADLINE} text-c-ink`}
      data-typewriter={play ? "on" : undefined}
    >
      <span className="tw-line block">Plan less.</span>
      <span className="tw-line block text-c-accent">
        Wander more.
        <span
          aria-hidden="true"
          className="tw-caret ms-1 h-[0.78em] w-[3px] translate-y-[0.06em] rounded-sm bg-c-accent"
        />
      </span>
    </h1>
  );
}
