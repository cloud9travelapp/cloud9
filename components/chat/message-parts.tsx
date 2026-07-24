"use client";

// Presentational chat pieces shared by the real chat (ChatClient) and the
// landing's scripted demo, so the demo can never drift from the product.
// View + local UI state only (e.g. a card's expand toggle) — no parsing.

import { useEffect, useRef, useState } from "react";
import { CloudMarkClassic } from "@/components/brand/cloud-marks";
import SnapGallery from "./snap-gallery";
import { dmy, isoDay, nightsBetween } from "@/lib/chat/dates";

export type FlightSegmentView = {
  origin: string;
  destination: string;
  departTime: string;
  arriveTime: string;
};
export type FlightOfferView = {
  id: string;
  airlineName: string;
  segments: FlightSegmentView[];
  totalDurationMinutes: number;
  stops: number;
  price: number;
  currency: string;
};
export type Lang = "he" | "en";
export type FlightsPayload = {
  mock: boolean;
  lang: Lang;
  offers: FlightOfferView[];
};

export type StayOfferView = {
  id: string;
  name: string;
  type: string;
  area: string;
  stars: number;
  amenities: string[];
  distanceKey?: string;
  distanceMinutes?: number;
  distanceKm?: number; // straight-line km from the searched point (city center)
  pricePerNight: number;
  totalPrice: number;
  currency: string;
};
/** Client-side re-sort modes for a stays card stack. "fit" = the delivered
 *  order (server smart sort) with the recommended card floated first. */
export type StaySortMode = "fit" | "priceAsc" | "priceDesc" | "distance";

export type StaysPayload = {
  mock: boolean;
  lang: Lang;
  offers: StayOfferView[];
  /** The concierge's named best-fit pick — badges its card and floats it to
   *  the top of the stack. Only ever an id present in offers. */
  recommendedId?: string;
};

// ── Attractions (agent #3) ───────────────────────────────────────────────
export type AttractionOfferView = {
  id: string;
  name: string;
  category: string; // neutral key, localized in the UI
  area?: string;
  durationMinutes?: number;
  fromPrice?: number; // per-person "from" price; absent = no price line (never "0")
  currency: string;
  distanceKm?: number;
  rating?: number; // DISPLAY-WHEN-PRESENT only (never depended on)
  summary?: string;
};
/** Client-side re-sort modes for an attractions card stack. "fit" = the
 *  delivered order with the recommended card floated first. */
export type AttractionSortMode = "fit" | "priceAsc" | "priceDesc" | "distance";
export type AttractionsPayload = {
  mock: boolean;
  lang: Lang;
  offers: AttractionOfferView[];
  recommendedId?: string;
};

export type DateMode = "single" | "range";
export type DatesPayload = {
  lang: Lang;
  mode: DateMode;
  min?: string; // YYYY-MM-DD; the calendar clamps it to today regardless
  max?: string; // YYYY-MM-DD; defaults to one year out
};

/** Accent circle with the white Cloud9 mark — the Concierge avatar. */
export function CloudMark({ size = "h-9 w-9" }: { size?: string }) {
  return (
    <span
      className={`flex ${size} flex-none items-center justify-center rounded-full bg-c-accent text-c-on-accent`}
    >
      <CloudMarkClassic className="h-1/2 w-1/2" />
    </span>
  );
}

/**
 * A real cloud bubble: a rounded body plus overlapping "puff" lobes rising off
 * the top, all the same cloud-white. The single drop-shadow on the wrapper
 * traces the whole silhouette, so it reads as one soft cloud — not a blob.
 */
// One soft ambient shadow, applied as box-shadow (NOT filter: drop-shadow).
// drop-shadow traces the rendered alpha and re-rasterizes every frame while the
// reply streams in — on mobile it briefly paints the square bounding box, then
// snaps to the rounded silhouette. box-shadow follows each element's
// border-radius geometry, so it's the correct organic shape from the first
// frame and never re-traces. The lobes sit BEHIND the opaque bubble (z-0 vs
// z-[1]), so their shadow only shows where they poke out — no internal seams.
const BUBBLE_SHADOW = "0 8px 16px rgba(2,8,23,0.16)";

export function CloudBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-fit max-w-[82%]">
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -top-2.5 start-4 h-7 w-7 rounded-full bg-c-surface"
          style={{ boxShadow: BUBBLE_SHADOW }}
        />
        <span
          aria-hidden="true"
          className="absolute -top-4 start-9 h-11 w-11 rounded-full bg-c-surface"
          style={{ boxShadow: BUBBLE_SHADOW }}
        />
        <span
          aria-hidden="true"
          className="absolute -top-2 end-5 h-8 w-8 rounded-full bg-c-surface"
          style={{ boxShadow: BUBBLE_SHADOW }}
        />
        <div
          dir="auto"
          className="relative z-[1] bg-c-surface px-4 py-2.5 text-[15px] leading-relaxed text-c-ink"
          style={{
            borderRadius: "26px 24px 28px 22px / 22px 28px 24px 26px",
            boxShadow: BUBBLE_SHADOW,
            unicodeBidi: "plaintext",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The user's own message bubble (accent fill, own bidi direction). */
export function UserBubble({ content }: { content: string }) {
  return (
    <div
      dir="auto"
      className="w-fit max-w-[82%] rounded-card bg-c-accent px-4 py-2.5 text-[15px] leading-relaxed text-c-on-accent shadow-rest [unicode-bidi:plaintext]"
    >
      <span className="whitespace-pre-wrap">{content}</span>
    </div>
  );
}

/** The "thinking" indicator shown in an empty assistant bubble — the cloud mark
 *  breathing gently. Static mark under reduced motion. */
export function LoadingDots() {
  return (
    <span
      className="inline-flex py-1 text-c-accent"
      role="status"
      aria-label="Thinking…"
    >
      <CloudMarkClassic className="logo-breathe h-6 w-6" />
    </span>
  );
}

/**
 * Quick-reply option pills. Interactive when `onSelect` is given (real chat);
 * inert + aria-hidden when omitted (landing demo preview). `highlight` marks one
 * option as pressed (the demo uses it to show a choice being made).
 */
export function QuickReplyPills({
  options,
  onSelect,
  highlight,
  className = "",
}: {
  options: string[];
  onSelect?: (opt: string) => void;
  highlight?: string;
  className?: string;
}) {
  const interactive = typeof onSelect === "function";
  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${className}`}>
      {options.map((opt, oi) => {
        const pressed = opt === highlight;
        return (
          <button
            key={oi}
            type="button"
            dir="auto"
            onClick={interactive ? () => onSelect!(opt) : undefined}
            tabIndex={interactive ? 0 : -1}
            aria-hidden={interactive ? undefined : true}
            className={`rounded-full border px-4 py-2 text-sm transition-colors${
              interactive ? "" : " pointer-events-none"
            } ${
              pressed
                ? "border-c-accent bg-c-accent text-c-on-accent"
                : "border-c-border bg-c-surface text-c-accent hover:bg-c-accent-soft"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function isoTime(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2})/); // wall-clock time straight from the ISO
  return m ? m[1] : iso;
}

const STAY_TYPE_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    hotel: "מלון",
    apartment: "דירה",
    boutique: "מלון בוטיק",
    hostel: "הוסטל",
    resort: "ריזורט",
  },
  en: {
    hotel: "Hotel",
    apartment: "Apartment",
    boutique: "Boutique hotel",
    hostel: "Hostel",
    resort: "Resort",
  },
};

const AMENITY_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    breakfast: "ארוחת בוקר",
    pool: "בריכה",
    wifi: "וויי-פיי",
    seaview: "נוף לים",
    spa: "ספא",
    kitchen: "מטבחון",
    parking: "חניה",
    gym: "חדר כושר",
    aircon: "מיזוג",
    rooftop: "גג",
  },
  en: {
    breakfast: "Breakfast",
    pool: "Pool",
    wifi: "Wi-Fi",
    seaview: "Sea view",
    spa: "Spa",
    kitchen: "Kitchen",
    parking: "Parking",
    gym: "Gym",
    aircon: "A/C",
    rooftop: "Rooftop",
  },
};

/** Amenity chip label for a neutral key — shared with the detail modal. */
export function amenityLabel(lang: Lang, key: string): string {
  return AMENITY_LABELS[lang][key] ?? key;
}

const DISTANCE_LANDMARKS: Record<Lang, Record<string, string>> = {
  he: {
    beach: "מהחוף",
    center: "מהמרכז",
    oldTown: "מהעיר העתיקה",
    station: "מהתחנה",
    park: "מהפארק",
  },
  en: {
    beach: "beach",
    center: "center",
    oldTown: "old town",
    station: "station",
    park: "park",
  },
};

const LABELS: Record<
  Lang,
  {
    duration: (min: number) => string;
    stops: (n: number) => string;
    mock: string;
    perNight: string;
    total: string;
    stars: (n: number) => string;
    stayType: (t: string) => string;
    amenity: (k: string) => string;
    distance: (key: string, minutes: number) => string;
    kmFromCenter: (km: number) => string;
    heart: string;
    unheart: string;
    showMore: string;
    noMore: string;
    staleList: string;
    recommended: string;
    sortLabel: Record<StaySortMode, string>;
    sortAria: string;
    select: string;
    selected: string; // prefix for the structured choice message
    layover: (duration: string, hub: string) => string;
    confirm: string;
    pickDate: string;
    pickStart: string;
    pickEnd: string;
    prevMonth: string;
    nextMonth: string;
    nights: (n: number) => string;
    pickedSingle: (iso: string) => string;
    pickedRange: (startIso: string, endIso: string, nights: number) => string;
  }
> = {
  he: {
    duration: (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m === 0 ? `${h}ש` : `${h}ש ${m}ד`;
    },
    stops: (n) => (n <= 0 ? "ישיר" : n === 1 ? "עצירה אחת" : `${n} עצירות`),
    mock: "נתוני דמה",
    perNight: "ללילה",
    total: 'סה"כ',
    stars: (n) => (n === 1 ? "כוכב אחד" : `${n} כוכבים`),
    stayType: (t) => STAY_TYPE_LABELS.he[t] ?? t,
    amenity: (k) => AMENITY_LABELS.he[k] ?? k,
    distance: (key, minutes) =>
      `${minutes} דק׳ הליכה ${DISTANCE_LANDMARKS.he[key] ?? ""}`.trim(),
    kmFromCenter: (km) => `${km} ק"מ מהמרכז`,
    heart: "שמור למועדפים",
    unheart: "הסר מהמועדפים",
    showMore: "הצג עוד",
    noMore: "אין עוד אופציות במלאי הזמין לי",
    staleList: "הרשימה התיישנה — אפשר לבקש חיפוש מעודכן בצ'אט",
    recommended: "ההמלצה שלי",
    sortLabel: {
      fit: "הכי מתאים לי",
      priceAsc: "זול→יקר",
      priceDesc: "יקר→זול",
      distance: "קרוב למרכז",
    },
    sortAria: "סידור התוצאות",
    select: "בחר",
    selected: "בחרתי",
    layover: (dur, hub) => `עצירה ${dur} ב-${hub}`,
    confirm: "אישור",
    pickDate: "בחר תאריך",
    pickStart: "בחר תאריך התחלה",
    pickEnd: "בחר תאריך סיום",
    prevMonth: "חודש קודם",
    nextMonth: "חודש הבא",
    nights: (n) => (n === 1 ? "לילה אחד" : `${n} לילות`),
    pickedSingle: (iso) => `בחרתי תאריך: ${dmy(iso)}`,
    pickedRange: (startIso, endIso, nights) =>
      `בחרתי תאריכים: ${dmy(startIso)} עד ${dmy(endIso)} (${nights === 1 ? "לילה אחד" : `${nights} לילות`})`,
  },
  en: {
    duration: (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    },
    stops: (n) => (n <= 0 ? "Direct" : n === 1 ? "1 stop" : `${n} stops`),
    mock: "Test data",
    perNight: "per night",
    total: "total",
    stars: (n) => `${n}-star`,
    stayType: (t) => STAY_TYPE_LABELS.en[t] ?? t,
    amenity: (k) => AMENITY_LABELS.en[k] ?? k,
    distance: (key, minutes) =>
      `${minutes} min walk to the ${DISTANCE_LANDMARKS.en[key] ?? "center"}`,
    kmFromCenter: (km) => `${km} km from center`,
    heart: "Save to favorites",
    unheart: "Remove from favorites",
    showMore: "Show more",
    noMore: "No more options in my available inventory",
    staleList: "This list has aged out — ask for a fresh search in chat",
    recommended: "My pick",
    sortLabel: {
      fit: "Best fit",
      priceAsc: "Price ↑",
      priceDesc: "Price ↓",
      distance: "Near center",
    },
    sortAria: "Sort results",
    select: "Select",
    selected: "Selected",
    layover: (dur, hub) => `${dur} layover in ${hub}`,
    confirm: "Confirm",
    pickDate: "Pick a date",
    pickStart: "Pick a start date",
    pickEnd: "Pick an end date",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    nights: (n) => (n === 1 ? "1 night" : `${n} nights`),
    pickedSingle: (iso) => `Selected date: ${dmy(iso)}`,
    pickedRange: (startIso, endIso, nights) =>
      `Selected dates: ${dmy(startIso)} to ${dmy(endIso)} (${nights === 1 ? "1 night" : `${nights} nights`})`,
  },
};

/** Shared "Select" action for any offer card — posts a structured, human-
 *  readable choice as the user's message. Future card types (dining, transport)
 *  reuse this: add an `onSelect` prop and a localized summary, render <CardSelect>.
 *  stopPropagation keeps it from toggling an expandable card body. */
function CardSelect({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="mt-2 block w-fit rounded-full bg-c-accent px-4 py-1.5 text-xs font-semibold text-c-on-accent transition-opacity hover:opacity-90"
    >
      {label}
    </button>
  );
}

function PlaneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-0.5 h-3.5 w-3.5 flex-none text-c-accent"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  );
}

function minutesBetween(a: string, b: string): number {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / 60000));
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function FlightCard({
  offer,
  mock,
  lang,
  hearted,
  onToggleHeart,
  onSelect,
}: {
  offer: FlightOfferView;
  mock: boolean;
  lang: Lang;
  /** Real chat only: heart state + toggle (absent in the landing demo). */
  hearted?: boolean;
  onToggleHeart?: () => void;
  onSelect?: (choice: string) => void;
}) {
  const L = LABELS[lang];
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const price =
    offer.currency === "USD"
      ? `$${offer.price}`
      : `${offer.price} ${offer.currency}`;
  const durationDir = lang === "he" ? "rtl" : "ltr";
  const [expanded, setExpanded] = useState(false);
  // hubs = the stop airports (each leg's destination except the final one)
  const hubs = offer.segments.slice(0, -1).map((s) => s.destination);
  // Only connecting flights expand; direct flights render flat (no chevron).
  const expandable = offer.segments.length > 1;

  return (
    <div
      className={`rounded-card border border-c-border bg-c-surface px-3 py-2.5 shadow-rest${
        expandable ? " cursor-pointer select-none" : ""
      }`}
      onClick={expandable ? () => setExpanded((e) => !e) : undefined}
      aria-expanded={expandable ? expanded : undefined}>
      {/* airline (left) + heart + price (right) */}
      <div dir="ltr" className="flex items-center justify-between gap-3">
        <span dir="auto" className="truncate text-sm font-semibold text-c-ink">
          {offer.airlineName}
        </span>
        <span className="flex flex-none items-center gap-1">
          {onToggleHeart ? (
            <HeartButton
              active={!!hearted}
              onToggle={onToggleHeart}
              label={hearted ? L.unheart : L.heart}
            />
          ) : null}
          <span className="text-lg font-bold text-c-accent tabular-nums">
            {price}
          </span>
        </span>
      </div>

      {/* timeline — always LTR so departure stays on the left */}
      <div dir="ltr" className="mt-2 flex items-center gap-2">
        <div className="flex flex-col items-center">
          <span className="text-[15px] font-medium text-c-ink tabular-nums">
            {isoTime(first.departTime)}
          </span>
          <span className="text-xs text-c-muted">{first.origin}</span>
        </div>

        <div className="flex flex-1 flex-col items-center">
          <span dir={durationDir} className="text-[11px] text-c-muted tabular-nums">
            {L.duration(offer.totalDurationMinutes)}
          </span>
          <div className="my-1 flex w-full items-center">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-c-accent" />
            <span className="flex-1 border-t border-dashed border-c-accent/40" />
            <PlaneIcon />
            <span className="flex-1 border-t border-dashed border-c-accent/40" />
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-c-accent" />
          </div>
          <span dir={durationDir} className="text-[11px] text-c-muted">
            {L.stops(offer.stops)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[15px] font-medium text-c-ink tabular-nums">
            {isoTime(last.arriveTime)}
          </span>
          <span className="text-xs text-c-muted">{last.destination}</span>
        </div>
      </div>

      {/* connection indicator + expand affordance — connecting flights only */}
      {expandable ? (
        <div
          dir="auto"
          className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-c-muted"
        >
          <span>
            {lang === "he" ? "דרך" : "via"}{" "}
            <span dir="ltr" className="tabular-nums">
              {hubs.join(", ")}
            </span>
          </span>
          <Chevron open={expanded} />
        </div>
      ) : null}

      {/* expanded per-leg detail: each leg's times + route, layovers between */}
      {expandable && expanded ? (
        <div dir="ltr" className="mt-2 space-y-2 border-t border-c-border pt-2">
          {offer.segments.map((seg, i) => (
            <div key={i}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-c-ink tabular-nums">
                  {isoTime(seg.departTime)} · {seg.origin}
                </span>
                <span className="flex-1 border-t border-dashed border-c-accent/40" />
                <span className="font-medium text-c-ink tabular-nums">
                  {isoTime(seg.arriveTime)} · {seg.destination}
                </span>
              </div>
              {i < offer.segments.length - 1 ? (
                <div dir="auto" className="mt-1 text-center text-[11px] text-c-muted">
                  {L.layover(
                    L.duration(
                      minutesBetween(
                        seg.arriveTime,
                        offer.segments[i + 1].departTime,
                      ),
                    ),
                    seg.destination,
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* mock-data tag (per language, only while mock) */}
      {mock ? (
        <div dir="auto" className="mt-1.5 text-[10px] text-c-muted">
          {L.mock}
        </div>
      ) : null}

      {onSelect ? (
        <CardSelect
          label={L.select}
          onSelect={() =>
            onSelect(
              `${L.selected}: ${offer.airlineName}, ${first.origin}→${last.destination}, ${L.stops(offer.stops)}, ${first.departTime.slice(0, 10)}, ${price}`,
            )
          }
        />
      ) : null}
    </div>
  );
}

function money(amount: number, currency: string): string {
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}

/** "Show more" under a stays stack: idle button → loading → honest terminal
 *  states (exhausted inventory / stale cache) as plain text lines. */
export function ShowMoreButton({
  lang,
  state,
  onClick,
}: {
  lang: Lang;
  state: "idle" | "loading" | "exhausted" | "stale";
  onClick: () => void;
}) {
  const L = LABELS[lang];
  if (state === "exhausted") {
    return (
      <p dir="auto" className="self-center px-1 text-xs text-c-muted">
        {L.noMore}
      </p>
    );
  }
  if (state === "stale") {
    return (
      <p dir="auto" className="self-center px-1 text-xs text-c-muted">
        {L.staleList}
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={state === "loading"}
      onClick={onClick}
      className="self-center rounded-full border border-c-border bg-c-surface px-3 py-1.5 text-xs text-c-accent transition-colors hover:bg-c-accent-soft disabled:opacity-50"
    >
      {L.showMore}
    </button>
  );
}

/** The heart: hearts an item into the trip's favorites (generic — stays
 *  today, every future card type reuses it). Toggling never opens the card's
 *  detail surface (stopPropagation). */
export function HeartButton({
  active,
  onToggle,
  label,
  className = "",
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors motion-safe:active:scale-90 hover:bg-c-accent-soft ${
        active ? "text-c-accent" : "text-c-muted"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </button>
  );
}

/** Compact sort chips above a stays card stack — client-side re-sort only
 *  (chips for discovery; asking in chat works too and wins). */
export function StaySortChips({
  lang,
  active,
  onChange,
}: {
  lang: Lang;
  active: StaySortMode;
  onChange: (mode: StaySortMode) => void;
}) {
  const L = LABELS[lang];
  const MODES: StaySortMode[] = ["fit", "priceAsc", "priceDesc", "distance"];
  return (
    <div dir="auto" role="group" aria-label={L.sortAria} className="flex flex-wrap gap-1.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={m === active}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            m === active
              ? "border-c-accent bg-c-accent text-c-on-accent"
              : "border-c-border bg-c-surface text-c-muted hover:border-c-accent/50 hover:text-c-ink"
          }`}
        >
          {L.sortLabel[m]}
        </button>
      ))}
    </div>
  );
}

export function StayCard({
  offer,
  mock,
  lang,
  recommended,
  hearted,
  onToggleHeart,
  onSelect,
  onOpenDetail,
}: {
  offer: StayOfferView;
  mock: boolean;
  lang: Lang;
  /** The concierge's named pick — small badge + accent border. */
  recommended?: boolean;
  /** Real chat only: heart state + toggle (absent in the landing demo). */
  hearted?: boolean;
  onToggleHeart?: () => void;
  onSelect?: (choice: string) => void;
  /** Real chat only: tapping the card body opens the detail modal. */
  onOpenDetail?: () => void;
}) {
  const L = LABELS[lang];
  const cardRef = useRef<HTMLDivElement>(null);
  // Lazy hotel preview gallery: images live only in the Content API, so fetch
  // them (light images-only endpoint) when the card scrolls into view. null =
  // not fetched yet, [] = none (card stays text-only — the honest fallback).
  // Real chat only (onOpenDetail present); skipped in the scripted demo.
  const [images, setImages] = useState<string[] | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    if (!onOpenDetail) return;
    const el = cardRef.current;
    if (!el) return;
    let fetched = false;
    const load = () => {
      if (fetched) return;
      fetched = true;
      fetch("/api/stays/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId: offer.id }),
      })
        .then((r) => (r.ok ? r.json() : { images: [] }))
        .then((d: { images?: string[] }) => setImages(d.images ?? []))
        .catch(() => setImages([]));
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load();
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // offer.id identifies the hotel; onOpenDetail presence gates real chat.
  }, [offer.id, onOpenDetail]);

  // Ease the gallery open (grid-rows) the frame after images arrive, so the
  // card grows smoothly instead of snapping.
  useEffect(() => {
    if (images && images.length > 0) {
      const raf = requestAnimationFrame(() => setGalleryOpen(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [images]);

  return (
    <div
      ref={cardRef}
      className={`rounded-card border ${
        recommended ? "border-c-accent/50" : "border-c-border"
      } bg-c-surface px-3 py-2.5 shadow-rest${
        onOpenDetail ? " cursor-pointer select-none" : ""
      }`}
      onClick={onOpenDetail}>
      {images && images.length > 0 ? (
        <div className={`card-gallery-reveal${galleryOpen ? " open" : ""}`}>
          <div>
            <div className="mb-2">
              <SnapGallery
                images={images}
                imgClass="h-36 w-64"
                slidePx={264}
                bleedClass="-mx-3"
                padClass="px-3"
              />
            </div>
          </div>
        </div>
      ) : null}
      {recommended ? (
        <div dir="auto" className="mb-1.5">
          <span className="rounded-full bg-c-accent px-2 py-0.5 text-[11px] font-semibold text-c-on-accent">
            {L.recommended}
          </span>
        </div>
      ) : null}
      {/* name + type (start) · price per night (end, LTR) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div dir="auto" className="truncate text-sm font-semibold text-c-ink">
            {offer.name}
          </div>
          <div dir="auto" className="truncate text-xs text-c-muted">
            {L.stayType(offer.type)} · {offer.area}
          </div>
        </div>
        <div className="flex flex-none flex-col items-end">
          {onToggleHeart ? (
            <HeartButton
              active={!!hearted}
              onToggle={onToggleHeart}
              label={hearted ? L.unheart : L.heart}
              className="-me-1.5 -mt-1"
            />
          ) : null}
          <div dir="ltr" className="text-lg font-bold text-c-accent tabular-nums">
            {money(offer.pricePerNight, offer.currency)}
          </div>
          <div className="text-[11px] text-c-muted">{L.perNight}</div>
        </div>
      </div>

      {/* stars + distance. Real offers carry a computed km-from-center; the
          mock keeps its walking-minutes flavor; neither → no line. */}
      {offer.stars > 0 ||
      typeof offer.distanceKm === "number" ||
      (offer.distanceKey && typeof offer.distanceMinutes === "number") ? (
        <div dir="auto" className="mt-1.5 flex items-center gap-2 text-xs text-c-muted">
          {offer.stars > 0 ? (
            <span
              className="flex-none text-c-accent"
              aria-label={L.stars(offer.stars)}
            >
              {"★".repeat(offer.stars)}
            </span>
          ) : null}
          {typeof offer.distanceKm === "number" ? (
            <span className="truncate">{L.kmFromCenter(offer.distanceKm)}</span>
          ) : offer.distanceKey && typeof offer.distanceMinutes === "number" ? (
            <span className="truncate">
              {L.distance(offer.distanceKey, offer.distanceMinutes)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* amenity highlights */}
      {offer.amenities.length ? (
        <div dir="auto" className="mt-2 flex flex-wrap gap-1.5">
          {offer.amenities.map((a) => (
            <span
              key={a}
              className="rounded-full bg-c-accent-soft px-2 py-0.5 text-[11px] text-c-accent"
            >
              {L.amenity(a)}
            </span>
          ))}
        </div>
      ) : null}

      {/* total (LTR number) + mock tag */}
      <div
        dir="auto"
        className="mt-2 flex items-center justify-between gap-3 text-[11px] text-c-muted"
      >
        <span>
          {L.total}:{" "}
          <span dir="ltr" className="tabular-nums">
            {money(offer.totalPrice, offer.currency)}
          </span>
        </span>
        {mock ? <span>{L.mock}</span> : null}
      </div>

      {onSelect ? (
        <CardSelect
          label={L.select}
          onSelect={() =>
            onSelect(
              `${L.selected}: ${offer.name}, ${offer.area}${
                offer.stars > 0 ? `, ${L.stars(offer.stars)}` : ""
              }, ${money(offer.pricePerNight, offer.currency)} ${L.perNight}`,
            )
          }
        />
      ) : null}
    </div>
  );
}

// ── Attractions card (agent #3) ──────────────────────────────────────────
const ATTRACTION_CATEGORY_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    tours: "סיורים",
    museums: "מוזיאונים",
    outdoors: "טבע וטיולים",
    food: "אוכל ושתייה",
    nightlife: "חיי לילה",
    family: "משפחה",
    water: "פעילויות מים",
    culture: "תרבות",
    adventure: "הרפתקאות",
    wellness: "ספא ורוגע",
  },
  en: {
    tours: "Tours",
    museums: "Museums",
    outdoors: "Outdoors",
    food: "Food & drink",
    nightlife: "Nightlife",
    family: "Family",
    water: "On the water",
    culture: "Culture",
    adventure: "Adventure",
    wellness: "Wellness",
  },
};

export function attractionCategoryLabel(lang: Lang, key: string): string {
  return ATTRACTION_CATEGORY_LABELS[lang][key] ?? key;
}

const A_LABELS: Record<
  Lang,
  {
    from: string;
    perPerson: string;
    select: string;
    selected: string;
    heart: string;
    unheart: string;
    mock: string;
    myPick: string;
    kmFromCenter: (km: number) => string;
    sortAria: string;
    sortLabel: Record<AttractionSortMode, string>;
  }
> = {
  he: {
    from: "החל מ־",
    perPerson: "לאדם",
    select: "בחירה",
    selected: "בחרתי",
    heart: "שמור למועדפים",
    unheart: "הסר מהמועדפים",
    mock: "נתוני דמה",
    myPick: "ההמלצה שלי",
    kmFromCenter: (km) => `${km} ק"מ מהמרכז`,
    sortAria: "מיון אטרקציות",
    sortLabel: { fit: "הכי מתאים לי", priceAsc: "זול→יקר", priceDesc: "יקר→זול", distance: "קרוב למרכז" },
  },
  en: {
    from: "from",
    perPerson: "per person",
    select: "Select",
    selected: "Selected",
    heart: "Save to favorites",
    unheart: "Remove from favorites",
    mock: "Test data",
    myPick: "My pick",
    kmFromCenter: (km) => `${km} km from center`,
    sortAria: "Sort attractions",
    sortLabel: { fit: "Best fit", priceAsc: "Price ↑", priceDesc: "Price ↓", distance: "Near center" },
  },
};

function durationLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Compact sort chips above an attractions card stack — client-side re-sort. */
export function AttractionSortChips({
  lang,
  active,
  onChange,
}: {
  lang: Lang;
  active: AttractionSortMode;
  onChange: (mode: AttractionSortMode) => void;
}) {
  const L = A_LABELS[lang];
  const MODES: AttractionSortMode[] = ["fit", "priceAsc", "priceDesc", "distance"];
  return (
    <div dir="auto" role="group" aria-label={L.sortAria} className="flex flex-wrap gap-1.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={m === active}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            m === active
              ? "border-c-accent bg-c-accent text-c-on-accent"
              : "border-c-border bg-c-surface text-c-muted hover:border-c-accent/50 hover:text-c-ink"
          }`}
        >
          {L.sortLabel[m]}
        </button>
      ))}
    </div>
  );
}

export function AttractionCard({
  offer,
  mock,
  lang,
  recommended,
  hearted,
  onToggleHeart,
  onSelect,
  onOpenDetail,
}: {
  offer: AttractionOfferView;
  mock: boolean;
  lang: Lang;
  recommended?: boolean;
  hearted?: boolean;
  onToggleHeart?: () => void;
  onSelect?: (choice: string) => void;
  onOpenDetail?: () => void;
}) {
  const L = A_LABELS[lang];
  const cardRef = useRef<HTMLDivElement>(null);
  // Lazy preview gallery — same pattern as StayCard: fetch images (content-only)
  // when the card scrolls into view. null = unfetched, [] = none (text-only
  // fallback). Real chat only (onOpenDetail present); skipped in the demo.
  const [images, setImages] = useState<string[] | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    if (!onOpenDetail) return;
    const el = cardRef.current;
    if (!el) return;
    let fetched = false;
    const load = () => {
      if (fetched) return;
      fetched = true;
      fetch("/api/attractions/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attractionId: offer.id }),
      })
        .then((r) => (r.ok ? r.json() : { images: [] }))
        .then((d: { images?: string[] }) => setImages(d.images ?? []))
        .catch(() => setImages([]));
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          load();
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [offer.id, onOpenDetail]);

  useEffect(() => {
    if (images && images.length > 0) {
      const raf = requestAnimationFrame(() => setGalleryOpen(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [images]);

  return (
    <div
      ref={cardRef}
      className={`rounded-card border ${
        recommended ? "border-c-accent/50" : "border-c-border"
      } bg-c-surface px-3 py-2.5 shadow-rest${onOpenDetail ? " cursor-pointer select-none" : ""}`}
      onClick={onOpenDetail}
    >
      {images && images.length > 0 ? (
        <div className={`card-gallery-reveal${galleryOpen ? " open" : ""}`}>
          <div>
            <div className="mb-2">
              <SnapGallery
                images={images}
                imgClass="h-32 w-64"
                slidePx={264}
                bleedClass="-mx-3"
                padClass="px-3"
              />
            </div>
          </div>
        </div>
      ) : null}
      {recommended ? (
        <div dir="auto" className="mb-1.5">
          <span className="rounded-full bg-c-accent px-2 py-0.5 text-[11px] font-semibold text-c-on-accent">
            {L.myPick}
          </span>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div dir="auto" className="truncate text-sm font-semibold text-c-ink">
            {offer.name}
          </div>
          <div dir="auto" className="truncate text-xs text-c-muted">
            {attractionCategoryLabel(lang, offer.category)}
            {offer.area ? ` · ${offer.area}` : ""}
          </div>
        </div>
        <div className="flex flex-none flex-col items-end">
          {onToggleHeart ? (
            <HeartButton
              active={!!hearted}
              onToggle={onToggleHeart}
              label={hearted ? L.unheart : L.heart}
              className="-me-1.5 -mt-1"
            />
          ) : null}
          {typeof offer.fromPrice === "number" ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] text-c-muted">{L.from}</span>
                <span dir="ltr" className="text-lg font-bold text-c-accent tabular-nums">
                  {money(offer.fromPrice, offer.currency)}
                </span>
              </div>
              <div className="text-[11px] text-c-muted">{L.perPerson}</div>
            </>
          ) : null}
        </div>
      </div>

      {offer.durationMinutes || typeof offer.distanceKm === "number" || typeof offer.rating === "number" ? (
        <div dir="auto" className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-c-muted">
          {offer.durationMinutes ? (
            <span dir="ltr" className="tabular-nums">{durationLabel(offer.durationMinutes)}</span>
          ) : null}
          {typeof offer.distanceKm === "number" ? (
            <span className="truncate">{L.kmFromCenter(offer.distanceKm)}</span>
          ) : null}
          {typeof offer.rating === "number" ? (
            <span className="text-c-accent">★ {offer.rating.toFixed(1)}</span>
          ) : null}
        </div>
      ) : null}

      {offer.summary ? (
        <p dir="auto" className="mt-1.5 text-xs leading-relaxed text-c-muted">
          {offer.summary}
        </p>
      ) : null}

      {mock ? <div dir="auto" className="mt-2 text-[11px] text-c-muted">{L.mock}</div> : null}

      {onSelect ? (
        <CardSelect
          label={L.select}
          onSelect={() =>
            onSelect(
              `${L.selected}: ${offer.name}${offer.area ? `, ${offer.area}` : ""}${
                typeof offer.fromPrice === "number"
                  ? `, ${L.from} ${money(offer.fromPrice, offer.currency)} ${L.perPerson}`
                  : ""
              }`,
            )
          }
        />
      ) : null}
    </div>
  );
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inline calendar for the <<DATES>> block — the traveler picks a date (or a
 * range) and Confirm posts a structured choice message, like CardSelect.
 * Interactive when `onSelect` is given; inert for the landing demo when omitted.
 * Past dates are unselectable no matter what bounds the block carries.
 */
export function DateCalendar({
  mode,
  lang,
  min,
  max,
  onSelect,
}: {
  mode: DateMode;
  lang: Lang;
  min?: string;
  max?: string;
  onSelect?: (choice: string) => void;
}) {
  const L = LABELS[lang];
  const interactive = typeof onSelect === "function";
  const today = isoDay(new Date());
  const minIso = min && ISO_DAY_RE.test(min) && min > today ? min : today;
  const yearOut = new Date();
  yearOut.setFullYear(yearOut.getFullYear() + 1);
  const defaultMax = isoDay(yearOut);
  const maxIso = max && ISO_DAY_RE.test(max) && max > minIso ? max : defaultMax;

  // Open on the first selectable month.
  const [view, setView] = useState(() => ({
    y: Number(minIso.slice(0, 4)),
    m: Number(minIso.slice(5, 7)) - 1,
  }));
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const locale = lang === "he" ? "he-IL" : "en-US";
  const monthTitle = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(view.y, view.m, 1));
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // Weeks start on Sunday in both product languages; 2023-01-01 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    weekdayFmt.format(new Date(2023, 0, 1 + i)),
  );

  const ym = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
  const canPrev = ym > minIso.slice(0, 7);
  const canNext = ym < maxIso.slice(0, 7);
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];

  function moveMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function pick(iso: string) {
    if (mode === "single") {
      setStart(iso);
      setEnd(null);
      return;
    }
    if (!start || end) {
      setStart(iso);
      setEnd(null);
    } else if (iso < start) {
      setStart(iso);
    } else if (iso > start) {
      setEnd(iso);
    }
  }

  const complete = mode === "single" ? start !== null : start !== null && end !== null;
  const hint =
    mode === "single" ? L.pickDate : start && !end ? L.pickEnd : L.pickStart;

  return (
    <div
      dir={lang === "he" ? "rtl" : "ltr"}
      aria-hidden={interactive ? undefined : true}
      className={`w-full max-w-[340px] rounded-card border border-c-border bg-c-surface px-3 py-2.5 shadow-rest${
        interactive ? "" : " pointer-events-none"
      }`}
    >
      {/* month title + nav (start-arrow goes back, end-arrow forward) */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={interactive && canPrev ? () => moveMonth(-1) : undefined}
          disabled={!canPrev || !interactive}
          tabIndex={interactive ? 0 : -1}
          aria-label={L.prevMonth}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-c-ink transition-colors hover:bg-c-accent-soft disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4${lang === "he" ? " -scale-x-100" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-c-ink">{monthTitle}</span>
        <button
          type="button"
          onClick={interactive && canNext ? () => moveMonth(1) : undefined}
          disabled={!canNext || !interactive}
          tabIndex={interactive ? 0 : -1}
          aria-label={L.nextMonth}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-c-ink transition-colors hover:bg-c-accent-soft disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4${lang === "he" ? " -scale-x-100" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* weekday header */}
      <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-c-muted">
        {weekdays.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      {/* day grid — no column gap so a selected range reads as one band */}
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {cells.map((iso, i) => {
          if (!iso) return <span key={i} />;
          const disabled = iso < minIso || iso > maxIso;
          const isStart = iso === start;
          const isEnd = iso === end;
          const inRange = start !== null && end !== null && iso > start && iso < end;
          let cls =
            "flex h-10 w-full items-center justify-center text-sm tabular-nums transition-colors";
          if (isStart || isEnd) {
            cls += " bg-c-accent font-semibold text-c-on-accent";
            cls += isStart
              ? end && !isEnd
                ? " rounded-s-full"
                : " rounded-full"
              : " rounded-e-full";
          } else if (inRange) {
            cls += " bg-c-accent-soft text-c-ink";
          } else if (disabled) {
            cls += " text-c-muted opacity-35";
          } else {
            cls += ` rounded-full hover:bg-c-accent-soft ${
              iso === today ? "font-bold text-c-accent" : "text-c-ink"
            }`;
          }
          return (
            <button
              key={iso}
              type="button"
              onClick={interactive && !disabled ? () => pick(iso) : undefined}
              disabled={disabled || !interactive}
              tabIndex={interactive && !disabled ? 0 : -1}
              aria-pressed={isStart || isEnd || inRange || undefined}
              className={cls}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>

      {/* selection summary (dates LTR, live night count) + confirm */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-c-border pt-2">
        {start ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span dir="ltr" className="text-sm text-c-ink tabular-nums">
              {mode === "range" && end
                ? `${dmy(start)} → ${dmy(end)}`
                : dmy(start)}
            </span>
            {mode === "range" && end ? (
              <span dir="auto" className="text-xs font-semibold text-c-accent">
                {L.nights(nightsBetween(start, end))}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-c-muted">{hint}</span>
        )}
        <button
          type="button"
          onClick={
            interactive && complete
              ? () =>
                  onSelect!(
                    mode === "single"
                      ? L.pickedSingle(start!)
                      : L.pickedRange(start!, end!, nightsBetween(start!, end!)),
                  )
              : undefined
          }
          disabled={!complete || !interactive}
          tabIndex={interactive ? 0 : -1}
          className="flex-none rounded-full bg-c-accent px-4 py-1.5 text-xs font-semibold text-c-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {L.confirm}
        </button>
      </div>
    </div>
  );
}
