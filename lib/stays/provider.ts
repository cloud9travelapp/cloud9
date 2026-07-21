import type { StayByNameResult, StayOffer, StayQuery } from "./types";
import { mockFindStayByName, mockSearchStays } from "./mock";
import {
  hotelbedsFindStayByName,
  hotelbedsPeekStays,
  hotelbedsSearchStays,
} from "./hotelbeds";

const STAY_PROVIDER = process.env.STAY_PROVIDER || "mock";

/**
 * True when the active provider serves fake data. Drives the "נתוני דמה" (mock
 * data) label in the UI, which disappears automatically once a real provider
 * is selected.
 */
export const IS_MOCK_STAY_PROVIDER = STAY_PROVIDER === "mock";

/**
 * Provider-agnostic accommodation search. To wire in a real provider, add a file
 * that implements this same `StayQuery -> Promise<StayOffer[]>` signature (e.g.
 * `hotelbeds.ts`) and add one `case` below. Nothing else in the app changes.
 */
export async function searchStays(query: StayQuery): Promise<StayOffer[]> {
  switch (STAY_PROVIDER) {
    case "hotelbeds":
      return hotelbedsSearchStays(query);
    // case "amadeus":
    //   return amadeusSearchStays(query);
    case "mock":
    default:
      return mockSearchStays(query);
  }
}

/**
 * Provider-agnostic lookup of a SPECIFIC property the traveler named
 * (query.hotelName). NEW function per the detail-layer ground rules —
 * searchStays is untouched. Statuses per StayByNameResult; honesty is the
 * contract (never fake a named hotel).
 */
export async function searchStayByName(
  query: StayQuery,
): Promise<StayByNameResult> {
  switch (STAY_PROVIDER) {
    case "hotelbeds":
      return hotelbedsFindStayByName(query);
    case "mock":
    default:
      return mockFindStayByName(query);
  }
}

/**
 * The FULL result set for a query WITHOUT any live provider call — the
 * "show more" pool. Hotelbeds: cache-only (null once expired; the endpoint
 * reports staleness honestly instead of burning quota). Mock: deterministic
 * regeneration, so it is its own cache. NEW function per the ground rules —
 * searchStays untouched.
 */
export async function peekStays(query: StayQuery): Promise<StayOffer[] | null> {
  switch (STAY_PROVIDER) {
    case "hotelbeds":
      return hotelbedsPeekStays(query);
    case "mock":
    default:
      return mockSearchStays(query);
  }
}
