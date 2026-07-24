import type { AttractionOffer, PriceLevel } from "./types";

// Route-level PRESENTATION helpers for attraction results (card order, price
// banding, the show-more batch). These shape the tool result the model copies
// verbatim — they never touch the provider layer. Pure + unit-tested. Mirrors
// lib/stays/present.ts (kept self-contained: no provider-file import, since the
// mock is the only provider this round).

export type AttractionSort = "price" | "distance" | "duration";

/** Card order for the tool result (the model copies offers verbatim, so the
 *  tool result's order IS the card order). */
export function sortOffersBy(
  offers: AttractionOffer[],
  sortBy: AttractionSort,
): AttractionOffer[] {
  const s = [...offers];
  if (sortBy === "price") {
    return s.sort(
      (a, b) =>
        (a.fromPrice ?? Number.POSITIVE_INFINITY) -
        (b.fromPrice ?? Number.POSITIVE_INFINITY),
    );
  }
  if (sortBy === "duration") {
    return s.sort(
      (a, b) =>
        (a.durationMinutes ?? Number.POSITIVE_INFINITY) -
        (b.durationMinutes ?? Number.POSITIVE_INFINITY),
    );
  }
  return s.sort(
    (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) -
      (b.distanceKm ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * Price-tercile band over the from-price (cheapest-first): budget = lowest
 * third, premium = top third, mid = the middle. Bands with fewer than 3 offers
 * fall back to the full list (never show an empty band). Mirrors the stays
 * budget terciles minus the star guard (attractions have no star rating).
 */
export function filterForPriceLevel(
  offers: AttractionOffer[],
  level?: PriceLevel,
): AttractionOffer[] {
  if (!level) return offers;
  // Terciles are computed over the PRICED subset; price-less offers can't be
  // banded so they ride along after the band (shown honestly, never dropped).
  const priced = offers.filter((o) => typeof o.fromPrice === "number");
  const unpriced = offers.filter((o) => typeof o.fromPrice !== "number");
  if (priced.length < 3) return offers;
  const sorted = [...priced].sort((a, b) => a.fromPrice! - b.fromPrice!);
  const third = Math.ceil(sorted.length / 3);
  let band: AttractionOffer[];
  if (level === "budget") band = sorted.slice(0, third);
  else if (level === "premium") band = sorted.slice(-third);
  else {
    const mid = sorted.slice(third, sorted.length - third);
    band = mid.length > 0 ? mid : sorted;
  }
  return [...band, ...unpriced];
}

/**
 * The "show more" batch: the next offers from the SAME criteria, drawn from the
 * cached full result set — price band → optional sortBy → minus everything
 * already shown → the next `batch`. Empty offers = honestly exhausted. Mirrors
 * nextStayBatch (no distance tier: that shapes only the first presentation).
 */
export function nextAttractionBatch(
  pool: AttractionOffer[],
  opts: {
    priceLevel?: PriceLevel;
    sortBy?: AttractionSort;
    excludeIds: string[];
    batch?: number;
  },
): { offers: AttractionOffer[]; remaining: number } {
  const batch = opts.batch ?? 5;
  let candidates = filterForPriceLevel(pool, opts.priceLevel);
  if (opts.sortBy) candidates = sortOffersBy(candidates, opts.sortBy);
  const seen = new Set(opts.excludeIds);
  const fresh = candidates.filter((o) => !seen.has(o.id));
  return {
    offers: fresh.slice(0, batch),
    remaining: Math.max(0, fresh.length - batch),
  };
}
