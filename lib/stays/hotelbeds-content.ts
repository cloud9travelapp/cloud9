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
};

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
  images?: Array<{ path?: string; visualOrder?: number; order?: number }>;
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
  const images = (hotel.images ?? [])
    .filter((i): i is { path: string; visualOrder?: number; order?: number } =>
      typeof i.path === "string",
    )
    .sort(
      (a, b) =>
        (a.visualOrder ?? a.order ?? 999) - (b.visualOrder ?? b.order ?? 999),
    )
    .slice(0, MAX_IMAGES)
    .map((i) => `${PHOTO_BASE}${i.path}`);
  return {
    name: hotel.name?.content,
    description: hotel.description?.content,
    images,
    amenities: amenitiesFromFacilities(hotel.facilities ?? [], facilityNames),
    address: hotel.address?.content,
    area: hotel.zoneName ?? hotel.city?.content,
    // reviewScore/reviewCount intentionally absent unless review data shows
    // up in the raw response (see the field stash below) — display-when-present.
  };
}

/**
 * A hotel's content: permanent cache first, Content API on miss. Returns null
 * on any failure — the modal shows a graceful "details unavailable" state.
 */
export async function getHotelbedsContent(
  hotelCode: string,
): Promise<HotelContent | null> {
  const cached = await cacheGetContent("hotelbeds", hotelCode);
  if (cached) return cached as HotelContent;
  try {
    const res = await fetch(
      `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/hotels/${encodeURIComponent(hotelCode)}/details?language=ENG&useSecondaryLanguage=false`,
      { headers: hotelbedsHeaders(), cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(`Content details failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { hotel?: ContentApiHotel };
    if (!data.hotel) return null;

    // Item-6 field stash: does the Content API carry review data? Record the
    // top-level field list + any review-shaped nodes for one-query reading.
    const raw = data.hotel as Record<string, unknown>;
    const reviewish = Object.keys(raw).filter((k) =>
      /review|tripadv|rating/i.test(k),
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
    });

    const facilityNames = await getFacilityNames().catch(() => ({}));
    const content = mapHotelContent(data.hotel, facilityNames);
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
