import type { FlightOffer, FlightQuery } from "./types";
import { mockSearchFlights } from "./mock";

const FLIGHT_PROVIDER = process.env.FLIGHT_PROVIDER || "mock";

/**
 * True when the active provider serves fake data. Drives the "נתוני דמה" (mock
 * data) label in the UI, which disappears automatically once a real provider
 * is selected.
 */
export const IS_MOCK_PROVIDER = FLIGHT_PROVIDER === "mock";

/**
 * Provider-agnostic flight search. To wire in a real provider, add a file that
 * implements this same `FlightQuery -> Promise<FlightOffer[]>` signature (e.g.
 * `duffel.ts`) and add one `case` below. Nothing else in the app changes.
 */
export async function searchFlights(
  query: FlightQuery,
): Promise<FlightOffer[]> {
  switch (FLIGHT_PROVIDER) {
    // case "duffel":
    //   return duffelSearchFlights(query);
    // case "amadeus":
    //   return amadeusSearchFlights(query);
    case "mock":
    default:
      return mockSearchFlights(query);
  }
}
