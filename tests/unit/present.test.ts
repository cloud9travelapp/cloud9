import { describe, expect, it } from "vitest";
import { applyMinStars, nextStayBatch, sortOffersBy } from "@/lib/stays/present";
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

describe("nextStayBatch (show-more pool)", () => {
  const pool = [
    mk("p1", 80, 3, 1), mk("p2", 90, 4, 2), mk("p3", 100, 4, 3),
    mk("p4", 110, 5, 4), mk("p5", 120, 3, 5), mk("p6", 130, 4, 6),
    mk("p7", 140, 5, 7), mk("p8", 150, 4, 8), mk("p9", 160, 3, 9),
    mk("p10", 170, 5, 10), mk("p11", 180, 4, 11), mk("p12", 190, 4, 12),
  ];
  it("returns the next 5 unseen, with a remaining count", () => {
    const r = nextStayBatch(pool, { excludeIds: ["p1", "p2", "p3"] });
    expect(r.offers.map((o) => o.id)).toEqual(["p4", "p5", "p6", "p7", "p8"]);
    expect(r.remaining).toBe(4);
  });
  it("is honestly exhausted when everything was seen", () => {
    const r = nextStayBatch(pool, { excludeIds: pool.map((o) => o.id) });
    expect(r.offers).toEqual([]);
    expect(r.remaining).toBe(0);
  });
  it("applies sortBy and minStars to the pool", () => {
    const r = nextStayBatch(pool, { excludeIds: [], sortBy: "premium", minStars: 5 });
    expect(r.offers.every((o) => o.stars === 5)).toBe(true);
    expect(r.offers[0].pricePerNight).toBeGreaterThanOrEqual(
      r.offers[r.offers.length - 1].pricePerNight,
    );
  });
  it("respects the budget band (tercile) before batching", () => {
    const r = nextStayBatch(pool, { excludeIds: [], budgetLevel: "budget" });
    // budget band = cheapest tercile of 12 → 4 offers
    expect(r.offers.map((o) => o.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(r.remaining).toBe(0);
  });
});
