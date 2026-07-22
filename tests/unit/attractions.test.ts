import { describe, it, expect } from "vitest";
import { mockSearchAttractions } from "@/lib/attractions/mock";
import {
  filterForPriceLevel,
  nextAttractionBatch,
  sortOffersBy,
} from "@/lib/attractions/present";
import type { AttractionOffer, AttractionQuery } from "@/lib/attractions/types";

const Q: AttractionQuery = {
  destination: "Rome",
  from: "2026-05-01",
  to: "2026-05-05",
  priceLevel: "mid",
};

describe("mockSearchAttractions", () => {
  it("is deterministic for a given query and cheapest-first", async () => {
    const a = await mockSearchAttractions(Q);
    const b = await mockSearchAttractions(Q);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < a.length; i++) {
      expect(a[i].fromPrice).toBeGreaterThanOrEqual(a[i - 1].fromPrice);
    }
    // known destination surfaces recognisable names + mock- ids + no rating
    expect(a.some((o) => o.name.includes("Colosseum"))).toBe(true);
    expect(a.every((o) => o.id.startsWith("mock-"))).toBe(true);
    expect(a.every((o) => o.rating === undefined)).toBe(true);
  });

  it("varies with destination and price level", async () => {
    const rome = await mockSearchAttractions(Q);
    const paris = await mockSearchAttractions({ ...Q, destination: "Paris" });
    expect(rome[0].id).not.toBe(paris[0].id);
    const premium = await mockSearchAttractions({ ...Q, priceLevel: "premium" });
    const budget = await mockSearchAttractions({ ...Q, priceLevel: "budget" });
    const avg = (o: AttractionOffer[]) =>
      o.reduce((s, x) => s + x.fromPrice, 0) / o.length;
    expect(avg(premium)).toBeGreaterThan(avg(budget));
  });

  it("honours a category filter", async () => {
    const food = await mockSearchAttractions({ ...Q, category: "food" });
    expect(food.every((o) => o.category === "food")).toBe(true);
  });
});

describe("attraction present helpers", () => {
  const offers: AttractionOffer[] = [
    { id: "a", name: "A", category: "tours", fromPrice: 30, currency: "EUR", distanceKm: 5, durationMinutes: 180 },
    { id: "b", name: "B", category: "food", fromPrice: 10, currency: "EUR", distanceKm: 1, durationMinutes: 90 },
    { id: "c", name: "C", category: "museums", fromPrice: 90, currency: "EUR", distanceKm: 3, durationMinutes: 120 },
    { id: "d", name: "D", category: "water", fromPrice: 50, currency: "EUR", distanceKm: 8, durationMinutes: 60 },
  ];

  it("sorts by price, distance, duration", () => {
    expect(sortOffersBy(offers, "price").map((o) => o.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortOffersBy(offers, "distance").map((o) => o.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortOffersBy(offers, "duration").map((o) => o.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("bands by price tercile (budget=cheapest third, premium=top)", () => {
    expect(filterForPriceLevel(offers, "budget").map((o) => o.id)).toEqual(["b", "a"]);
    expect(filterForPriceLevel(offers, "premium").map((o) => o.id)).toEqual(["d", "c"]);
  });

  it("nextAttractionBatch excludes seen ids and reports remaining", () => {
    const pool = sortOffersBy(offers, "price");
    const { offers: batch, remaining } = nextAttractionBatch(pool, {
      excludeIds: ["b"],
      batch: 2,
    });
    expect(batch.map((o) => o.id)).toEqual(["a", "d"]);
    expect(remaining).toBe(1);
  });
});
