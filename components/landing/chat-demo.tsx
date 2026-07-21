"use client";

import { useEffect, useRef, useState } from "react";
import {
  CloudMark,
  CloudBubble,
  UserBubble,
  LoadingDots,
  QuickReplyPills,
  FlightCard,
  type FlightsPayload,
} from "@/components/chat/message-parts";

// Scripted, non-interactive preview of a real conversation, built from the
// actual chat components so it can't drift from the product. English + LTR to
// match the landing. Mock data only.
const USER_MSG = "I want to fly to Tokyo in April, somewhere around the 10th";
const REPLY_1 = "Tokyo in April is a good choice — cherry-blossom season. Which cabin should I look at?";
const OPTIONS = ["Economy", "Premium", "Business"];
const CHOICE = "Economy";
const REPLY_2 = "Two economy options departing Tel Aviv:";

const DEMO_FLIGHTS: FlightsPayload = {
  mock: true,
  lang: "en",
  offers: [
    {
      id: "d1",
      airlineName: "El Al",
      segments: [
        { origin: "TLV", destination: "NRT", departTime: "2026-04-12T22:30", arriveTime: "2026-04-13T16:40" },
      ],
      totalDurationMinutes: 820,
      stops: 0,
      price: 1180,
      currency: "USD",
    },
    {
      id: "d2",
      airlineName: "Turkish Airlines",
      segments: [
        { origin: "TLV", destination: "NRT", departTime: "2026-04-12T06:15", arriveTime: "2026-04-13T09:05" },
      ],
      totalDurationMinutes: 1010,
      stops: 1,
      price: 890,
      currency: "USD",
    },
  ],
};

// phase: 0 nothing · 1 user · 2 reply-1 typing · 3 reply-1 + pills · 4 "Economy"
// highlighted · 5 choice sent (user bubble) + pills collapse · 6 reply-2 typing
// · 7 reply-2 + cards
const FINAL = 7;
const STEP_DELAYS = [300, 800, 1200, 850, 700, 850, 1050]; // ms to reach phases 1..7

function AgentRow({ children }: { children: React.ReactNode }) {
  return <div className="demo-msg flex flex-col items-start">{children}</div>;
}

// Default container = the standalone floating card used on the current landing.
// The hero previews pass their own container (e.g. warmer `card-lift` shadow,
// column-filling width) so the demo can be framed differently without a fork.
const DEFAULT_CONTAINER =
  "mx-auto w-full max-w-md overflow-hidden rounded-panel border border-c-border bg-c-surface/80 shadow-float backdrop-blur";

export default function ChatDemo({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(FINAL); // reduced motion: full conversation, static
      return;
    }
    const el = ref.current;
    if (!el) return;
    let started = false;
    const timers: number[] = [];
    const start = () => {
      if (started) return;
      started = true;
      let acc = 0;
      STEP_DELAYS.forEach((d, i) => {
        acc += d;
        timers.push(window.setTimeout(() => setPhase(i + 1), acc));
      });
    };
    // Viewport check (no IntersectionObserver dependency) — plays once the
    // window scrolls into view.
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.85 && r.bottom > 0) start();
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    const iv = window.setInterval(check, 400);
    return () => {
      window.removeEventListener("scroll", check);
      window.clearInterval(iv);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div ref={ref} dir="ltr" className={className ?? DEFAULT_CONTAINER}>
      {/* faux header */}
      <div className="flex items-center gap-2.5 border-b border-c-border px-4 py-3">
        <CloudMark size="h-8 w-8" />
        <span className="leading-tight">
          <span className="block font-display text-sm font-bold text-c-ink">
            Cloud9 Concierge
          </span>
          <span className="flex items-center gap-1.5 text-xs text-c-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-c-accent" />
            online
          </span>
        </span>
      </div>

      {/* transcript */}
      <div className="flex min-h-[420px] flex-col justify-end gap-3 p-4">
        {phase >= 1 ? (
          <div className="demo-msg flex flex-col items-end">
            <UserBubble content={USER_MSG} />
          </div>
        ) : null}

        {phase === 2 ? (
          <AgentRow>
            <CloudBubble>
              <LoadingDots />
            </CloudBubble>
          </AgentRow>
        ) : null}

        {phase >= 3 ? (
          <AgentRow>
            <CloudBubble>
              <span className="whitespace-pre-wrap">{REPLY_1}</span>
            </CloudBubble>
            {/* pills highlight the choice (phase 4), then collapse once it's
               "sent" (phase 5+) — mirrors the real app after a pick */}
            <div className="demo-pillrow" data-collapsed={phase >= 5 ? "" : undefined}>
              <QuickReplyPills
                options={OPTIONS}
                highlight={phase >= 4 ? CHOICE : undefined}
              />
            </div>
          </AgentRow>
        ) : null}

        {phase >= 5 ? (
          <div className="demo-msg flex flex-col items-end">
            <UserBubble content={CHOICE} />
          </div>
        ) : null}

        {phase === 6 ? (
          <AgentRow>
            <CloudBubble>
              <LoadingDots />
            </CloudBubble>
          </AgentRow>
        ) : null}

        {phase >= 7 ? (
          <AgentRow>
            <CloudBubble>
              <span className="whitespace-pre-wrap">{REPLY_2}</span>
            </CloudBubble>
            <div className="mt-2 flex w-full max-w-[82%] flex-col gap-2">
              {DEMO_FLIGHTS.offers.map((offer) => (
                <FlightCard
                  key={offer.id}
                  offer={offer}
                  mock={DEMO_FLIGHTS.mock}
                  lang={DEMO_FLIGHTS.lang}
                />
              ))}
            </div>
          </AgentRow>
        ) : null}
      </div>
    </div>
  );
}
