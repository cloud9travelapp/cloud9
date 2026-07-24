import { describe, it, expect } from "vitest";
import { mockSearchAttractions } from "@/lib/attractions/mock";
import {
  filterForPriceLevel,
  nextAttractionBatch,
  sortOffersBy,
} from "@/lib/attractions/present";
import {
  collectShownAttractionIds,
  sortAttractionOffers,
  splitAttractions,
} from "@/lib/chat/blocks";
import type { AttractionOfferView } from "@/components/chat/message-parts";
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

describe("attractions block parsing", () => {
  const block = (offers: Partial<AttractionOfferView>[], extra = {}) =>
    "text\n<<ATTRACTIONS>>\n" +
    JSON.stringify({ mock: true, lang: "en", offers, ...extra }) +
    "\n<<END>>";

  it("splitAttractions parses valid offers, caps 8, drops a bad recommendedId", () => {
    const offers = Array.from({ length: 10 }, (_, i) => ({
      id: `mock-${i}`,
      name: `Act ${i}`,
      category: "tours",
      fromPrice: 20 + i,
      currency: "EUR",
    }));
    const { text, attractions } = splitAttractions(block(offers, { recommendedId: "nope" }));
    expect(text).toBe("text");
    expect(attractions?.offers).toHaveLength(8);
    expect(attractions?.recommendedId).toBeUndefined(); // not a shown id → dropped
    expect(attractions?.mock).toBe(true);
  });

  it("accepts an honest PRICE-LESS offer; rejects malformed offers and missing block", () => {
    expect(splitAttractions("just text").attractions).toBeNull();
    // no fromPrice = a valid price-less offer (the card shows no price line)
    const noPrice = splitAttractions(block([{ id: "mock-x", name: "Free walk", category: "tours", currency: "EUR" }]));
    expect(noPrice.attractions?.offers[0].fromPrice).toBeUndefined();
    // junk fromPrice or missing category still rejects
    expect(splitAttractions(block([{ name: "bad", category: "tours", fromPrice: "9" as unknown as number }])).attractions).toBeNull();
    expect(splitAttractions(block([{ name: "no category", fromPrice: 9 }])).attractions).toBeNull();
  });

  it("price sorts put price-less offers last in BOTH directions", () => {
    const v: AttractionOfferView[] = [
      { id: "free", name: "Free", category: "tours", currency: "EUR" },
      { id: "cheap", name: "Cheap", category: "tours", fromPrice: 10, currency: "EUR" },
      { id: "dear", name: "Dear", category: "tours", fromPrice: 90, currency: "EUR" },
    ];
    expect(sortAttractionOffers(v, "priceAsc").map((o) => o.id)).toEqual(["cheap", "dear", "free"]);
    expect(sortAttractionOffers(v, "priceDesc").map((o) => o.id)).toEqual(["dear", "cheap", "free"]);
  });

  it("collectShownAttractionIds unions ids across blocks", () => {
    const a = block([{ id: "mock-a", name: "A", category: "food", fromPrice: 10, currency: "EUR" }]);
    const b = block([{ id: "mock-b", name: "B", category: "tours", fromPrice: 20, currency: "EUR" }]);
    expect(collectShownAttractionIds([a, b, "plain"]).sort()).toEqual(["mock-a", "mock-b"]);
  });

  it("sortAttractionOffers floats the recommended card on fit, sorts by price", () => {
    const v: AttractionOfferView[] = [
      { id: "a", name: "A", category: "tours", fromPrice: 30, currency: "EUR", distanceKm: 5 },
      { id: "b", name: "B", category: "food", fromPrice: 10, currency: "EUR", distanceKm: 1 },
    ];
    expect(sortAttractionOffers(v, "fit", "b").map((o) => o.id)).toEqual(["b", "a"]);
    expect(sortAttractionOffers(v, "priceDesc").map((o) => o.id)).toEqual(["a", "b"]);
    expect(sortAttractionOffers(v, "distance").map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("extractActivityImages (confirmed live media shape)", async () => {
  const { extractActivityImages } = await import("@/lib/attractions/hotelbeds");
  const url = (n: number, size: string) =>
    `https://media.activitiesbank.com/30465/ENG/${size}/30465_${n}.jpg`;
  const img = (n: number, order: number) => ({
    visualizationOrder: order,
    mimeType: "image/jpeg",
    language: "ENG",
    urls: ["SMALL", "MEDIUM", "LARGE", "LARGE2", "XLARGE", "RAW"].map((sizeType) => ({
      dpi: 72, height: 75, width: 100, sizeType, resource: url(n, sizeType),
    })),
  });
  const media = { images: [img(2, 2), img(1, 1), img(3, 3)] };

  it("picks ONE preferred size per image, ordered by visualizationOrder", () => {
    const out = extractActivityImages(media, ["XLARGE", "LARGE2"]);
    expect(out).toEqual([url(1, "XLARGE"), url(2, "XLARGE"), url(3, "XLARGE")]);
  });
  it("falls down the preference list, then to any size", () => {
    const partial = { images: [{ visualizationOrder: 1, urls: [{ sizeType: "MEDIUM", resource: url(9, "MEDIUM") }] }] };
    expect(extractActivityImages(partial, ["XLARGE", "LARGE2"])).toEqual([url(9, "MEDIUM")]);
  });
  it("returns [] for absent/misshapen media", () => {
    expect(extractActivityImages(undefined, ["XLARGE"])).toEqual([]);
    expect(extractActivityImages({}, ["XLARGE"])).toEqual([]);
  });
});
