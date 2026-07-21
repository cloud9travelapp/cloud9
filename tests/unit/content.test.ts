import { describe, expect, it } from "vitest";
import {
  amenitiesFromFacilities,
  mapHotelContent,
  matchHotelName,
  normalizeHotelName,
} from "@/lib/stays/hotelbeds-content";

const CATALOG: Record<string, string> = {
  "60|261": "Wi-fi",
  "70|306": "Outdoor swimming pool",
  "60|10": "Car park",
  "70|470": "Wellness area",
  "60|170": "Air conditioning in public areas",
  "10|999": "Marble bathroom", // maps to nothing
};

describe("amenitiesFromFacilities", () => {
  it("maps facility names to neutral keys, dedupes, ignores unknowns", () => {
    const keys = amenitiesFromFacilities(
      [
        { facilityGroupCode: 60, facilityCode: 261 },
        { facilityGroupCode: 70, facilityCode: 306 },
        { facilityGroupCode: 60, facilityCode: 10 },
        { facilityGroupCode: 70, facilityCode: 470 },
        { facilityGroupCode: 60, facilityCode: 170 },
        { facilityGroupCode: 10, facilityCode: 999 },
        { facilityGroupCode: 1, facilityCode: 1 }, // not in catalog
      ],
      CATALOG,
    );
    expect(keys).toEqual(["wifi", "pool", "parking", "spa", "aircon"]);
  });
});

describe("mapHotelContent", () => {
  it("maps name/description/address, orders and caps images, builds URLs", () => {
    const content = mapHotelContent(
      {
        name: { content: "Hotel Artemide" },
        description: { content: "A refined hotel near Termini." },
        address: { content: "Via Nazionale 22" },
        city: { content: "Rome" },
        zoneName: "Monti",
        images: [
          { path: "b.jpg", visualOrder: 2 },
          { path: "a.jpg", visualOrder: 1 },
          { path: "no-order.jpg" },
        ],
        facilities: [{ facilityGroupCode: 60, facilityCode: 261 }],
      },
      CATALOG,
    );
    expect(content.name).toBe("Hotel Artemide");
    expect(content.area).toBe("Monti");
    expect(content.address).toBe("Via Nazionale 22");
    expect(content.images).toEqual([
      "https://photos.hotelbeds.com/giata/bigger/a.jpg",
      "https://photos.hotelbeds.com/giata/bigger/b.jpg",
      "https://photos.hotelbeds.com/giata/bigger/no-order.jpg",
    ]);
    expect(content.amenities).toEqual(["wifi"]);
    expect(content.reviewScore).toBeUndefined(); // display-when-present
  });

  it("caps the gallery at 10 images", () => {
    const images = Array.from({ length: 15 }, (_, i) => ({
      path: `${i}.jpg`,
      visualOrder: i,
    }));
    const content = mapHotelContent({ images }, {});
    expect(content.images).toHaveLength(10);
  });

  it("degrades gracefully on an empty hotel", () => {
    const content = mapHotelContent({}, {});
    expect(content.images).toEqual([]);
    expect(content.amenities).toEqual([]);
    expect(content.name).toBeUndefined();
  });
});

describe("normalizeHotelName", () => {
  it("lowercases, strips diacritics and punctuation, drops generic words", () => {
    expect(normalizeHotelName("The Ritz-Carlton, Hôtel & Spa")).toBe(
      "ritz carlton and spa",
    );
    expect(normalizeHotelName("SIX SENSES  PARIS")).toBe("six senses paris");
  });
});

describe("matchHotelName", () => {
  const INDEX = [
    { code: 101, name: "Six Senses Spa & Resort Douro Valley" },
    { code: 102, name: "The Ritz London" },
    { code: 103, name: "Ritz-Carlton Berlin" },
    { code: 104, name: "Hotel Le Marais" },
    { code: 105, name: "Generic City Inn" },
  ];
  it("finds a property by partial brand name, best first", () => {
    const m = matchHotelName("Six Senses", INDEX);
    expect(m[0]?.code).toBe(101);
  });
  it("returns multiple plausible matches for an ambiguous name", () => {
    const codes = matchHotelName("Ritz", INDEX).map((m) => m.code);
    expect(codes).toContain(102);
    expect(codes).toContain(103);
    expect(codes).not.toContain(105);
  });
  it("returns nothing when most of the query is absent", () => {
    expect(matchHotelName("Mandarin Oriental", INDEX)).toEqual([]);
    expect(matchHotelName("", INDEX)).toEqual([]);
  });
  it("is deterministic and caps results", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      code: i,
      name: `Sunny Beach Hotel ${i}`,
    }));
    expect(matchHotelName("Sunny Beach", many)).toHaveLength(10);
  });
});
