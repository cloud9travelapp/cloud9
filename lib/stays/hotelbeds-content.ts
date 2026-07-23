import "server-only";
import { HOTELBEDS_BASE_URL, hotelbedsHeaders } from "./hotelbeds-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logDiag } from "@/lib/diag";

// Hotelbeds Content API client — hotel details (photos, description,
// amenities, address) fetched LAZILY on first modal open per hotel, then
// cached PERMANENTLY in hotel_content_cache (content changes rarely; the
// search path never touches this). One extra one-time call fetches the
// facilities catalog (code → description) so amenity codes become names we
// can map to our neutral keys.

const PHOTO_BASE = "https://photos.hotelbeds.com/giata/bigger/";
const MAX_IMAGES = 10;
const MAX_AMENITIES = 10;
const FACILITIES_CACHE_CODE = "__facilities__";
const DESTINATIONS_CACHE_CODE = "__destinations__";
const HOTEL_INDEX_CACHE_PREFIX = "__hotelindex__"; // + destinationCode
const CATALOG_PAGE = 1000;
const MAX_CATALOG_PAGES = 5; // hard cap per catalog/index fetch (once ever, cached permanently)

/** Mapped, compact content — this is what the cache stores and the modal and
 *  the get_hotel_details tool consume. */
export type HotelContent = {
  name?: string;
  description?: string;
  images: string[];
  amenities: string[]; // neutral keys, same vocabulary as the cards
  address?: string;
  area?: string;
  reviewScore?: number; // 0-10, only when the Content API carries review data
  reviewCount?: number;
  /** Room-level images keyed by the provider room code (matches availability
   *  room codes, e.g. "DBL.ST"). Always present since the room-photos round. */
  roomImages?: Record<string, string[]>;
  /** Content-shape version stamped at mapping time. A cached entry with an
   *  older (or missing) version refetches ONCE — the generalized form of the
   *  roomImages-presence check, so future shape changes are one bump here. */
  v?: number;
};

/** Bump when HotelContent's mapped shape changes (v2: room gallery — per-room
 *  image cap raised 3→8 for the mini-gallery). */
export const CONTENT_VERSION = 2;

const MAX_ROOM_IMAGES = 8; // per room, ordered by visualOrder (room gallery)
const MAX_IMAGE_ROOMS = 16; // distinct room codes worth carrying

const AMENITY_PATTERNS: Array<[RegExp, string]> = [
  [/WI-?FI|WIRELESS/i, "wifi"],
  [/SWIMMING POOL|OUTDOOR POOL|INDOOR POOL|\bPOOL\b/i, "pool"],
  [/CAR PARK|PARKING|GARAGE/i, "parking"],
  [/GYM|FITNESS/i, "gym"],
  [/\bSPA\b|WELLNESS/i, "spa"],
  [/AIR CONDITION/i, "aircon"],
  [/BREAKFAST/i, "breakfast"],
  [/KITCHEN|KITCHENETTE/i, "kitchen"],
  [/ROOF ?TOP|ROOF TERRACE/i, "rooftop"],
];

// Minimal slices of the Content API responses we consume.
type ContentApiHotel = {
  name?: { content?: string };
  description?: { content?: string };
  address?: { content?: string };
  city?: { content?: string };
  zoneName?: string;
  images?: Array<{
    path?: string;
    visualOrder?: number;
    order?: number;
    roomCode?: string;
  }>;
  facilities?: Array<{ facilityCode?: number; facilityGroupCode?: number }>;
};
type FacilityCatalogEntry = {
  code?: number;
  facilityGroupCode?: number;
  description?: { content?: string };
};

async function cacheGetContent(
  provider: string,
  hotelCode: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("hotel_content_cache")
      .select("content")
      .eq("hotel_provider", provider)
      .eq("hotel_code", hotelCode)
      .single();
    return (data?.content as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

async function cachePutContent(
  provider: string,
  hotelCode: string,
  content: Record<string, unknown>,
): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("hotel_content_cache")
      .upsert({ hotel_provider: provider, hotel_code: hotelCode, content });
  } catch {
    /* best-effort — a cache miss next time just re-fetches */
  }
}

/** Facilities catalog (code+group → description), fetched once and cached
 *  permanently under a reserved hotel_code. */
async function getFacilityNames(): Promise<Record<string, string>> {
  const cached = await cacheGetContent("hotelbeds", FACILITIES_CACHE_CODE);
  if (cached) return cached as Record<string, string>;
  const res = await fetch(
    `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/types/facilities?fields=all&language=ENG&from=1&to=1000`,
    { headers: hotelbedsHeaders(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Facilities catalog failed: HTTP ${res.status}`);
  const data = (await res.json()) as { facilities?: FacilityCatalogEntry[] };
  const map: Record<string, string> = {};
  for (const f of data.facilities ?? []) {
    if (typeof f.code === "number" && f.description?.content) {
      map[`${f.facilityGroupCode}|${f.code}`] = f.description.content;
    }
  }
  await cachePutContent("hotelbeds", FACILITIES_CACHE_CODE, map);
  return map;
}

/** Map raw facility codes → our neutral amenity keys (deduped, capped). */
export function amenitiesFromFacilities(
  facilities: Array<{ facilityCode?: number; facilityGroupCode?: number }>,
  facilityNames: Record<string, string>,
): string[] {
  const keys: string[] = [];
  for (const f of facilities) {
    const name = facilityNames[`${f.facilityGroupCode}|${f.facilityCode}`];
    if (!name) continue;
    for (const [re, key] of AMENITY_PATTERNS) {
      if (re.test(name) && !keys.includes(key)) keys.push(key);
    }
    if (keys.length >= MAX_AMENITIES) break;
  }
  return keys;
}

/** Map a Content API hotel to our compact HotelContent. Exported for tests. */
export function mapHotelContent(
  hotel: ContentApiHotel,
  facilityNames: Record<string, string>,
): HotelContent {
  const sorted = (hotel.images ?? [])
    .filter(
      (i): i is { path: string; visualOrder?: number; order?: number; roomCode?: string } =>
        typeof i.path === "string",
    )
    .sort(
      (a, b) =>
        (a.visualOrder ?? a.order ?? 999) - (b.visualOrder ?? b.order ?? 999),
    );
  const images = sorted.slice(0, MAX_IMAGES).map((i) => `${PHOTO_BASE}${i.path}`);
  // Room-level images ride the same response tagged with a roomCode — carry
  // the association (dropped before the room-photos round) so the modal's
  // room mini-cards can show their photos.
  const roomImages: Record<string, string[]> = {};
  for (const i of sorted) {
    if (!i.roomCode) continue;
    const bucket = roomImages[i.roomCode];
    if (!bucket && Object.keys(roomImages).length >= MAX_IMAGE_ROOMS) continue;
    if ((bucket?.length ?? 0) >= MAX_ROOM_IMAGES) continue;
    (roomImages[i.roomCode] ??= []).push(`${PHOTO_BASE}${i.path}`);
  }
  return {
    name: hotel.name?.content,
    description: hotel.description?.content,
    images,
    amenities: amenitiesFromFacilities(hotel.facilities ?? [], facilityNames),
    address: hotel.address?.content,
    area: hotel.zoneName ?? hotel.city?.content,
    roomImages,
    v: CONTENT_VERSION,
    // reviewScore/reviewCount intentionally absent unless review data shows
    // up in the raw response (see the field stash below) — display-when-present.
    // Confirmed 2026-07-21 (content_api_fields diag, live opens): the TEST
    // environment's Content API carries NO review fields — first-party
    // verified reviews are the primary strategy.
  };
}

// ── Hotel-by-name: destination catalog + per-destination name index ──────
// Both are fetched ONCE ever (paged, hard-capped) and cached permanently in
// hotel_content_cache under reserved codes — the fuzzy matching itself is
// local and free. Used when the traveler asks for a specific property.

export type NamedHotelEntry = { code: number; name: string };

/** Normalize a hotel/destination name for matching: lowercase, diacritics
 *  stripped, punctuation → spaces, "&" → "and", generic words dropped. */
export function normalizeHotelName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9֐-׿]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !["hotel", "hotels", "the"].includes(t))
    .join(" ");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/**
 * Rank inventory entries against the requested name. Score = token coverage
 * (how much of the QUERY appears in the candidate, 70%) + bigram Dice
 * similarity (30%). Deterministic; returns strong matches only (all-or-most
 * query tokens present), best first, capped — the availability call takes the
 * top codes.
 */
export function matchHotelName(
  requested: string,
  candidates: NamedHotelEntry[],
  max = 10,
): Array<NamedHotelEntry & { score: number }> {
  const q = normalizeHotelName(requested);
  if (!q) return [];
  const qTokens = q.split(" ");
  const qBigrams = bigrams(q);
  const scored: Array<NamedHotelEntry & { score: number }> = [];
  for (const c of candidates) {
    const n = normalizeHotelName(c.name);
    if (!n) continue;
    const nTokens = new Set(n.split(" "));
    const covered = qTokens.filter((t) => nTokens.has(t)).length / qTokens.length;
    if (covered < 0.75) continue; // most of what they asked for must be there
    const nBigrams = bigrams(n);
    let inter = 0;
    for (const b of qBigrams) if (nBigrams.has(b)) inter++;
    const dice = (2 * inter) / (qBigrams.size + nBigrams.size || 1);
    const score = covered * 0.7 + dice * 0.3;
    if (score >= 0.5) scored.push({ ...c, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

type DestinationEntry = { code: string; name: string; countryCode?: string };

/** Paged catalog fetch shared by destinations and per-destination hotel
 *  lists. Stops on a short page or the hard page cap. */
async function fetchPaged<T>(
  urlFor: (from: number, to: number) => string,
  pick: (data: unknown) => T[],
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
    const from = page * CATALOG_PAGE + 1;
    const res = await fetch(urlFor(from, from + CATALOG_PAGE - 1), {
      headers: hotelbedsHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Content catalog failed: HTTP ${res.status}`);
    const batch = pick(await res.json());
    all.push(...batch);
    if (batch.length < CATALOG_PAGE) break;
  }
  return all;
}

/** Resolve a destination name ("Paris") to its Hotelbeds destination code
 *  ("PAR") via the permanently-cached destinations catalog. Null when the
 *  catalog can't resolve it (caller degrades honestly). */
export async function getDestinationCode(
  destinationName: string,
): Promise<string | null> {
  try {
    let catalog = (await cacheGetContent(
      "hotelbeds",
      DESTINATIONS_CACHE_CODE,
    )) as { destinations?: DestinationEntry[] } | null;
    if (!catalog?.destinations) {
      const destinations = await fetchPaged<DestinationEntry>(
        (from, to) =>
          `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/locations/destinations?fields=all&language=ENG&from=${from}&to=${to}`,
        (data) =>
          ((data as {
            destinations?: Array<{
              code?: string;
              name?: { content?: string };
              countryCode?: string;
            }>;
          }).destinations ?? [])
            .filter((d) => d.code && d.name?.content)
            .map((d) => ({
              code: d.code!,
              name: d.name!.content!,
              countryCode: d.countryCode,
            })),
      );
      if (!destinations.length) return null;
      catalog = { destinations };
      await cachePutContent("hotelbeds", DESTINATIONS_CACHE_CODE, catalog);
    }
    const want = normalizeHotelName(destinationName);
    if (!want) return null;
    const exact = catalog.destinations!.find(
      (d) => normalizeHotelName(d.name) === want,
    );
    if (exact) return exact.code;
    const partial = catalog.destinations!.find((d) => {
      const n = normalizeHotelName(d.name);
      return n.startsWith(want) || want.startsWith(n);
    });
    return partial?.code ?? null;
  } catch (err) {
    console.error("Destination catalog failed:", err);
    await logDiag("content_api_error", {
      stage: "destinations",
      message: String(err).slice(0, 300),
    });
    return null;
  }
}

/** All hotel codes+names for a destination, cached permanently — the local
 *  matching corpus for hotel-by-name. Null on failure (degrade honestly). */
export async function getHotelNameIndex(
  destinationCode: string,
): Promise<NamedHotelEntry[] | null> {
  try {
    const cacheCode = `${HOTEL_INDEX_CACHE_PREFIX}${destinationCode}`;
    const cached = (await cacheGetContent("hotelbeds", cacheCode)) as {
      hotels?: NamedHotelEntry[];
    } | null;
    if (cached?.hotels) return cached.hotels;
    const hotels = await fetchPaged<NamedHotelEntry>(
      (from, to) =>
        `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/hotels?destinationCode=${encodeURIComponent(destinationCode)}&fields=name&language=ENG&from=${from}&to=${to}`,
      (data) =>
        ((data as {
          hotels?: Array<{ code?: number; name?: { content?: string } }>;
        }).hotels ?? [])
          .filter((h) => typeof h.code === "number" && h.name?.content)
          .map((h) => ({ code: h.code!, name: h.name!.content! })),
    );
    await cachePutContent("hotelbeds", cacheCode, { hotels });
    return hotels;
  } catch (err) {
    console.error("Hotel name index failed:", err);
    await logDiag("content_api_error", {
      stage: "hotel_index",
      destinationCode,
      message: String(err).slice(0, 300),
    });
    return null;
  }
}

/**
 * A hotel's content: permanent cache first, Content API on miss. Returns null
 * on any failure — the modal shows a graceful "details unavailable" state.
 */
export async function getHotelbedsContent(
  hotelCode: string,
): Promise<HotelContent | null> {
  const cached = await cacheGetContent("hotelbeds", hotelCode);
  // An entry from an older content shape (missing or lower v) is a miss ONCE;
  // the refetched entry carries the current version, so this can't loop.
  if (cached && (cached as HotelContent).v === CONTENT_VERSION) {
    return cached as HotelContent;
  }
  try {
    const res = await fetch(
      `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/hotels/${encodeURIComponent(hotelCode)}/details?language=ENG&useSecondaryLanguage=false`,
      { headers: hotelbedsHeaders(), cache: "no-store" },
    );
    if (!res.ok) {
      // Measure, don't assume: capture any quota/rate-limit headers the API
      // sends alongside the failure (the docs document neither the reset time
      // nor quota headers — this observes reality).
      const quotaish: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        if (/quota|limit|remaining|reset|retry/i.test(k)) quotaish[k] = v;
      });
      await logDiag("content_api_http", {
        hotelCode,
        status: res.status,
        headers: quotaish,
      });
      throw new Error(`Content details failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { hotel?: ContentApiHotel };
    if (!data.hotel) return null;

    const facilityNames = await getFacilityNames().catch(() => ({}));
    const content = mapHotelContent(data.hotel, facilityNames);

    // Field stash: review-shaped nodes (the closed reviews verdict keeps
    // auto-answering on new fetches) + room-image distribution (verifies the
    // multiple-images-per-room assumption behind the room mini-gallery).
    const raw = data.hotel as Record<string, unknown>;
    const reviewish = Object.keys(raw).filter((k) =>
      /review|tripadv|rating/i.test(k),
    );
    const roomImageCounts = Object.values(content.roomImages ?? {}).map(
      (imgs) => imgs.length,
    );
    await logDiag("content_api_fields", {
      hotelCode,
      fields: Object.keys(raw),
      reviewFields: reviewish,
      reviewSample: reviewish.length
        ? JSON.stringify(
            Object.fromEntries(reviewish.map((k) => [k, raw[k]])),
          ).slice(0, 500)
        : null,
      roomsWithImages: roomImageCounts.length,
      maxImagesPerRoom: roomImageCounts.length ? Math.max(...roomImageCounts) : 0,
    });
    await cachePutContent("hotelbeds", hotelCode, content);
    return content;
  } catch (err) {
    console.error("Hotelbeds content fetch failed:", err);
    await logDiag("content_api_error", {
      hotelCode,
      message: String(err).slice(0, 300),
    });
    return null;
  }
}
