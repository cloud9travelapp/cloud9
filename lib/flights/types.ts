// Provider-agnostic flight types. These are the only shapes the rest of the app
// knows about; any real provider (Duffel, Amadeus, …) maps its response to these.

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export type FlightQuery = {
  origin: string; // origin airport IATA code, e.g. "TLV"
  destination: string; // destination airport IATA code, e.g. "JFK"
  departureDate: string; // "YYYY-MM-DD"
  returnDate?: string; // "YYYY-MM-DD" (round trips only)
  passengers?: number; // default 1
  cabinClass?: CabinClass; // default "economy"
};

export type FlightSegment = {
  origin: string; // IATA
  destination: string; // IATA
  departTime: string; // ISO 8601
  arriveTime: string; // ISO 8601
};

export type FlightOffer = {
  id: string;
  airlineName: string;
  segments: FlightSegment[]; // 1 = direct, 2 = one stop, …
  totalDurationMinutes: number;
  stops: number;
  price: number;
  currency: string;
};
