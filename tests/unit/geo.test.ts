import { describe, expect, it } from "vitest";
import { scatterAround } from "@/lib/geo";
import { makeRng } from "@/lib/stays/mock";
import { haversineKm } from "@/lib/stays/hotelbeds";

describe("scatterAround", () => {
  it("returns no coordinates without an anchor — never invents a location", () => {
    expect(scatterAround(undefined, undefined, 2, makeRng(1))).toEqual({});
    expect(scatterAround(38.7, undefined, 2, makeRng(1))).toEqual({});
  });

  it("lands roughly the requested distance from the anchor", () => {
    const anchor = { lat: 38.72, lng: -9.14 }; // Lisbon
    for (const km of [0.5, 3, 9]) {
      const p = scatterAround(anchor.lat, anchor.lng, km, makeRng(km * 100));
      const actual = haversineKm(anchor.lat, anchor.lng, p.latitude!, p.longitude!);
      expect(actual).toBeGreaterThan(km * 0.7);
      expect(actual).toBeLessThan(km * 1.3);
    }
  });

  it("consumes the same RNG draw with or without an anchor", () => {
    // Otherwise the same mock query would produce different offers depending
    // on whether a searched point happened to be supplied.
    const withAnchor = makeRng(11);
    scatterAround(38.72, -9.14, 2, withAnchor);
    const withoutAnchor = makeRng(11);
    scatterAround(undefined, undefined, 2, withoutAnchor);
    expect(withAnchor()).toBe(withoutAnchor());
  });

  it("is deterministic for the same seed", () => {
    const a = scatterAround(38.72, -9.14, 2, makeRng(7));
    const b = scatterAround(38.72, -9.14, 2, makeRng(7));
    expect(a).toEqual(b);
  });

  it("survives the pole case without dividing by zero", () => {
    const p = scatterAround(90, 0, 5, makeRng(3));
    expect(Number.isFinite(p.latitude!)).toBe(true);
    expect(Number.isFinite(p.longitude!)).toBe(true);
  });
});
