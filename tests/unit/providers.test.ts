import { describe, expect, it } from "vitest";
import { mockSearchFlights } from "@/lib/flights/mock";
import { mockSearchStays } from "@/lib/stays/mock";
import {
  detectDeal,
  filterForBudget,
  haversineKm,
  mapHotels,
  medianDistanceKm,
  selectByDistance,
  starsFrom,
  typeFrom,
  type HotelbedsHotel,
} from "@/lib/stays/hotelbeds";
import type { StayOffer } from "@/lib/stays/types";
import type { StayQuery } from "@/lib/stays/types";

const QUERY: StayQuery = {
  destination: "Rome",
  checkIn: "2026-08-10",
  checkOut: "2026-08-15",
  guests: 2,
  rooms: 1,
};

describe("mock providers (deterministic, valid shapes)", () => {
  it("stays: same query → same offers; shapes valid", async () => {
    const a = await mockSearchStays(QUERY);
    const b = await mockSearchStays(QUERY);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
    for (const o of a) {
      expect(typeof o.name).toBe("string");
      expect(o.pricePerNight).toBeGreaterThan(0);
      expect(o.totalPrice).toBe(o.pricePerNight * 5 * 1); // 5 nights × 1 room
    }
  });

  it("stays: budget level scales prices", async () => {
    const [budget, luxury] = await Promise.all([
      mockSearchStays({ ...QUERY, budgetLevel: "budget" }),
      mockSearchStays({ ...QUERY, budgetLevel: "luxury" }),
    ]);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(luxury.map((o) => o.pricePerNight))).toBeGreaterThan(
      avg(budget.map((o) => o.pricePerNight)),
    );
  });

  it("flights: same query → same offers; shapes valid", async () => {
    const q = { origin: "TLV", destination: "FCO", departureDate: "2026-08-10" };
    const a = await mockSearchFlights(q);
    const b = await mockSearchFlights(q);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const o of a) {
      expect(o.segments.length).toBeGreaterThan(0);
      expect(o.price).toBeGreaterThan(0);
      expect(o.stops).toBe(o.segments.length - 1);
    }
  });
}, 20000);

describe("hotelbeds mapping", () => {
  const SAMPLE: HotelbedsHotel[] = [
    { code: 1234, name: "Hotel Artemide", categoryName: "4 STARS", zoneName: "Termini", minRate: "640.50", currency: "EUR" },
    { code: 5678, name: "Roma Hostel Central", categoryName: "HOSTEL", zoneName: "Esquilino", minRate: "180.00", currency: "EUR" },
    { code: 9, name: "Trastevere Apartments", categoryName: "APARTHOTEL 3 KEYS", zoneName: "Trastevere", minRate: "420", currency: "EUR" },
    { code: 10, name: "Broken (no rate)", categoryName: "5 STARS" },
    { code: 11, name: "Palazzo Luxe", categoryName: "5 STARS", minRate: "1500.00", currency: "EUR", destinationName: "Rome" },
  ];

  it("maps availability rows to offers (drops broken, sorts cheapest-first)", () => {
    const offers = mapHotels(SAMPLE, QUERY);
    expect(offers).toHaveLength(4);
    expect(offers[0].name).toBe("Roma Hostel Central");
    const artemide = offers.find((o) => o.name === "Hotel Artemide")!;
    expect(artemide.stars).toBe(4);
    expect(artemide.pricePerNight).toBe(128); // 640.50 / 5 nights, rounded
    expect(artemide.totalPrice).toBe(641);
    expect(offers.find((o) => o.name === "Palazzo Luxe")!.area).toBe("Rome"); // destinationName fallback
  });

  it("computes distance-from-center when both coordinate pairs exist", () => {
    // Milan Duomo → San Siro is ~5.4 km straight-line
    const km = haversineKm(45.4642, 9.19, 45.4781, 9.124);
    expect(km).toBeGreaterThan(5.0);
    expect(km).toBeLessThan(5.8);
    expect(haversineKm(45.4642, 9.19, 45.4642, 9.19)).toBe(0);

    const geoQuery = { ...QUERY, latitude: 45.4642, longitude: 9.19 };
    const offers = mapHotels(
      [
        { code: 1, name: "Near Duomo", categoryName: "4 STARS", minRate: "500", latitude: "45.4650", longitude: "9.1910" },
        { code: 2, name: "San Siro Hotel", categoryName: "4 STARS", minRate: "200", latitude: "45.4781", longitude: "9.1240" },
        { code: 3, name: "No Coords Inn", categoryName: "3 STARS", minRate: "300" },
      ],
      geoQuery,
    );
    const near = offers.find((o) => o.name === "Near Duomo")!;
    const far = offers.find((o) => o.name === "San Siro Hotel")!;
    expect(near.distanceKm).toBeLessThan(0.3);
    expect(far.distanceKm).toBeGreaterThan(5);
    expect(far.distanceKm).toBe(Math.round(far.distanceKm! * 10) / 10); // 0.1 rounding
    expect(offers.find((o) => o.name === "No Coords Inn")!.distanceKm).toBeUndefined();
    // without search coordinates, no distances at all
    const noGeo = mapHotels(
      [{ code: 1, name: "X", categoryName: "3 STARS", minRate: "100", latitude: "45.5", longitude: "9.2" }],
      QUERY,
    );
    expect(noGeo[0].distanceKm).toBeUndefined();
  });

  it("distance tier prefers the near half, backfills nearest-first to 5", () => {
    const o = (i: number, km?: number): StayOffer => ({
      id: `d${i}`,
      name: `D${i}`,
      type: "hotel",
      area: "X",
      stars: 3,
      amenities: [],
      distanceKm: km,
      pricePerNight: 100 + i, // ascending price = stable order marker
      totalPrice: 400,
      currency: "EUR",
    });
    // set-relative cutoff: median of [0.5, 1, 2, 3, 8, 9, 11, 12] = 3
    const spread = [o(0, 0.5), o(1, 1), o(2, 2), o(3, 3), o(4, 8), o(5, 9), o(6, 11), o(7, 12)];
    const median = medianDistanceKm(spread)!;
    expect(median).toBe(3);
    const near = selectByDistance(spread, median);
    expect(near.map((x) => x.id)).toEqual(["d0", "d1", "d2", "d3", "d4"]); // 4 near + nearest far backfill
    // a thick near tier keeps only near offers
    const compact = [o(0, 0.4), o(1, 0.6), o(2, 0.8), o(3, 1), o(4, 1.2), o(5, 6), o(6, 7), o(7, 9)];
    const kept = selectByDistance(compact, medianDistanceKm(compact)!);
    expect(kept.every((x) => x.distanceKm! <= 1.2)).toBe(true);
    expect(kept.length).toBeGreaterThanOrEqual(5);
    // offers without distance count as near; mostly-missing distances = no-op
    const mixed = [o(0, 0.5), o(1), o(2, 9), o(3), o(4), o(5), o(6), o(7)];
    expect(medianDistanceKm(mixed)).toBeUndefined();
    expect(selectByDistance(mixed, medianDistanceKm(mixed))).toHaveLength(8);
  });

  it("worth-it deal: far offer ≥30% under the shown same-star median", () => {
    const mk = (id: string, price: number, stars: number, km?: number): StayOffer => ({
      id, name: id, type: "hotel", area: "X", stars, amenities: [],
      distanceKm: km, pricePerNight: price, totalPrice: price * 4, currency: "EUR",
    });
    // shown near-tier set: 4★ prices 100/120/140 (median 120), one 3★
    const shown = [mk("s1", 100, 4, 1), mk("s2", 120, 4, 2), mk("s3", 140, 4, 1.5), mk("s4", 80, 3, 2)];
    // far candidates excluded by the tier:
    const far40 = mk("f1", 72, 4, 12); // 40% under 120 → deal
    const far20 = mk("f2", 96, 4, 10); // only 20% under → no
    const farNoDist = { ...mk("f3", 50, 4), distanceKm: undefined }; // no km → no
    const far3star = mk("f4", 20, 3, 11); // 3★ has only 1 comparable → no
    const band = [...shown, far40, far20, farNoDist, far3star];

    const deal = detectDeal(band, shown);
    expect(deal?.id).toBe("f1");
    expect(deal?.deal).toEqual({ discountPct: 40, comparableMedian: 120 });

    // below-threshold-only candidates → no deal
    expect(detectDeal([...shown, far20], shown)).toBeUndefined();
    // best discount wins when several qualify
    const far50 = mk("f5", 60, 4, 14);
    expect(detectDeal([...shown, far40, far50], shown)?.id).toBe("f5");
  });

  it("parses stars and types from category names", () => {
    expect(starsFrom("4 STARS")).toBe(4);
    expect(starsFrom("APARTHOTEL 3 KEYS")).toBe(3);
    expect(starsFrom(undefined)).toBe(0);
    expect(typeFrom("HOSTEL")).toBe("hostel");
    expect(typeFrom("APARTHOTEL")).toBe("apartment");
    expect(typeFrom("4 STARS")).toBe("hotel");
  });

  it("budget bands are price terciles with a star guard on luxury", () => {
    const offer = (i: number, price: number, stars: number) => ({
      id: `o${i}`,
      name: `H${i}`,
      type: "hotel" as const,
      area: "X",
      stars,
      amenities: [],
      pricePerNight: price,
      totalPrice: price * 4,
      currency: "EUR",
    });
    // Milan-shaped set (cheapest-first, cheap "4★" present, pricey 2★ dump):
    const stars = [4, 3, 2, 4, 3, 3, 4, 3, 4, 2, 4, 5];
    const prices = [40, 45, 50, 60, 70, 80, 90, 110, 150, 200, 260, 320];
    const offers = prices.map((p, i) => offer(i, p, stars[i]));

    // budget = cheapest tercile by PRICE — the €40 "4★" belongs here now
    const budget = filterForBudget(offers, "budget");
    expect(budget.map((o) => o.pricePerNight)).toEqual([40, 45, 50, 60]);

    // mid = middle tercile, stars irrelevant
    expect(filterForBudget(offers, "mid").map((o) => o.pricePerNight)).toEqual([
      70, 80, 90, 110,
    ]);

    // luxury = top tercile AND ≥4★ — the €200 2★ dump is excluded
    expect(filterForBudget(offers, "luxury").map((o) => o.pricePerNight)).toEqual([
      150, 260, 320,
    ]);

    // when the top tercile has too few 4★+, the guard yields to price-only
    const flatStars = offers.map((o, i) => ({ ...o, stars: i >= 8 ? 3 : o.stars }));
    expect(filterForBudget(flatStars, "luxury").map((o) => o.pricePerNight)).toEqual([
      150, 200, 260, 320,
    ]);

    // tiny sets and no-budget pass through untouched
    expect(filterForBudget(offers.slice(0, 3), "budget")).toHaveLength(3);
    expect(filterForBudget(offers, undefined)).toHaveLength(12);
  });
});
