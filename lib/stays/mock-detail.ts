import type { Room, StayDetail } from "./types";
import { hashString, makeRng } from "./mock";

// Deterministic mock hotel detail, seeded by the offer id — same id, same
// detail. Images stay EMPTY on purpose: the modal's graceful no-gallery state
// gets exercised in mock mode (real photos come from the Content API).

const DESCRIPTIONS = [
  "A calm, well-run hotel with bright rooms and a helpful front desk, a short walk from the main sights.",
  "Family-owned and recently renovated, known for generous breakfasts and quiet rooms facing the courtyard.",
  "A modern spot with compact, smartly designed rooms — popular with travelers who spend their days out exploring.",
];
const AMENITY_POOL = [
  "wifi",
  "breakfast",
  "aircon",
  "parking",
  "pool",
  "gym",
  "kitchen",
];
const STREETS = ["Harbor St", "Old Town Rd", "Market Lane", "Garden Ave"];
const AREAS = ["Old Town", "City Center", "Waterfront", "Downtown"];

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function mockStayDetail(hotelId: string): Promise<StayDetail> {
  const seed = hashString(hotelId);
  const rand = makeRng(seed);
  const base = 60 + Math.floor(rand() * 120); // nightly base 60–180

  const room = (
    name: string,
    mult: number,
    features: string[],
    withBoard: boolean,
  ): Room => {
    const ro = Math.round(base * mult);
    return {
      code: name.toUpperCase().replace(/\s+/g, "."),
      name,
      features,
      rates: withBoard
        ? [
            { board: "RO", pricePerNight: ro, totalPrice: ro * 4 },
            { board: "BB", pricePerNight: ro + 9, totalPrice: (ro + 9) * 4 },
          ]
        : [{ board: "RO", pricePerNight: ro, totalPrice: ro * 4 }],
    };
  };

  const amenities: string[] = [];
  while (amenities.length < 4) {
    const a = AMENITY_POOL[Math.floor(rand() * AMENITY_POOL.length)];
    if (!amenities.includes(a)) amenities.push(a);
  }
  const checkInOffset = 21 + Math.floor(rand() * 30);

  return {
    mock: true,
    hotelProvider: "mock",
    hotelCode: hotelId,
    description: DESCRIPTIONS[seed % DESCRIPTIONS.length],
    images: [], // deliberate: exercises the no-gallery state
    amenities,
    address: `${1 + (seed % 90)} ${STREETS[seed % STREETS.length]}`,
    area: AREAS[seed % AREAS.length],
    rooms: [
      room("Standard Double", 1, [], true),
      room("Deluxe with Balcony", 1.35, ["balcony"], true),
      room("Junior Suite", 1.8, ["suite"], false),
    ],
    currency: "USD",
    pricedFor: {
      checkIn: isoDaysFromNow(checkInOffset),
      checkOut: isoDaysFromNow(checkInOffset + 4),
      guests: 2,
    },
  };
}
