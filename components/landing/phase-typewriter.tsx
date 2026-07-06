"use client";

import { useEffect, useState } from "react";

// Our headline copy, unchanged. Typography stays ours (Suez One display, our
// sizes); "Wander more." carries the phase accent, as does the caret.
const HEADLINE =
  "font-display text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-7xl";

/**
 * The hero headline with a smooth left-to-right wipe reveal. Implemented in CSS
 * so the base state is the FULL, visible headline — the wipe only plays once,
 * on load, when JS is present and motion is welcome (data-typewriter="on"). So
 * no-JS, reduced motion, or a stalled animation all fall back to the plain
 * visible headline.
 *
 * The caret is each line's inline-end border, so it RIDES the reveal edge as
 * the line types out and rests attached to the final period — one caret at a
 * time (line 1's hands off to line 2). See the .tw-* rules in globals.css.
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
      <span className="tw-row">
        <span className="tw-line">Plan less.</span>
      </span>
      <span className="tw-row">
        <span className="tw-line text-c-accent">Wander more.</span>
      </span>
    </h1>
  );
}
