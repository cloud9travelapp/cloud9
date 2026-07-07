// Presentational chat pieces shared by the real chat (ChatClient) and the
// landing's scripted demo, so the demo can never drift from the product.
// Pure view only — no parsing/streaming logic lives here.

import { CloudMarkClassic } from "@/components/brand/cloud-marks";

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
  distanceKey: string;
  distanceMinutes: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
};
export type StaysPayload = {
  mock: boolean;
  lang: Lang;
  offers: StayOfferView[];
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
export function CloudBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-fit max-w-[82%]"
      style={{ filter: "drop-shadow(0 8px 16px rgba(2,8,23,0.16))" }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -top-2.5 start-4 h-7 w-7 rounded-full bg-c-surface"
        />
        <span
          aria-hidden="true"
          className="absolute -top-4 start-9 h-11 w-11 rounded-full bg-c-surface"
        />
        <span
          aria-hidden="true"
          className="absolute -top-2 end-5 h-8 w-8 rounded-full bg-c-surface"
        />
        <div
          dir="auto"
          className="relative z-[1] bg-c-surface px-4 py-2.5 text-[15px] leading-relaxed text-c-ink"
          style={{
            borderRadius: "26px 24px 28px 22px / 22px 28px 24px 26px",
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
      className="w-fit max-w-[82%] rounded-2xl bg-c-accent px-4 py-2.5 text-[15px] leading-relaxed text-c-on-accent shadow-sm [unicode-bidi:plaintext]"
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
  },
};

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

export function FlightCard({
  offer,
  mock,
  lang,
}: {
  offer: FlightOfferView;
  mock: boolean;
  lang: Lang;
}) {
  const L = LABELS[lang];
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const price =
    offer.currency === "USD"
      ? `$${offer.price}`
      : `${offer.price} ${offer.currency}`;
  const durationDir = lang === "he" ? "rtl" : "ltr";

  return (
    <div className="rounded-xl border border-c-border bg-c-surface px-3 py-2.5 shadow-sm">
      {/* airline (left) + price (right) */}
      <div dir="ltr" className="flex items-center justify-between gap-3">
        <span dir="auto" className="truncate text-sm font-semibold text-c-ink">
          {offer.airlineName}
        </span>
        <span className="flex-none text-lg font-bold text-c-accent tabular-nums">
          {price}
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

      {/* mock-data tag (per language, only while mock) */}
      {mock ? (
        <div dir="auto" className="mt-1.5 text-[10px] text-c-muted">
          {L.mock}
        </div>
      ) : null}
    </div>
  );
}

function money(amount: number, currency: string): string {
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}

export function StayCard({
  offer,
  mock,
  lang,
}: {
  offer: StayOfferView;
  mock: boolean;
  lang: Lang;
}) {
  const L = LABELS[lang];
  return (
    <div className="rounded-xl border border-c-border bg-c-surface px-3 py-2.5 shadow-sm">
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
        <div className="flex-none text-end">
          <div dir="ltr" className="text-lg font-bold text-c-accent tabular-nums">
            {money(offer.pricePerNight, offer.currency)}
          </div>
          <div className="text-[11px] text-c-muted">{L.perNight}</div>
        </div>
      </div>

      {/* stars + distance */}
      <div dir="auto" className="mt-1.5 flex items-center gap-2 text-xs text-c-muted">
        {offer.stars > 0 ? (
          <span
            className="flex-none text-c-accent"
            aria-label={L.stars(offer.stars)}
          >
            {"★".repeat(offer.stars)}
          </span>
        ) : null}
        <span className="truncate">
          {L.distance(offer.distanceKey, offer.distanceMinutes)}
        </span>
      </div>

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
    </div>
  );
}
