import { describe, expect, it } from "vitest";
import { sanitizeTripTitle } from "@/lib/trip-title";

describe("sanitizeTripTitle (deterministic title-format guard)", () => {
  it("clips 'City, Country' to the city — the Budva bug", () => {
    expect(sanitizeTripTitle("Budva, Montenegro")).toBe("Budva");
    expect(sanitizeTripTitle("Rome, Italy")).toBe("Rome");
  });

  it("keeps the legal comma form 'A, B & more' intact", () => {
    expect(sanitizeTripTitle("Zagreb, Ljubljana & more")).toBe(
      "Zagreb, Ljubljana & more",
    );
  });

  it("passes clean titles through unchanged", () => {
    expect(sanitizeTripTitle("Greece")).toBe("Greece");
    expect(sanitizeTripTitle("Japan & Korea")).toBe("Japan & Korea");
    expect(sanitizeTripTitle("Balkan Trip")).toBe("Balkan Trip");
  });

  it("returns null for KEEP in any casing", () => {
    expect(sanitizeTripTitle("KEEP")).toBeNull();
    expect(sanitizeTripTitle("keep")).toBeNull();
    expect(sanitizeTripTitle("  Keep  ")).toBeNull();
  });

  it("returns null for empty and overlong output", () => {
    expect(sanitizeTripTitle("")).toBeNull();
    expect(sanitizeTripTitle("   ")).toBeNull();
    expect(sanitizeTripTitle("A".repeat(49))).toBeNull();
  });

  it("strips wrapping quotes the model sometimes adds", () => {
    expect(sanitizeTripTitle('"Rome"')).toBe("Rome");
    expect(sanitizeTripTitle("«Japan & Korea»")).toBe("Japan & Korea");
  });

  it("a clip that leaves nothing returns null", () => {
    expect(sanitizeTripTitle(", Montenegro")).toBeNull();
  });
});
