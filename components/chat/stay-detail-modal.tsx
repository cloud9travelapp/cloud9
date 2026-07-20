"use client";

// Hotel detail modal (design level 1): floats over the chat with a
// phase-tinted scrim, rounded panel, gentle float-in (reduced-motion aware).
// Content is fetched lazily on open from /api/stays/detail; every state
// (loading / no photos / no rooms / error) degrades gracefully. Room
// mini-cards show board variants as one inline choice; a room pick posts a
// structured message through the same send flow as CardSelect.

import { useEffect, useState } from "react";
import type { Room, RoomRate, StayDetail } from "@/lib/stays/types";
import { amenityLabel, LoadingDots, type Lang } from "./message-parts";
import { dmy } from "@/lib/chat/dates";

const T = {
  he: {
    rooms: "חדרים",
    pricedFor: (a: string, b: string) => `מחירים לתאריכים ${a} עד ${b}`,
    perNight: "ללילה",
    noRooms: "מחירי חדרים לא זמינים כרגע — חפשו שוב כדי לרענן.",
    error: "הפרטים לא זמינים כרגע. אפשר לנסות שוב מאוחר יותר.",
    close: "סגירה",
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

export function StayDetailModal({
  hotelId,
  hotelName,
  lang,
  onClose,
  onSelectRoom,
}: {
  hotelId: string;
  hotelName: string;
  lang: Lang;
  onClose: () => void;
  onSelectRoom: (choice: string) => void;
}) {
  const L = T[lang];
  const [detail, setDetail] = useState<StayDetail | null>(null);
  const [failed, setFailed] = useState(false);

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
        className="modal-enter relative z-[1] max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-c-border bg-c-surface shadow-2xl"
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
          <button
            type="button"
            onClick={onClose}
            aria-label={L.close}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-c-muted transition-colors hover:bg-c-accent-soft hover:text-c-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {failed ? (
            <p dir="auto" className="py-8 text-center text-sm text-c-muted">{L.error}</p>
          ) : !detail ? (
            <div className="flex justify-center py-10"><LoadingDots /></div>
          ) : (
            <>
              {/* gallery — clean, scroll-snap, only when photos exist */}
              {detail.images.length > 0 ? (
                <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                  {detail.images.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-44 w-64 flex-none snap-center rounded-2xl object-cover"
                    />
                  ))}
                </div>
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
                  {detail.rooms.map((room) => (
                    <div key={room.code} className="rounded-xl border border-c-border px-3 py-2.5">
                      <div dir="auto" className="text-sm font-semibold text-c-ink">{room.name}</div>
                      {room.features.length > 0 ? (
                        <div dir="auto" className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-c-muted">
                          {room.features.map((f) => (
                            <span key={f}>{L.feature[f] ?? f}</span>
                          ))}
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
                  ))}
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
