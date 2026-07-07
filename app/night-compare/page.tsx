"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MoonGlow from "@/components/theme/moon-glow";
import {
  CloudBubble,
  UserBubble,
  FlightCard,
} from "@/components/chat/message-parts";

// TEMPORARY comparison route for the two soft-night versions. Forces the night
// phase with the new (preview-scoped) base, and toggles the V2 moon glow.
// Delete after a version is picked.
export default function NightCompare() {
  const [v2, setV2] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const force = () => {
      if (root.dataset.phase !== "night") root.dataset.phase = "night";
      if (!root.hasAttribute("data-night-preview"))
        root.setAttribute("data-night-preview", "");
    };
    force();
    // Re-assert against the 60s clock tick so the preview holds.
    const obs = new MutationObserver(force);
    obs.observe(root, { attributes: true, attributeFilter: ["data-phase"] });
    return () => {
      obs.disconnect();
      root.removeAttribute("data-night-preview");
    };
  }, []);

  return (
    <div className="min-h-[100dvh]">
      {v2 ? <MoonGlow /> : null}

      {/* toggle */}
      <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-c-border bg-c-surface/80 p-1 text-sm shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setV2(false)}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
              !v2 ? "bg-c-accent text-c-on-accent" : "text-c-ink"
            }`}
          >
            V1 · clean
          </button>
          <button
            type="button"
            onClick={() => setV2(true)}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
              v2 ? "bg-c-accent text-c-on-accent" : "text-c-ink"
            }`}
          >
            V2 · moon glow
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-28 text-center">
        <h1 className="font-display text-5xl font-extrabold leading-[0.98] tracking-tight text-c-ink sm:text-6xl">
          Plan less.
          <br />
          <span className="text-c-accent">Wander more.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-c-muted">
          The night should feel calm and refined — soft evening blue, not
          midnight. This is the base with your text on top.
        </p>
        <div className="mt-8">
          <Link
            href="#"
            className="inline-flex items-center gap-2 rounded-full bg-c-accent px-8 py-4 text-lg font-semibold text-c-on-accent shadow-sm"
          >
            Start planning <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* surfaces are NOT yet retuned — shown only so you can see how a
            current dark-navy surface sits on the new base */}
        <p className="mt-16 text-xs uppercase tracking-wider text-c-muted">
          Surfaces below are the current dark navy — retuned after you pick
        </p>
        <div dir="ltr" className="mt-4 flex flex-col gap-3 text-start">
          <div className="flex justify-start">
            <CloudBubble>
              <span>Tokyo in April — perfect for the blossoms 🌸</span>
            </CloudBubble>
          </div>
          <div className="flex justify-end">
            <UserBubble content="Economy, please" />
          </div>
          <FlightCard
            offer={{
              id: "x",
              airlineName: "El Al",
              segments: [
                {
                  origin: "TLV",
                  destination: "NRT",
                  departTime: "2026-04-12T22:30",
                  arriveTime: "2026-04-13T16:40",
                },
              ],
              totalDurationMinutes: 820,
              stops: 0,
              price: 1180,
              currency: "USD",
            }}
            mock
            lang="en"
          />
        </div>
      </div>
    </div>
  );
}
