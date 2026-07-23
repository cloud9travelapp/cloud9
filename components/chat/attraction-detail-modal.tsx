"use client";

// Attraction detail modal — mirrors StayDetailModal's shell (phase-tinted scrim,
// rounded panel, token-timed float in/out, Escape + scroll-lock) with
// attraction content: gallery + description + meta (category · duration · from
// price) + what's-included. Content is fetched lazily on open from
// /api/attractions/detail; every state degrades gracefully.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttractionDetail } from "@/lib/attractions/types";
import {
  attractionCategoryLabel,
  HeartButton,
  LoadingDots,
  type Lang,
} from "./message-parts";
import SnapGallery from "./snap-gallery";

const T = {
  he: {
    from: "החל מ־",
    perPerson: "לאדם",
    highlights: "עיקרי החוויה",
    whatsIncluded: "מה כלול",
    close: "סגירה",
    heart: "שמור למועדפים",
    unheart: "הסר מהמועדפים",
    mock: "נתוני דמה",
    select: "בחירה",
    selected: "בחרתי",
    contentNote: "התמונות והתיאור לא נטענו כרגע — אלה הפרטים שכן זמינים.",
    error: "הפרטים לא זמינים כרגע. אפשר לנסות שוב מאוחר יותר.",
  },
  en: {
    from: "from",
    perPerson: "per person",
    highlights: "Highlights",
    whatsIncluded: "What's included",
    close: "Close",
    heart: "Save to favorites",
    unheart: "Remove from favorites",
    mock: "Test data",
    select: "Select",
    selected: "Selected",
    contentNote: "Photos and the description couldn't load right now — here's what we do have.",
    error: "Details are unavailable right now. Try again later.",
  },
};

function money(amount: number, currency?: string): string {
  if (currency === "USD") return `$${amount}`;
  if (currency === "EUR") return `€${amount}`;
  return `${amount} ${currency ?? ""}`.trim();
}

function durationLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** The modal's close affordance — a soft minimal X inside a phase-tinted cloud
 *  (matches the stays modal). */
function CloudCloseButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="group relative flex h-9 w-11 flex-none items-center justify-center transition-transform duration-150 ease-out hover:scale-110 active:scale-95"
    >
      <span aria-hidden className="absolute inset-x-0 bottom-0.5 top-2.5 rounded-full bg-c-accent-soft transition-[filter] duration-150 group-hover:brightness-105" />
      <span aria-hidden className="absolute start-1.5 top-1 h-5 w-5 rounded-full bg-c-accent-soft transition-[filter] duration-150 group-hover:brightness-105" />
      <span aria-hidden className="absolute end-1.5 top-1.5 h-4 w-4 rounded-full bg-c-accent-soft transition-[filter] duration-150 group-hover:brightness-105" />
      <XIcon className="relative z-[1] mt-0.5 h-4 w-4 text-c-accent" />
    </button>
  );
}

export function AttractionDetailModal({
  attractionId,
  name,
  category,
  area,
  durationMinutes,
  fromPrice,
  currency,
  lang,
  hearted,
  onToggleHeart,
  onClose,
  onSelect,
}: {
  attractionId: string;
  name: string;
  category: string;
  area?: string;
  durationMinutes?: number;
  fromPrice: number;
  currency: string;
  lang: Lang;
  hearted?: boolean;
  onToggleHeart?: () => void;
  onClose: () => void;
  onSelect: (choice: string) => void;
}) {
  const L = T[lang];
  const [detail, setDetail] = useState<AttractionDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 150); // keep in sync with --duration-quick
  }, [closing, onClose]);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/attractions/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attractionId }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((d: AttractionDetail) => alive && setDetail(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [attractionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [requestClose]);

  const metaBits = [
    attractionCategoryLabel(lang, category),
    durationMinutes ? durationLabel(durationMinutes) : null,
    area,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={name}>
      <button
        type="button"
        aria-label={L.close}
        onClick={requestClose}
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          background: "color-mix(in srgb, var(--c-bg-1) 60%, rgba(2,8,23,0.35))",
          opacity: closing ? 0 : 1,
          transition: "opacity var(--duration-quick) var(--ease-smooth-out)",
        }}
      />
      <div
        dir={lang === "he" ? "rtl" : "ltr"}
        className={`${closing ? "modal-exit" : "modal-enter"} scroll-soft relative z-[1] max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-panel border border-c-border bg-c-surface shadow-float`}
      >
        <div className="sticky top-0 z-[1] flex items-start justify-between gap-3 border-b border-c-border bg-c-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 dir="auto" className="font-display truncate text-lg font-bold text-c-ink">{name}</h2>
            <p dir="auto" className="mt-0.5 truncate text-xs text-c-muted">{metaBits.join(" · ")}</p>
          </div>
          <div className="flex flex-none items-center gap-1">
            {onToggleHeart ? (
              <HeartButton active={!!hearted} onToggle={onToggleHeart} label={hearted ? L.unheart : L.heart} />
            ) : null}
            <CloudCloseButton label={L.close} onClose={requestClose} />
          </div>
        </div>

        <div className="px-5 py-4">
          {failed ? (
            <p dir="auto" className="py-8 text-center text-sm text-c-muted">{L.error}</p>
          ) : !detail ? (
            <div className="flex justify-center py-10"><LoadingDots /></div>
          ) : (
            <>
              {detail.contentUnavailable ? (
                <p dir="auto" className="rounded-card bg-c-accent-soft/60 px-3 py-2 text-xs text-c-muted">
                  {L.contentNote}
                </p>
              ) : null}
              {detail.images.length > 0 ? (
                <SnapGallery images={detail.images} imgClass="h-44 w-64" slidePx={264} />
              ) : null}

              <p dir="auto" className="mt-3 flex items-baseline gap-1.5 text-c-accent">
                <span className="text-xs text-c-muted">{L.from}</span>
                <span dir="ltr" className="text-xl font-bold tabular-nums">{money(fromPrice, currency)}</span>
                <span className="text-xs text-c-muted">{L.perPerson}</span>
              </p>

              {detail.description ? (
                <p dir="auto" className="mt-3 text-sm leading-relaxed text-c-muted">{detail.description}</p>
              ) : null}

              {detail.highlights && detail.highlights.length > 0 ? (
                <div className="mt-4">
                  <h3 dir="auto" className="font-display text-base font-bold text-c-ink">{L.highlights}</h3>
                  <ul dir="auto" className="mt-2 flex flex-col gap-1.5">
                    {detail.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-c-muted">
                        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-c-accent" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.included && detail.included.length > 0 ? (
                <div className="mt-4">
                  <h3 dir="auto" className="font-display text-base font-bold text-c-ink">{L.whatsIncluded}</h3>
                  <ul dir="auto" className="mt-2 flex flex-col gap-1.5">
                    {detail.included.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-c-muted">
                        <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-none text-c-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  onSelect(`${L.selected}: ${name}${area ? `, ${area}` : ""}, ${L.from} ${money(fromPrice, currency)} ${L.perPerson}`)
                }
                className="mt-5 w-full rounded-full bg-c-accent px-4 py-2.5 text-sm font-semibold text-c-on-accent transition-opacity hover:opacity-90"
              >
                {L.select}
              </button>

              {detail.mock ? <p dir="auto" className="mt-3 text-[10px] text-c-muted">{L.mock}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
