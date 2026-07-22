"use client";

import { useRef, useState } from "react";

/**
 * The locked gallery pattern (snap scroll, hidden scrollbar, dots below with
 * the active dot elongating), SHARED so the hotel gallery, the per-room
 * mini-gallery, and the stay-card preview gallery can't drift. Dots render only
 * when there's something to snap. The container scrolls horizontally on touch;
 * a swipe scrolls (the browser suppresses the click), so it never fights a
 * parent's tap handler. Motion-token/reduced-motion behaviour is inherited from
 * globals.css (the dot uses a plain transition).
 */
export default function SnapGallery({
  images,
  imgClass,
  slidePx,
  bleedClass = "-mx-5",
  padClass = "px-5",
}: {
  images: string[];
  imgClass: string;
  /** Slide width + gap in px — drives the active-dot scroll math. */
  slidePx: number;
  bleedClass?: string;
  padClass?: string;
}) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className={`relative ${bleedClass}`}>
      <div
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (!el) return;
          setActive(
            Math.min(
              images.length - 1,
              Math.round(Math.abs(el.scrollLeft) / slidePx),
            ),
          );
        }}
        className={`scroll-hide flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 ${padClass}`}
      >
        {images.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className={`flex-none snap-center rounded-card object-cover ${imgClass}`}
          />
        ))}
      </div>
      {images.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-4 bg-c-accent" : "w-1.5 bg-c-border"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
