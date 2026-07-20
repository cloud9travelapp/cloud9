import "server-only";
import { createHash } from "node:crypto";
import type {
  BudgetLevel,
  Room,
  RoomRate,
  StayOffer,
  StayQuery,
  StayType,
} from "./types";
import { mockSearchStays } from "./mock";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logDiag } from "@/lib/diag";

// Hotelbeds APItude (Booking API) provider — availability-only in v1: no
// amenities / walking distances (those come from the Content API enrichment,
// a pre-launch roadmap item). Searches by geolocation: the concierge passes
// the destination's coordinates in the tool call (same pattern as IATA codes
// for flights).
//
// Evaluation tier = 50 requests/day, so every live call is cached in Supabase
// (stay_search_cache, 24h TTL) and a daily budget guard falls back to the
// seeded mock — whose "mock-" offer ids make the route re-label the cards as
// test data — instead of burning the quota dry.

const BASE_URL =
  process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com";
const SEARCH_RADIUS_KM = 15;
const MAX_HOTELS = 40; // fetched + cached; cards show at most 8 after filtering
const DAILY_CALL_BUDGET = 45; // stop shy of the 50/day evaluation limit
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** APItude auth: SHA-256 hex of apiKey + secret + unix-seconds. */
function signature(apiKey: string, secret: string): string {
  return createHash("sha256")
    .update(`${apiKey}${secret}${Math.floor(Date.now() / 1000)}`)
    .digest("hex");
}

// Minimal slice of the availability response we consume.
export type HotelbedsRate = {
  net?: string | number;
  boardCode?: string;
  boardName?: string;
};
export type HotelbedsRoom = {
  code?: string;
  name?: string;
  rates?: HotelbedsRate[];
};
export type HotelbedsHotel = {
  code?: number;
  name?: string;
  categoryName?: string;
  zoneName?: string;
  destinationName?: string;
  latitude?: string | number;
  longitude?: string | number;
  minRate?: string | number;
  currency?: string;
  rooms?: HotelbedsRoom[];
};
type HotelbedsAvailability = {
  hotels?: { hotels?: HotelbedsHotel[] };
};

export function starsFrom(categoryName?: string): number {
  const m = /([1-5])/.exec(categoryName ?? "");
  return m ? Number(m[1]) : 0;
}

export function typeFrom(categoryName?: string): StayType {
  const c = (categoryName ?? "").toUpperCase();
  if (c.includes("APART")) return "apartment";
  if (c.includes("HOSTEL")) return "hostel";
  if (c.includes("RESORT")) return "resort";
  if (c.includes("BOUTIQUE")) return "boutique";
  return "hotel";
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

/** Straight-line distance between two coordinates, in km (haversine). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function mapHotels(hotels: HotelbedsHotel[], query: StayQuery): StayOffer[] {
  const nights = nightsBetween(query.checkIn, query.checkOut);
  const rooms = Math.max(1, query.rooms ?? 1);
  const offers: StayOffer[] = [];
  for (const h of hotels) {
    const total = Number(h.minRate); // minRate = whole-stay price, often a string
    if (!h.name || !Number.isFinite(total) || total <= 0) continue;
    // Hotel coordinates arrive as strings; the searched point is the city
    // center per the tool contract, so distanceKm = "from center" in v1.
    const hLat = Number(h.latitude);
    const hLon = Number(h.longitude);
    const distanceKm =
      Number.isFinite(hLat) &&
      Number.isFinite(hLon) &&
      typeof query.latitude === "number" &&
      typeof query.longitude === "number"
        ? Math.round(haversineKm(query.latitude, query.longitude, hLat, hLon) * 10) / 10
        : undefined;
    offers.push({
      id: `hb-${h.code ?? offers.length}`,
      name: h.name,
      type: typeFrom(h.categoryName),
      area: h.zoneName || h.destinationName || query.destination,
      stars: starsFrom(h.categoryName),
      amenities: [], // availability-only; Content API enrichment is a roadmap item
      distanceKm,
      pricePerNight: Math.max(1, Math.round(total / nights / rooms)),
      totalPrice: Math.round(total),
      currency: h.currency || "EUR",
    });
  }
  return offers.sort((a, b) => a.pricePerNight - b.pricePerNight);
}

/**
 * Budget bands are PRICE-first: rank terciles over the (cheapest-first)
 * fetched set. Real inventory's star categories don't track price (Milan
 * serves €42 "4 stars"), but the user's budget answer is about spend, so
 * price is the primary signal. The luxury band adds a quality guard (≥4★
 * when enough such offers exist) so an overpriced dump can't headline
 * "לפנק את עצמי". Bands under 3 offers fall back to the full list; all
 * filtering is local — never extra API calls.
 */
export function filterForBudget(offers: StayOffer[], budget?: BudgetLevel): StayOffer[] {
  if (!budget || offers.length < 4) return offers;
  const t1 = Math.ceil(offers.length / 3);
  const t2 = Math.ceil((2 * offers.length) / 3);
  let band: StayOffer[];
  if (budget === "budget") {
    band = offers.slice(0, t1);
  } else if (budget === "mid") {
    band = offers.slice(t1, t2);
  } else {
    const top = offers.slice(t2);
    const starred = top.filter((o) => o.stars >= 4);
    band = starred.length >= 3 ? starred : top;
  }
  return band.length >= 3 ? band : offers;
}

const MIN_CARDS = 5; // distance tier backfills to at least this many offers

/**
 * Median distanceKm of the set, or undefined when fewer than half the offers
 * carry a distance (no reliable signal — the mock and coord-less responses
 * pass through untouched).
 */
export function medianDistanceKm(offers: StayOffer[]): number | undefined {
  const d = offers
    .map((o) => o.distanceKm)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b);
  if (d.length === 0 || d.length < offers.length / 2) return undefined;
  return d[Math.floor((d.length - 1) / 2)];
}

/**
 * Distance tier: prefer offers at or under the SET's median distance — a
 * relative cutoff, so 5km-sprawl Tokyo and compact Florence each get their
 * own notion of "near". Offers without distanceKm count as near. When the
 * near tier is thinner than minCards, backfill nearest-first from the far
 * tier. Far offers otherwise surface only through the deal mechanism, a
 * moved search point (user named an area), or distanceFilter "any".
 */
export function selectByDistance(
  offers: StayOffer[],
  medianKm: number | undefined,
  minCards = MIN_CARDS,
): StayOffer[] {
  if (medianKm === undefined) return offers;
  const isNear = (o: StayOffer) =>
    typeof o.distanceKm !== "number" || o.distanceKm <= medianKm;
  const near = offers.filter(isNear);
  if (near.length >= minCards) return near;
  const fill = new Set(
    offers
      .filter((o) => !isNear(o))
      .sort((a, b) => a.distanceKm! - b.distanceKm!)
      .slice(0, minCards - near.length),
  );
  return offers.filter((o) => isNear(o) || fill.has(o)); // keeps price order
}

const KNOWN_BOARDS = new Set(["RO", "BB", "HB", "FB", "AI"]);
const ROOM_FEATURES: Array<[RegExp, string]> = [
  [/BALCON/i, "balcony"],
  [/SEA ?VIEW|OCEAN/i, "seaView"],
  [/TERRACE/i, "terrace"],
  [/SUITE/i, "suite"],
];
const MAX_ROOMS = 8;

/**
 * Compact per-room mapping from a hotel's availability rooms: cheapest rate
 * per board (board variants render as one inline choice on the mini-card),
 * neutral feature keys parsed from the room name, cheapest-first, capped.
 * rateKeys are deliberately dropped — rooms captured at search time are for
 * DISPLAY + selection-as-conversation; the booking round re-verifies fresh.
 */
export function mapRooms(
  rawRooms: HotelbedsRoom[],
  nights: number,
  roomsCount: number,
): Room[] {
  const rooms: Room[] = [];
  for (const r of rawRooms) {
    if (!r.name) continue;
    const byBoard = new Map<string, RoomRate>();
    for (const rate of r.rates ?? []) {
      const total = Number(rate.net);
      if (!Number.isFinite(total) || total <= 0) continue;
      const rawBoard = (rate.boardCode ?? "").trim().toUpperCase();
      const board = (KNOWN_BOARDS.has(rawBoard) ? rawBoard : "OTHER") as RoomRate["board"];
      const candidate: RoomRate = {
        board,
        ...(board === "OTHER" && rate.boardName ? { boardName: rate.boardName } : {}),
        pricePerNight: Math.max(1, Math.round(total / nights / roomsCount)),
        totalPrice: Math.round(total),
      };
      const existing = byBoard.get(board);
      if (!existing || candidate.totalPrice < existing.totalPrice) {
        byBoard.set(board, candidate);
      }
    }
    if (byBoard.size === 0) continue;
    const rates = [...byBoard.values()].sort((a, b) => a.pricePerNight - b.pricePerNight);
    rooms.push({
      code: r.code ?? r.name,
      name: r.name,
      features: ROOM_FEATURES.filter(([re]) => re.test(r.name!)).map(([, k]) => k),
      rates,
    });
  }
  return rooms
    .sort((a, b) => a.rates[0].pricePerNight - b.rates[0].pricePerNight)
    .slice(0, MAX_ROOMS);
}

type CapturedRooms = {
  checkIn: string;
  checkOut: string;
  guests: number;
  capturedAt: string;
  rooms: Room[];
};

/** Rooms captured at search time, one row per hotel (last search wins). The
 *  modal and the get_hotel_details tool read these — zero extra API calls. */
async function captureRooms(
  hotels: HotelbedsHotel[],
  query: StayQuery,
): Promise<void> {
  try {
    const nights = nightsBetween(query.checkIn, query.checkOut);
    const roomsCount = Math.max(1, query.rooms ?? 1);
    const rows = hotels
      .filter((h) => h.code && (h.rooms?.length ?? 0) > 0)
      .map((h) => {
        const rooms = mapRooms(h.rooms!, nights, roomsCount);
        return rooms.length === 0
          ? null
          : {
              key: `hbrooms|${h.code}`,
              offers: {
                checkIn: query.checkIn,
                checkOut: query.checkOut,
                guests: query.guests ?? 2,
                capturedAt: new Date().toISOString(),
                rooms,
              } satisfies CapturedRooms,
              created_at: new Date().toISOString(),
            };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) {
      await getSupabaseAdmin().from("stay_search_cache").upsert(rows);
    }
  } catch {
    /* best-effort — rooms are an enhancement, never break the search */
  }
}

/** Read a hotel's captured rooms (24h validity, matching the search cache). */
export async function getCapturedRooms(
  hotelCode: string,
): Promise<CapturedRooms | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("stay_search_cache")
      .select("offers, created_at")
      .eq("key", `hbrooms|${hotelCode}`)
      .single();
    if (!data) return null;
    if (Date.now() - Date.parse(data.created_at) > CACHE_TTL_MS) return null;
    return data.offers as CapturedRooms;
  } catch {
    return null;
  }
}

/** Cache key: coordinates rounded to ~1km + stay shape. Budget level is NOT
 *  in the key — the full list is cached and bands are filtered afterwards. */
function cacheKey(query: StayQuery): string {
  return [
    "hb1",
    query.latitude!.toFixed(2),
    query.longitude!.toFixed(2),
    query.checkIn,
    query.checkOut,
    query.guests ?? 2,
    query.rooms ?? 1,
  ].join("|");
}

// Cache + budget guard are best-effort: if Supabase (or the table) is
// unavailable, searches still work — they just hit the live API each time.

async function cacheGet(key: string): Promise<StayOffer[] | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("stay_search_cache")
      .select("offers, created_at")
      .eq("key", key)
      .single();
    if (!data) return null;
    if (Date.now() - Date.parse(data.created_at) > CACHE_TTL_MS) return null;
    return data.offers as StayOffer[];
  } catch {
    return null;
  }
}

async function cachePut(key: string, offers: StayOffer[]): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("stay_search_cache")
      .upsert({ key, offers, created_at: new Date().toISOString() });
  } catch {
    /* best-effort */
  }
}

/** Live calls today ≈ SEARCH cache rows written since UTC midnight (each live
 *  call writes exactly one "hb1|" row; a TTL refresh re-dates its row, still
 *  counted). Scoped by key prefix — per-hotel "hbrooms|" rows and diag rows
 *  must NOT inflate the count. */
async function liveCallsToday(): Promise<number> {
  try {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const { count, error } = await getSupabaseAdmin()
      .from("stay_search_cache")
      .select("key", { count: "exact", head: true })
      .like("key", "hb1|%")
      .gte("created_at", midnight.toISOString());
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export async function hotelbedsSearchStays(query: StayQuery): Promise<StayOffer[]> {
  const apiKey = process.env.HOTELBEDS_API_KEY;
  const secret = process.env.HOTELBEDS_SECRET;
  if (!apiKey || !secret) {
    throw new Error("Missing HOTELBEDS_API_KEY / HOTELBEDS_SECRET env vars.");
  }
  if (typeof query.latitude !== "number" || typeof query.longitude !== "number") {
    throw new Error(
      "Hotelbeds search needs the destination's latitude and longitude.",
    );
  }

  const key = cacheKey(query);
  const cached = await cacheGet(key);
  if (cached) {
    return finalizeOffers(cached, query);
  }

  if ((await liveCallsToday()) >= DAILY_CALL_BUDGET) {
    await logDiag("stays_quota_fallback", { destination: query.destination });
    return mockSearchStays(query);
  }

  const res = await fetch(`${BASE_URL}/hotel-api/1.0/hotels`, {
    method: "POST",
    headers: {
      "Api-key": apiKey,
      "X-Signature": signature(apiKey, secret),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      stay: { checkIn: query.checkIn, checkOut: query.checkOut },
      occupancies: [
        {
          rooms: Math.max(1, query.rooms ?? 1),
          adults: Math.max(1, query.guests ?? 2),
          children: 0,
        },
      ],
      geolocation: {
        latitude: query.latitude,
        longitude: query.longitude,
        radius: SEARCH_RADIUS_KM,
        unit: "km",
      },
      filter: { maxHotels: MAX_HOTELS },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Hotelbeds availability failed: HTTP ${res.status} ${detail}`);
  }

  const data = (await res.json()) as HotelbedsAvailability;
  // Verified 2026-07-20 (diag run, Sofia): availability responses carry NO
  // review data — TripAdvisor scores, if anywhere, live in the Content API
  // (checked in the detail-layer round). First-party reviews are primary.
  const rawHotels = data.hotels?.hotels ?? [];
  const offers = mapHotels(rawHotels, query);
  await cachePut(key, offers);
  // Option A (approved): rooms ride the search response we already paid for —
  // captured per hotel, zero extra API calls; booking re-verifies fresh.
  await captureRooms(rawHotels, query);
  return finalizeOffers(offers, query);
}

const DEAL_MIN_DISCOUNT = 0.3; // v1 starting constant (approved)
const DEAL_MIN_STARS = 3;

/**
 * Worth-it deal v1: among the band offers the distance tier EXCLUDED, find
 * the one priced far below the shown same-star median — ≥3★, needs ≥2 shown
 * comparables with the exact same stars, discount ≥30%. Best discount wins;
 * one deal max. The deal is never silently shown — the route packages it
 * separately and the concierge offers it with the catch stated.
 */
export function detectDeal(
  band: StayOffer[],
  shown: StayOffer[],
): StayOffer | undefined {
  const shownIds = new Set(shown.map((o) => o.id));
  let best: StayOffer | undefined;
  let bestDiscount = 0;
  for (const c of band) {
    if (shownIds.has(c.id)) continue;
    if (c.stars < DEAL_MIN_STARS || typeof c.distanceKm !== "number") continue;
    const prices = shown
      .filter((o) => o.stars === c.stars)
      .map((o) => o.pricePerNight)
      .sort((a, b) => a - b);
    if (prices.length < 2) continue;
    const median = prices[Math.floor((prices.length - 1) / 2)];
    const discount = 1 - c.pricePerNight / median;
    if (discount >= DEAL_MIN_DISCOUNT && discount > bestDiscount) {
      bestDiscount = discount;
      best = {
        ...c,
        deal: {
          discountPct: Math.round(discount * 100),
          comparableMedian: median,
        },
      };
    }
  }
  return best;
}

/**
 * Shared tail of both search paths: budget band → distance tier (skipped on
 * distanceFilter "any") → card cap → deal detection (appended, marked with
 * .deal; the route splits it out so cards never include it silently).
 */
function finalizeOffers(all: StayOffer[], query: StayQuery): StayOffer[] {
  const band = filterForBudget(all, query.budgetLevel);
  if (query.distanceFilter === "any") return band.slice(0, 8);
  const shown = selectByDistance(band, medianDistanceKm(all)).slice(0, 8);
  const deal = detectDeal(band, shown);
  return deal ? [...shown, deal] : shown;
}
