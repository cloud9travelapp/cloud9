import type { StayOffer, StayQuery, StayType } from "./types";

// Deterministic-but-varied fake data: the same query always yields the same
// offers, while different queries look meaningfully different. Mirrors the
// flight mock's seeded approach.

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUDGET_MULTIPLIER: Record<string, number> = {
  budget: 0.6,
  mid: 1,
  luxury: 2.2,
};

// A few known destinations get believable names + areas; everything else falls
// back to generic-but-plausible names built from the destination.
const KNOWN: Record<
  string,
  { tier: number; names: string[]; areas: string[] }
> = {
  rome: { tier: 1.15, names: ["Hotel Artemide", "Trastevere Suites", "NH Collection Roma", "Residenza del Corso"], areas: ["Trastevere", "Monti", "Centro Storico", "Prati"] },
  paris: { tier: 1.35, names: ["Hôtel Le Marais", "Rue Cler Apartments", "Ibis Styles Paris", "Maison Montmartre"], areas: ["Le Marais", "Saint-Germain", "Montmartre", "Latin Quarter"] },
  barcelona: { tier: 1.05, names: ["Hotel Barcelona Center", "Gothic Quarter Lofts", "H10 Marina", "Casa Gràcia"], areas: ["El Born", "Gothic Quarter", "Eixample", "Barceloneta"] },
  london: { tier: 1.45, names: ["The Bloomsbury", "Shoreditch Rooms", "Premier Inn County Hall", "Notting Hill Suites"], areas: ["Shoreditch", "South Bank", "Covent Garden", "Kensington"] },
  tokyo: { tier: 1.2, names: ["Shibuya Stream Hotel", "Asakusa Ryokan", "Shinjuku Granbell", "Ginza Residence"], areas: ["Shibuya", "Shinjuku", "Asakusa", "Ginza"] },
  amsterdam: { tier: 1.1, names: ["Canal House Hotel", "Jordaan Apartments", "The Hoxton Amsterdam", "De Pijp Suites"], areas: ["Jordaan", "De Pijp", "Canal Ring", "Oud-West"] },
  athens: { tier: 0.85, names: ["Plaka Boutique Hotel", "Acropolis View Suites", "Monastiraki Rooms", "Coco-Mat Athens"], areas: ["Plaka", "Koukaki", "Monastiraki", "Kolonaki"] },
  lisbon: { tier: 0.9, names: ["Alfama Boutique", "Chiado Apartments", "Memmo Príncipe Real", "Baixa House"], areas: ["Alfama", "Chiado", "Baixa", "Príncipe Real"] },
};

const GENERIC_AREAS = ["Old Town", "City Center", "Waterfront", "Downtown"];
const TYPES: StayType[] = ["hotel", "apartment", "boutique", "hostel", "resort"];
const AMENITIES = [
  "breakfast",
  "pool",
  "wifi",
  "seaview",
  "spa",
  "kitchen",
  "parking",
  "gym",
  "aircon",
  "rooftop",
];
const DISTANCE_KEYS = ["beach", "center", "oldTown", "station", "park"];

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

export async function mockSearchStays(query: StayQuery): Promise<StayOffer[]> {
  // Simulate a real API call so the loading UX is exercised.
  await new Promise((r) => setTimeout(r, 800));

  const dest = (query.destination || "").trim();
  const key = dest.toLowerCase();
  const known = KNOWN[key];
  const tier = known?.tier ?? 1;
  const rooms = Math.max(1, query.rooms ?? 1);
  const nights = nightsBetween(query.checkIn, query.checkOut);
  const budget = query.budgetLevel ?? "mid";
  const budgetMult = BUDGET_MULTIPLIER[budget] ?? 1;

  const seed = hashString(
    `${key}-${query.checkIn}-${query.checkOut}-${budget}`,
  );
  const rand = makeRng(seed);

  const areaPool = known?.areas ?? GENERIC_AREAS;
  const count = 4 + Math.floor(rand() * 3); // 4–6 offers
  // Base nightly rate before per-offer jitter: budget ~70, mid ~140, lux ~310,
  // scaled by destination tier.
  const baseNight = 120 * tier;

  const offers: StayOffer[] = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[Math.floor(rand() * TYPES.length)];
    const name = known
      ? known.names[i % known.names.length]
      : i === 0
        ? `${dest || "City"} Central Hotel`
        : i === 1
          ? `Old Town Apartments`
          : `${dest || "City"} ${["Suites", "Boutique", "Inn", "Residence"][i % 4]}`;
    const area = areaPool[Math.floor(rand() * areaPool.length)];

    // Star rating skews with budget level.
    const starBase = budget === "luxury" ? 4 : budget === "budget" ? 2 : 3;
    const stars = Math.min(5, Math.max(1, starBase + (rand() < 0.5 ? 0 : 1)));

    // 2–3 distinct amenities.
    const amenities: string[] = [];
    const nAmen = 2 + (rand() < 0.5 ? 0 : 1);
    while (amenities.length < nAmen) {
      const a = AMENITIES[Math.floor(rand() * AMENITIES.length)];
      if (!amenities.includes(a)) amenities.push(a);
    }

    const distanceKey = DISTANCE_KEYS[Math.floor(rand() * DISTANCE_KEYS.length)];
    const distanceMinutes = 2 + Math.floor(rand() * 18); // 2–19 min

    const jitter = 0.75 + rand() * 0.6; // 0.75–1.35
    const pricePerNight =
      Math.max(
        25,
        Math.round((baseNight * budgetMult * jitter) / 5) * 5,
      );
    const totalPrice = pricePerNight * nights * rooms;

    offers.push({
      id: `mock-${seed.toString(36)}-${i}`,
      name,
      type,
      area,
      stars,
      amenities,
      distanceKey,
      distanceMinutes,
      pricePerNight,
      totalPrice,
      currency: "USD",
    });
  }

  offers.sort((a, b) => a.pricePerNight - b.pricePerNight); // cheapest first
  return offers;
}
