import type { StayOffer, StayQuery } from "./types";
import { mockSearchStays } from "./mock";

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
    // case "hotelbeds":
    //   return hotelbedsSearchStays(query);
    // case "amadeus":
    //   return amadeusSearchStays(query);
    case "mock":
    default:
      return mockSearchStays(query);
  }
}
