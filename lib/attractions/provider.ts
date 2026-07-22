import type { AttractionOffer, AttractionQuery } from "./types";
import { mockSearchAttractions } from "./mock";
import {
  hotelbedsPeekAttractions,
  hotelbedsSearchAttractions,
} from "./hotelbeds";

const ATTRACTION_PROVIDER = process.env.ATTRACTION_PROVIDER || "mock";

/**
 * True when the active provider serves fake data. Drives the "נתוני דמה" (mock
 * data) label in the UI, which disappears automatically once a real provider
 * is selected.
 */
export const IS_MOCK_ATTRACTION_PROVIDER = ATTRACTION_PROVIDER === "mock";

/**
 * Provider-agnostic attractions search. To wire in a real provider, add a file
 * that implements this same `AttractionQuery -> Promise<AttractionOffer[]>`
 * signature and add one `case` below — nothing else in the app changes.
 * Hotelbeds Activities is the intended first real provider (it reuses the exact
 * SHA-256 auth from lib/stays/hotelbeds-auth.ts); Viator is the review-rich
 * self-service fallback.
 */
export async function searchAttractions(
  query: AttractionQuery,
): Promise<AttractionOffer[]> {
  switch (ATTRACTION_PROVIDER) {
    case "hotelbeds":
      return hotelbedsSearchAttractions(query);
    // case "viator":
    //   return viatorSearchAttractions(query);
    case "mock":
    default:
      return mockSearchAttractions(query);
  }
}

/**
 * The FULL result set for a query WITHOUT a live provider call — the "show
 * more" pool. A real provider serves this cache-only (never burning quota); the
 * mock regenerates deterministically, so it is its own cache. Mirrors peekStays.
 */
export async function peekAttractions(
  query: AttractionQuery,
): Promise<AttractionOffer[] | null> {
  switch (ATTRACTION_PROVIDER) {
    case "hotelbeds":
      return hotelbedsPeekAttractions(query);
    case "mock":
    default:
      return mockSearchAttractions(query);
  }
}
