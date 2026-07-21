"use client";

// Hotel detail modal (design level 1): floats over the chat with a
// phase-tinted scrim, rounded panel, gentle float-in (reduced-motion aware).
// Content is fetched lazily on open from /api/stays/detail; every state
// (loading / no photos / no rooms / error) degrades gracefully. Room
// mini-cards show board variants as one inline choice; a room pick posts a
// structured message through the same send flow as CardSelect.

import { useEffect, useRef, useState } from "react";
import type { Room, RoomRate, StayDetail } from "@/lib/stays/types";
import { amenityLabel, HeartButton, LoadingDots, type Lang } from "./message-parts";
import { dmy } from "@/lib/chat/dates";


const T = {
  he: {
    rooms: "חדרים",
    pricedFor: (a: string, b: string) => `מחירים לתאריכים ${a} עד ${b}`,
    perNight: "ללילה",
    noRooms: "מחירי חדרים לא זמינים כרגע — חפשו שוב כדי לרענן.",
    error: "הפרטים לא זמינים כרגע. אפשר לנסות שוב מאוחר יותר.",
    close: "סגירה",
    heart: "שמור למועדפים",
    unheart: "הסר מהמועדפים",
    mock: "נתוני דמה",
    reviews: (n: number) => `${n} ביקורות`,
    board: {
      RO: "לינה בלבד",
      BB: "עם ארוחת בוקר",
      HB: "חצי פנסיון",
      FB: "פנסיון מלא",
      AI: "הכל כלול",
    } as Record<string, string>,
    pickedRoom: "בחרתי חדר",
    feature: {
      balcony: "🌅 מרפסת",
      seaView: "🌊 נוף לים",
      terrace: "☀️ טרסה",
      suite: "✨ סוויטה",
    } as Record<string, string>,
  },
  en: {
    rooms: "Rooms",
    pricedFor: (a: string, b: string) => `Prices for ${a} to ${b}`,
    perNight: "per night",
    noRooms: "Room prices aren't available right now — search again to refresh.",
    error: "Details are unavailable right now. Try again later.",
    close: "Close",
    heart: "Save to favorites",
    unheart: "Remove from favorites",
    mock: "Test data",
    reviews: (n: number) => `${n} reviews`,
    board: {
      RO: "Room only",
      BB: "With breakfast",
      HB: "Half board",
      FB: "Full board",
      AI: "All inclusive",
    } as Record<string, string>,
    pickedRoom: "Selected room",
    feature: {
      balcony: "🌅 Balcony",
      seaView: "🌊 Sea view",
      terrace: "☀️ Terrace",
      suite: "✨ Suite",
    } as Record<string, string>,
  },
};

function money(amount: number, currency?: string): string {
  if (currency === "USD") return `$${amount}`;
  if (currency === "EUR") return `€${amount}`;
  return `${amount} ${currency ?? ""}`.trim();
}

function boardLabel(lang: Lang, rate: RoomRate): string {
  return T[lang].board[rate.board] ?? rate.boardName ?? rate.board;
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** The modal's close affordance (Max's pick, 2026-07-21): a soft minimal X
 *  with rounded caps inside a subtle phase-tinted cloud — quiet lobes, gentle
 *  hover soften (slight grow + brighten). */
function CloudCloseButton({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
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

/**
 * The locked gallery pattern (snap scroll, hidden scrollbar, dots below with
 * the active dot elongating), extracted so the hotel gallery and the per-room
 * mini-gallery can't drift. Dots render only when there's something to snap.
 */
function SnapGallery({
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
            className={`flex-none snap-center rounded-2xl object-cover ${imgClass}`}
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

export function StayDetailModal({
  hotelId,
  hotelName,
  lang,
  hearted,
  onToggleHeart,
  onClose,
  onSelectRoom,
}: {
  hotelId: string;
  hotelName: string;
  lang: Lang;
  /** Heart state + toggle — same collection as the card hearts. */
  hearted?: boolean;
  onToggleHeart?: () => void;
  onClose: () => void;
  onSelectRoom: (choice: string) => void;
}) {
  const L = T[lang];
  const [detail, setDetail] = useState<StayDetail | null>(null);
  const [failed, setFailed] = useState(false);
  // Room code whose mini-gallery is open (tap the room's photo/name to toggle).
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/stays/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelId }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((d: StayDetail) => alive && setDetail(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [hotelId]);

  // Escape closes; page scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [onClose]);

  function pickRoom(room: Room, rate: RoomRate) {
    const price = `${money(rate.pricePerNight, detail?.currency)} ${L.perNight}`;
    onSelectRoom(
      `${L.pickedRoom}: ${hotelName}, ${room.name}, ${boardLabel(lang, rate)}, ${price}`,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={hotelName}
    >
      {/* phase-tinted scrim */}
      <button
        type="button"
        aria-label={L.close}
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          background: "color-mix(in srgb, var(--c-bg-1) 60%, rgba(2,8,23,0.35))",
        }}
      />
      {/* panel */}
      <div
        dir={lang === "he" ? "rtl" : "ltr"}
        className="modal-enter scroll-soft relative z-[1] max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-c-border bg-c-surface shadow-2xl"
      >
        {/* header */}
        <div className="sticky top-0 z-[1] flex items-start justify-between gap-3 border-b border-c-border bg-c-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 dir="auto" className="font-display truncate text-lg font-bold text-c-ink">
              {detail?.name ?? hotelName}
            </h2>
            {detail?.area || detail?.address ? (
              <p dir="auto" className="mt-0.5 truncate text-xs text-c-muted">
                {[detail?.area, detail?.address].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {typeof detail?.reviewScore === "number" ? (
              <p className="mt-0.5 text-xs text-c-accent">
                {detail.reviewScore.toFixed(1)}/10
                {detail.reviewCount ? ` · ${L.reviews(detail.reviewCount)}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-1">
            {onToggleHeart ? (
              <HeartButton
                active={!!hearted}
                onToggle={onToggleHeart}
                label={hearted ? T[lang].unheart : T[lang].heart}
              />
            ) : null}
            <CloudCloseButton label={L.close} onClose={onClose} />
          </div>
        </div>

        <div className="px-5 py-4">
          {failed ? (
            <p dir="auto" className="py-8 text-center text-sm text-c-muted">{L.error}</p>
          ) : !detail ? (
            <div className="flex justify-center py-10"><LoadingDots /></div>
          ) : (
            <>
              {/* gallery — full-bleed to the panel edge so photos breathe;
                  scrollbar hidden (the peeking next photo IS the affordance),
                  nav = edge fades or snap dots (variant under review) */}
              {detail.images.length > 0 ? (
                <SnapGallery images={detail.images} imgClass="h-44 w-64" slidePx={264} />
              ) : null}

              {detail.description ? (
                <p dir="auto" className="mt-3 text-sm leading-relaxed text-c-muted">
                  {detail.description}
                </p>
              ) : null}

              {detail.amenities.length > 0 ? (
                <div dir="auto" className="mt-3 flex flex-wrap gap-1.5">
                  {detail.amenities.map((a) => (
                    <span key={a} className="rounded-full bg-c-accent-soft px-2.5 py-1 text-xs text-c-accent">
                      {amenityLabel(lang, a)}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* rooms — the heart of it */}
              <h3 dir="auto" className="font-display mt-5 text-base font-bold text-c-ink">
                {L.rooms}
              </h3>
              {detail.pricedFor ? (
                <p dir="auto" className="mt-0.5 text-[11px] text-c-muted">
                  {L.pricedFor(dmy(detail.pricedFor.checkIn), dmy(detail.pricedFor.checkOut))}
                </p>
              ) : null}
              {detail.rooms && detail.rooms.length > 0 ? (
                <div className="mt-2 flex flex-col gap-2">
                  {detail.rooms.map((room) => {
                    const header = (
                      <>
                        {/* room photo when the content carries one — absent
                            rooms render exactly as before (honest fallback) */}
                        {room.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={room.images[0]}
                            alt={room.name}
                            loading="lazy"
                            className="h-14 w-20 flex-none rounded-lg object-cover"
                          />
                        ) : null}
                        <div dir="auto" className="min-w-0 text-sm font-semibold text-c-ink">
                          {room.name}
                          {room.features.length > 0 ? (
                            <div dir="auto" className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-normal text-c-muted">
                              {room.features.map((f) => (
                                <span key={f}>{L.feature[f] ?? f}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                    );
                    const open = expandedRoom === room.code;
                    return (
                    <div key={room.code} className="rounded-xl border border-c-border px-3 py-2.5">
                      {room.images?.length ? (
                        /* tap the photo/name to open this room's mini-gallery */
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpandedRoom(open ? null : room.code)}
                          className="flex w-full items-start gap-2.5 text-start"
                        >
                          {header}
                        </button>
                      ) : (
                        <div className="flex items-start gap-2.5">{header}</div>
                      )}
                      {open && room.images?.length ? (
                        <div className="mt-2">
                          <SnapGallery
                            images={room.images}
                            imgClass="h-32 w-48"
                            slidePx={200}
                            bleedClass="-mx-3"
                            padClass="px-3"
                          />
                        </div>
                      ) : null}
                      <div dir="auto" className="mt-2 flex flex-wrap gap-1.5">
                        {room.rates.map((rate) => (
                          <button
                            key={rate.board + (rate.boardName ?? "")}
                            type="button"
                            onClick={() => pickRoom(room, rate)}
                            className="rounded-full border border-c-accent/40 bg-c-surface px-3 py-1.5 text-xs text-c-accent transition-colors hover:bg-c-accent hover:text-c-on-accent"
                          >
                            {boardLabel(lang, rate)}
                            {" · "}
                            <span dir="ltr" className="tabular-nums">
                              {money(rate.pricePerNight, detail.currency)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p dir="auto" className="mt-2 text-xs text-c-muted">{L.noRooms}</p>
              )}

              {detail.mock ? (
                <p dir="auto" className="mt-4 text-[10px] text-c-muted">{L.mock}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
