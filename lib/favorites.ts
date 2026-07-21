// Trip favorites (hearts) — shared types + pure helpers. Isomorphic on
// purpose: the API route, the chat client, and the sidebar drawer all speak
// this shape, and the pure functions are unit-tested. The schema is
// item-type-GENERIC from day one (stays today; flights/attractions/
// restaurants plug into the same table, API, and drawer with zero changes).

export type FavoriteItemType = "stay" | "flight" | "attraction" | "restaurant";

export const FAVORITE_ITEM_TYPES: FavoriteItemType[] = [
  "stay",
  "flight",
  "attraction",
  "restaurant",
];

export type TripFavorite = {
  itemType: FavoriteItemType;
  itemProvider: string; // "hotelbeds" | "mock" | future providers
  itemCode: string; // the offer id verbatim ("hb-12345", "mock-…")
  /** Typed snapshot (StayOfferView for stays) + "lang" stamped at heart time
   *  so the drawer/modal render without any refetch. */
  item: Record<string, unknown>;
  createdAt?: string;
};

/** Provider namespace from an offer id ("hb-12345" → hotelbeds). */
export function providerFromOfferId(id: string): string {
  return id.startsWith("hb-") ? "hotelbeds" : "mock";
}

/** Drawer grouping: favorites by type, newest first inside each group; only
 *  types that exist appear (callers render no empty sections). */
export function groupFavorites(
  favorites: TripFavorite[],
): Partial<Record<FavoriteItemType, TripFavorite[]>> {
  const groups: Partial<Record<FavoriteItemType, TripFavorite[]>> = {};
  const sorted = [...favorites].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  for (const f of sorted) {
    (groups[f.itemType] ??= []).push(f);
  }
  return groups;
}

/** Is this offer id hearted? (The one lookup the cards/modal need.) */
export function isFavorite(favorites: TripFavorite[], offerId: string): boolean {
  return favorites.some((f) => f.itemCode === offerId);
}
