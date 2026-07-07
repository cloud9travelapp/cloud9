import type { CSSProperties } from "react";

// Curated, sparse scatter across the upper sky. Deterministic (no random) so it
// renders identically on server and client. top/left are %, size in px, dur/delay
// give each star its own twinkle rhythm. See .night-* rules in globals.css.
const STARS: Array<{
  top: number;
  left: number;
  size: number;
  dur: number;
  delay: number;
}> = [
  { top: 5, left: 7, size: 2, dur: 4.4, delay: 0 },
  { top: 9, left: 19, size: 1.5, dur: 5.2, delay: 1.3 },
  { top: 4, left: 31, size: 1, dur: 3.8, delay: 2.1 },
  { top: 14, left: 27, size: 2.4, dur: 6, delay: 0.7 },
  { top: 7, left: 44, size: 1.5, dur: 4.9, delay: 3.2 },
  { top: 17, left: 52, size: 1, dur: 4.2, delay: 1.8 },
  { top: 3, left: 58, size: 1.8, dur: 5.6, delay: 0.4 },
  { top: 11, left: 66, size: 1.2, dur: 3.6, delay: 2.6 },
  { top: 6, left: 78, size: 2.2, dur: 5, delay: 1.1 },
  { top: 15, left: 83, size: 1.4, dur: 4.6, delay: 3.5 },
  { top: 9, left: 93, size: 1, dur: 4, delay: 0.9 },
  { top: 22, left: 12, size: 1.6, dur: 5.4, delay: 2.3 },
  { top: 26, left: 37, size: 1, dur: 3.9, delay: 0.2 },
  { top: 24, left: 61, size: 1.8, dur: 5.8, delay: 1.6 },
  { top: 29, left: 74, size: 1.2, dur: 4.3, delay: 3 },
  { top: 21, left: 89, size: 1.5, dur: 5.1, delay: 0.6 },
  { top: 33, left: 5, size: 1.3, dur: 4.7, delay: 2.8 },
  { top: 36, left: 24, size: 1, dur: 3.7, delay: 1.4 },
  { top: 31, left: 47, size: 2, dur: 6, delay: 0.5 },
  { top: 38, left: 69, size: 1.1, dur: 4.1, delay: 2.2 },
  { top: 34, left: 96, size: 1.4, dur: 5.3, delay: 1.9 },
  { top: 41, left: 15, size: 1.6, dur: 4.8, delay: 3.3 },
  { top: 43, left: 55, size: 1, dur: 3.9, delay: 0.8 },
  { top: 40, left: 82, size: 1.7, dur: 5.5, delay: 2.5 },
];

/**
 * Twinkling night stars — the night phase's character element (rendered
 * app-wide, revealed only at night via CSS). Fixed and pointer-inert.
 */
export default function NightStars() {
  return (
    <div
      aria-hidden="true"
      className="night-sky pointer-events-none fixed inset-x-0 top-0 -z-10 h-[55%] overflow-hidden"
    >
      {STARS.map((s, i) => (
        <span
          key={i}
          className="night-star"
          style={
            {
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              "--tw-dur": `${s.dur}s`,
              "--tw-delay": `${s.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
