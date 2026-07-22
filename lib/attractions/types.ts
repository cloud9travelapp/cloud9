// Provider-agnostic attractions ("things to do") types — the only shapes the
// rest of the app knows. Any real provider (Hotelbeds Activities, Viator, …)
// maps its response to these. Category is a NEUTRAL KEY localized in the UI
// (mirrors the stays amenity/type pattern). Mirrors lib/stays/types.ts so the
// agent slots into the same route/card/favorites machinery.

export type AttractionCategory =
  | "tours"
  | "museums"
  | "outdoors"
  | "food"
  | "nightlife"
  | "family"
  | "water"
  | "culture"
  | "adventure"
  | "wellness";

export type PriceLevel = "budget" | "mid" | "premium";

export type AttractionQuery = {
  destination: string; // city / area name, e.g. "Rome"
  from: string; // "YYYY-MM-DD" — activity window start (usually the trip dates)
  to: string; // "YYYY-MM-DD"
  latitude?: number; // destination center (real providers search by geo)
  longitude?: number;
  category?: AttractionCategory; // optional single-category filter
  priceLevel?: PriceLevel; // default "mid"
  keyword?: string; // optional free-text ("cooking class", "sunset")
};

export type AttractionOffer = {
  id: string; // "hb-<code>" (hotelbeds) | "mock-<seed>-<i>" (mock)
  name: string;
  category: AttractionCategory;
  area?: string; // neighbourhood / location proper noun
  durationMinutes?: number; // for the "duration" sort + card display
  fromPrice: number; // per-person "from" price
  currency: string;
  distanceKm?: number; // straight-line km from the searched point
  /** 0–5. DISPLAY-WHEN-PRESENT ONLY — Hotelbeds Activities does not document a
   *  review field (same as the Hotels finding), so nothing may ever depend on
   *  this; the mock deliberately omits it. */
  rating?: number;
  summary?: string; // one-line blurb
};

// ── Detail layer (modal + get_attraction_details tool) ───────────────────
// Content (images/description/what's-included) comes lazily from the provider's
// content path, permanently cached — exactly like the stays detail layer.

export type AttractionDetail = {
  mock: boolean;
  provider: string; // "hotelbeds" | "mock"
  code: string;
  name?: string;
  category?: AttractionCategory;
  area?: string;
  durationMinutes?: number;
  fromPrice?: number;
  currency?: string;
  description?: string;
  images: string[]; // absolute URLs, gallery order
  included?: string[]; // "what's included" bullets (neutral display strings)
  rating?: number; // display-when-present (see AttractionOffer.rating)
  /** True when the Content API call FAILED (e.g. eval-tier 403 quota) — the
   *  modal shows an honest "couldn't load photos & details" note. */
  contentUnavailable?: boolean;
};
