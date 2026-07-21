import { describe, expect, it } from "vitest";
import {
  groupFavorites,
  isFavorite,
  providerFromOfferId,
  type TripFavorite,
} from "@/lib/favorites";

const fav = (
  itemCode: string,
  itemType: TripFavorite["itemType"],
  createdAt: string,
): TripFavorite => ({
  itemType,
  itemProvider: providerFromOfferId(itemCode),
  itemCode,
  item: { id: itemCode, name: itemCode },
  createdAt,
});

describe("providerFromOfferId", () => {
  it("derives the provider namespace from the id prefix", () => {
    expect(providerFromOfferId("hb-12345")).toBe("hotelbeds");
    expect(providerFromOfferId("mock-abc-1")).toBe("mock");
  });
});

describe("groupFavorites (drawer grouping)", () => {
  it("groups by type, newest first, only existing types", () => {
    const groups = groupFavorites([
      fav("hb-1", "stay", "2026-07-21T10:00:00Z"),
      fav("hb-2", "stay", "2026-07-21T12:00:00Z"),
      fav("mock-f1", "flight", "2026-07-21T11:00:00Z"),
    ]);
    expect(groups.stay!.map((f) => f.itemCode)).toEqual(["hb-2", "hb-1"]);
    expect(groups.flight!).toHaveLength(1);
    expect(groups.attraction).toBeUndefined();
  });
  it("handles empty input", () => {
    expect(groupFavorites([])).toEqual({});
  });
});

describe("isFavorite", () => {
  const favs = [fav("hb-1", "stay", "2026-07-21T10:00:00Z")];
  it("matches by offer id", () => {
    expect(isFavorite(favs, "hb-1")).toBe(true);
    expect(isFavorite(favs, "hb-2")).toBe(false);
  });
});
