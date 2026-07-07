import type { FlightOffer, FlightQuery, FlightSegment } from "./types";

// Deterministic-but-varied fake data: the same query always yields the same
// offers (easy to test), while different queries look meaningfully different.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keep the mock's dates sane: if a past (or unparseable) departure date comes
 *  in, roll it forward to a real future date so cards never show past years. */
function normalizeFutureDate(dateStr: string): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  }
  // Roll whole years forward (preserves the intended month/day, e.g. "Aug 1").
  while (d.getTime() < today.getTime()) {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const ISRAELI_AIRLINES = ["El Al", "Wizz Air", "Israir", "Arkia", "Lufthansa"];
const INTL_AIRLINES = [
  "Lufthansa",
  "KLM",
  "Turkish Airlines",
  "Air France",
  "Ryanair",
  "easyJet",
  "British Airways",
  "Swiss",
];
const HUBS = ["IST", "FRA", "MUC", "VIE", "ATH", "CDG", "AMS", "ZRH"];

const CABIN_MULTIPLIER: Record<string, number> = {
  economy: 1,
  premium_economy: 1.5,
  business: 2.6,
  first: 4,
};

export async function mockSearchFlights(
  query: FlightQuery,
): Promise<FlightOffer[]> {
  // Simulate a real API call so the UX (loading state) is exercised.
  await new Promise((r) => setTimeout(r, 800));

  const origin = (query.origin || "").toUpperCase();
  const destination = (query.destination || "").toUpperCase();
  const passengers = Math.max(1, query.passengers ?? 1);
  const cabinClass = query.cabinClass ?? "economy";
  const cabinMult = CABIN_MULTIPLIER[cabinClass] ?? 1;
  const departureDate = normalizeFutureDate(query.departureDate);

  const seed = hashString(
    `${origin}-${destination}-${departureDate}-${cabinClass}`,
  );
  const rand = makeRng(seed);

  const isTLV = origin === "TLV" || destination === "TLV";
  const airlinePool = isTLV ? ISRAELI_AIRLINES : INTL_AIRLINES;

  const basePrice = 180 + Math.floor(rand() * 620); // 180–800 per passenger
  const baseDuration = 120 + Math.floor(rand() * 540); // 2h–11h nonstop
  const count = 3 + Math.floor(rand() * 3); // 3–5 offers

  const offers: FlightOffer[] = [];
  for (let i = 0; i < count; i++) {
    const direct = i === 0 ? true : rand() < 0.5; // guarantee ≥1 direct
    const airline = airlinePool[Math.floor(rand() * airlinePool.length)];
    const departHour = 6 + Math.floor(rand() * 15); // 06:00–20:00
    const departMinute = [0, 15, 30, 45][Math.floor(rand() * 4)];

    const depart = new Date(`${departureDate}T00:00:00Z`);
    depart.setUTCHours(departHour, departMinute, 0, 0);

    let segments: FlightSegment[];
    let totalDurationMinutes: number;
    let stops: number;

    if (direct) {
      totalDurationMinutes = Math.max(
        75,
        baseDuration + Math.floor(rand() * 60) - 30,
      );
      const arrive = new Date(depart.getTime() + totalDurationMinutes * 60000);
      segments = [
        {
          origin,
          destination,
          departTime: depart.toISOString(),
          arriveTime: arrive.toISOString(),
        },
      ];
      stops = 0;
    } else {
      let hub = HUBS[Math.floor(rand() * HUBS.length)];
      if (hub === origin || hub === destination) {
        hub = HUBS[(HUBS.indexOf(hub) + 1) % HUBS.length];
      }
      const leg1 = Math.round(baseDuration * (0.4 + rand() * 0.2));
      const layover = 60 + Math.floor(rand() * 120);
      const leg2 = Math.round(baseDuration * (0.4 + rand() * 0.2));
      totalDurationMinutes = leg1 + layover + leg2;
      const arrive1 = new Date(depart.getTime() + leg1 * 60000);
      const depart2 = new Date(arrive1.getTime() + layover * 60000);
      const arrive2 = new Date(depart2.getTime() + leg2 * 60000);
      segments = [
        {
          origin,
          destination: hub,
          departTime: depart.toISOString(),
          arriveTime: arrive1.toISOString(),
        },
        {
          origin: hub,
          destination,
          departTime: depart2.toISOString(),
          arriveTime: arrive2.toISOString(),
        },
      ];
      stops = 1;
    }

    const jitter = 0.8 + rand() * 0.5; // 0.8–1.3
    const stopDiscount = direct ? 1 : 0.75; // stops usually cheaper
    const price =
      Math.round((basePrice * jitter * stopDiscount * cabinMult * passengers) / 5) *
      5;

    offers.push({
      id: `mock-${seed.toString(36)}-${i}`,
      airlineName: airline,
      segments,
      totalDurationMinutes,
      stops,
      price,
      currency: "USD",
    });
  }

  offers.sort((a, b) => a.price - b.price); // cheapest first, like a real list
  return offers;
}
