import type { StayOffer } from "./types";

// Route-level PRESENTATION helpers for stay results (card order, star
// precision). These shape the tool result the model copies verbatim — they
// never touch the provider layer. Pure functions, unit-tested.

/** Card order for the tool result (the model copies offers verbatim, so the
 *  tool result's order IS the card order). */
export function sortOffersBy(
  offers: StayOffer[],
  sortBy: "price" | "premium" | "distance",
): StayOffer[] {
  const s = [...offers];
  if (sortBy === "price") return s.sort((a, b) => a.pricePerNight - b.pricePerNight);
  if (sortBy === "premium") {
    return s.sort(
      (a, b) => b.stars - a.stars || b.pricePerNight - a.pricePerNight,
    );
  }
  return s.sort(
    (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) -
      (b.distanceKm ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * Star-precision filter for the "רק 5 כוכבים" answer. Honest by design:
 * when the inventory can't meet the bar (allMet false), the ORIGINAL set is
 * returned so the concierge says so plainly and presents the closest quality
 * options — it never silently shows less than asked, and never fakes more.
 */
export function applyMinStars(
  offers: StayOffer[],
  minStars: number,
): { offers: StayOffer[]; allMet: boolean } {
  const met = offers.filter((o) => o.stars >= minStars);
  return met.length > 0
    ? { offers: met, allMet: true }
    : { offers, allMet: false };
}
