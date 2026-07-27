import { describe, expect, it } from "vitest";
import { dropPriceOutliers, OUTLIER_MEDIAN_MULTIPLE } from "@/lib/stays/hotelbeds";
import type { StayOffer } from "@/lib/stays/types";

const mk = (name: string, pricePerNight: number, stars: number): StayOffer => ({
  id: `hb-${name.replace(/\W+/g, "").toLowerCase()}`,
  name,
  type: "hotel",
  area: "Sorrento",
  stars,
  amenities: [],
  pricePerNight,
  totalPrice: pricePerNight * 7,
  currency: "EUR",
});

/**
 * The REAL Sorrento result set, 2027-06-02 → 06-09, 40 hotels, captured from
 * stay_search_cache after the live round that exposed the bug. Two entries are
 * corrupt provider data (Europa Stabia 7,429/night and Michelangelo 3,891/night,
 * both 4★ against a 362 median); the other 38 are legitimate.
 */
const SORRENTO: StayOffer[] = [
  mk("Europa Stabia Hotel", 7429, 4), // CORRUPT — 20.5× the 4★ median
  mk("Michelangelo", 3891, 4), //        CORRUPT — 10.7× the 4★ median
  mk("Villa Lia Hotel Capri", 764, 5),
  mk("Grand Hotel Royal", 747, 5),
  mk("Grand Hotel Ambasciatori", 746, 5),
  mk("Hotel Admiral", 671, 4), //        highest LEGITIMATE 4★ — 1.85×
  mk("Resort Sant'Angelo & SPA", 623, 4),
  mk("Parco Dei Principi", 580, 5),
  mk("Hotel Conca D'Oro", 578, 4),
  mk("Grand Hotel Capodimonte", 512, 4),
  mk("Grand Hotel Europa Palace", 490, 4),
  mk("Hotel Corallo Sorrento", 466, 4),
  mk("Grand Hotel De La Ville", 447, 4),
  mk("Villa Fiorella Art Hotel", 438, 5),
  mk("Antiche Mura", 429, 4),
  mk("Majestic Palace", 418, 4),
  mk("Boutique Hotel Helios", 395, 4),
  mk("Hotel Villa Garden", 362, 4),
  mk("O Sole Mio", 335, 4),
  mk("La Tonnarella", 313, 4),
  mk("La Perla", 272, 3),
  mk("Hotel Alpha", 254, 4),
  mk("Bellavista Francischiello Hotel and Spa", 242, 4),
  mk("Hotel Miramare Stabia", 241, 4),
  mk("Mary Hotel", 232, 4),
  mk("Comfort Hotel Gardenia Sorrento Coast", 231, 4),
  mk("Hotel Miramare", 224, 4),
  mk("Il Roseto Resort", 214, 0),
  mk("Giosue' a Mare", 208, 4),
  mk("Art Hotel Gran Paradiso", 208, 4),
  mk("Villa Giovanna", 199, 0),
  mk("La Vue D'Or", 195, 4),
  mk("Hotel Savoia", 190, 3),
  mk("Hotel La Pergola", 186, 4),
  mk("Ulisse Deluxe Hostel", 179, 0),
  mk("Hotel Del Corso Sorrento", 171, 3),
  mk("Villa Pane Resort", 159, 0),
  mk("Casale Antonietta", 118, 3),
  mk("Villa Pina Antico Francischiello", 100, 3),
  mk("Residence L'Incanto Sorrento", 63, 0),
];

describe("dropPriceOutliers (corrupt provider prices)", () => {
  it("excludes exactly the two corrupt 4-star entries from the real set", () => {
    const { offers, excluded } = dropPriceOutliers(SORRENTO);
    expect(excluded.map((x) => x.offer.name).sort()).toEqual([
      "Europa Stabia Hotel",
      "Michelangelo",
    ]);
    expect(offers).toHaveLength(SORRENTO.length - 2);
  });

  it("keeps every legitimate offer, including the priciest 4-star", () => {
    const kept = dropPriceOutliers(SORRENTO).offers.map((o) => o.name);
    expect(kept).toContain("Hotel Admiral"); // 671 = 1.85× — must survive
    expect(kept).toContain("Grand Hotel Capodimonte");
    expect(kept).toContain("Residence L'Incanto Sorrento");
    expect(kept).not.toContain("Michelangelo");
  });

  it("reports the median and ratio behind each exclusion", () => {
    const { excluded } = dropPriceOutliers(SORRENTO);
    const mich = excluded.find((x) => x.offer.name === "Michelangelo")!;
    expect(mich.median).toBe(362); // 4★ median across 25 hotels
    expect(mich.ratio).toBeCloseTo(10.7, 1);
    expect(mich.ratio).toBeGreaterThan(OUTLIER_MEDIAN_MULTIPLE);
  });

  it("judges SAME-STAR, so an expensive 5-star is never punished", () => {
    // Five 5★ at luxury prices next to a cheap, well-populated 4★ tier. Against
    // a GLOBAL median these would all look absurd; against their own they are
    // ordinary. This is the case a global threshold would break.
    const set = [
      ...Array.from({ length: 8 }, (_, i) => mk(`budget4-${i}`, 100 + i, 4)),
      ...Array.from({ length: 5 }, (_, i) => mk(`palace5-${i}`, 900 + i * 50, 5)),
    ];
    const { offers, excluded } = dropPriceOutliers(set);
    expect(excluded).toEqual([]);
    expect(offers).toHaveLength(13);
  });

  it("skips the guard when a star tier is too small to have a median", () => {
    // Four 4★ including one wild price — under OUTLIER_MIN_SAMPLE, so we never
    // drop on a guess.
    const set = [mk("a", 100, 4), mk("b", 110, 4), mk("c", 120, 4), mk("z", 9999, 4)];
    const { offers, excluded } = dropPriceOutliers(set);
    expect(excluded).toEqual([]);
    expect(offers).toHaveLength(4);
  });

  it("is a no-op on an empty set and never mutates its input", () => {
    expect(dropPriceOutliers([]).offers).toEqual([]);
    const before = SORRENTO.map((o) => o.name);
    dropPriceOutliers(SORRENTO);
    expect(SORRENTO.map((o) => o.name)).toEqual(before);
  });
});
