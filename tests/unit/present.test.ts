import { describe, expect, it } from "vitest";
import { applyMinStars, sortOffersBy } from "@/lib/stays/present";
import type { StayOffer } from "@/lib/stays/types";

const mk = (
  id: string,
  price: number,
  stars: number,
  km?: number,
): StayOffer => ({
  id,
  name: id,
  type: "hotel",
  area: "X",
  stars,
  amenities: [],
  distanceKm: km,
  pricePerNight: price,
  totalPrice: price * 4,
  currency: "EUR",
});

const OFFERS = [mk("a", 120, 4, 3.1), mk("b", 90, 5, 0.4), mk("c", 200, 3, 1.2)];

describe("sortOffersBy (route-side card order)", () => {
  it("price ascending", () => {
    expect(sortOffersBy(OFFERS, "price").map((o) => o.id)).toEqual(["b", "a", "c"]);
  });
  it("premium: stars desc, then price desc", () => {
    expect(sortOffersBy(OFFERS, "premium").map((o) => o.id)).toEqual(["b", "a", "c"]);
    const tied = [mk("x", 100, 4), mk("y", 300, 4)];
    expect(sortOffersBy(tied, "premium").map((o) => o.id)).toEqual(["y", "x"]);
  });
  it("distance ascending, missing km last; never mutates", () => {
    const withMissing = [...OFFERS, mk("d", 50, 2)];
    expect(sortOffersBy(withMissing, "distance").map((o) => o.id)).toEqual(["b", "c", "a", "d"]);
    expect(withMissing.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("applyMinStars (רק 5 כוכבים — honest filter)", () => {
  it("keeps only offers meeting the bar when any do", () => {
    const r = applyMinStars(OFFERS, 5);
    expect(r.allMet).toBe(true);
    expect(r.offers.map((o) => o.id)).toEqual(["b"]);
  });
  it("falls back to the FULL set with allMet=false when none do (test-env 4-star cap)", () => {
    const fourStarOnly = [mk("a", 120, 4), mk("b", 90, 4)];
    const r = applyMinStars(fourStarOnly, 5);
    expect(r.allMet).toBe(false);
    expect(r.offers).toHaveLength(2); // never silently empty
  });
});
