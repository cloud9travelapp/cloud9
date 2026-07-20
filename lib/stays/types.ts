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

// ── Detail layer (modal + get_hotel_details tool) ────────────────────────
// Rooms are captured from the search response the moment it arrives (option
// A: zero extra API calls; the future booking flow re-verifies fresh).
// Content (photos/description/amenities) comes from the Content API, cached
// permanently. StayOffer stays lean — details never ride search results.

export type RoomRate = {
  board: "RO" | "BB" | "HB" | "FB" | "AI" | "OTHER";
  boardName?: string; // provider label, shown when board is OTHER
  pricePerNight: number;
  totalPrice: number;
};

export type Room = {
  code: string;
  name: string;
  features: string[]; // neutral keys (balcony, seaView, terrace, suite)
  rates: RoomRate[]; // cheapest rate per board, cheapest board first
};

export type StayDetail = {
  mock: boolean;
  hotelProvider: string;
  hotelCode: string;
  name?: string;
  description?: string;
  images: string[]; // absolute URLs, gallery order
  amenities: string[]; // neutral keys (same vocabulary as cards)
  address?: string;
  area?: string;
  reviewScore?: number; // 0-10, only when the Content API carries review data
  reviewCount?: number;
  rooms: Room[] | null; // null = no valid captured rooms (stale/absent)
  pricedFor?: { checkIn: string; checkOut: string; guests: number };
};
