// Provider-agnostic accommodation types. These are the only shapes the rest of
// the app knows about; any real provider (Hotelbeds, Amadeus, …) maps its
// response to these. Amenities / distance / type are NEUTRAL KEYS localized in
// the UI (mirrors the flights pattern; real hotel APIs return facility codes).

export type StayType = "hotel" | "apartment" | "boutique" | "hostel" | "resort";

export type BudgetLevel = "budget" | "mid" | "luxury";

export type StayQuery = {
  destination: string; // city / area name, e.g. "Rome"
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  guests?: number; // default 2
  rooms?: number; // default 1
  budgetLevel?: BudgetLevel; // default "mid"
  latitude?: number; // destination city center (real providers search by geo)
  longitude?: number;
  distanceFilter?: "near" | "any"; // default "near": prefer close-to-center offers
};

export type StayOffer = {
  id: string;
  name: string; // proper noun, e.g. "Hotel Artemide"
  type: StayType;
  area: string; // neighbourhood / area proper noun, e.g. "Trastevere"
  stars: number; // 1–5; 0 = category/unrated
  amenities: string[]; // neutral keys, e.g. ["pool","breakfast","seaview"]; may be empty (availability-only providers)
  distanceKey?: string; // POI key: beach | center | oldTown | station | park
  distanceMinutes?: number; // walking minutes to that POI
  distanceKm?: number; // straight-line km from the searched point (city center)
  pricePerNight: number;
  totalPrice: number; // pricePerNight × nights × rooms
  currency: string;
  /** Set only on a "worth-it deal": a far-but-exceptional offer, never shown
   *  silently — the route splits it out of the cards and the concierge OFFERS
   *  it (one teaser sentence). */
  deal?: { discountPct: number; comparableMedian: number };
};
