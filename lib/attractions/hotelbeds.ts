import "server-only";
import { activitiesHeaders, HOTELBEDS_BASE_URL } from "@/lib/stays/hotelbeds-auth";
import { haversineKm } from "@/lib/stays/hotelbeds";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logDiag } from "@/lib/diag";
import { mockSearchAttractions } from "./mock";
import type {
  AttractionCategory,
  AttractionOffer,
  AttractionQuery,
} from "./types";

// Real Hotelbeds Activities provider (the swap file). Near-clone of the stays
// hotelbeds provider: cache-first (attraction_search_cache, 24h), a 45/day guard
// shy of the 50/day evaluation limit (its OWN Activities key/quota, separate
// from Hotels), and a graceful fallback to the seeded mock when the guard trips
// or the API errors — the mock's "mock-" ids re-label the cards as test data.
// Browse/recommend only: Availability/Search + Content, no CheckRate/Booking
// (so no certification). Auth reuses the shared SHA-256 signer via
// activitiesHeaders(). The EXACT request-filter + response-field paths are
// confirmed on the first live call (logged via the `activity_api_fields` diag);
// the cache/guard/fallback/mapping skeleton is provider-final.

const DAILY_CALL_BUDGET = 45;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_RADIUS_M = 20000; // 20km around the searched point
const ITEMS_PER_PAGE = 40;
const DEFAULT_PAX_AGE = 30;
const FETCH_TIMEOUT_MS = 8000; // abort a slow/hung Activities call → fast fallback

// ── Cache + budget guard (best-effort; the app still works if Supabase is down)
function cacheKey(query: AttractionQuery): string {
  return [
    "hba1",
    (query.latitude ?? 0).toFixed(2),
    (query.longitude ?? 0).toFixed(2),
    query.from,
    query.to,
    query.category ?? "all",
    query.priceLevel ?? "any",
    (query.keyword ?? "").toLowerCase().slice(0, 24),
  ].join("|");
}

async function cacheGet(key: string): Promise<AttractionOffer[] | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("attraction_search_cache")
      .select("offers, created_at")
      .eq("key", key)
      .single();
    if (!data) return null;
    if (Date.now() - Date.parse(data.created_at) > CACHE_TTL_MS) return null;
    return data.offers as AttractionOffer[];
  } catch {
    return null;
  }
}

async function cachePut(key: string, offers: AttractionOffer[]): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("attraction_search_cache")
      .upsert({ key, offers, created_at: new Date().toISOString() });
  } catch {
    /* best-effort */
  }
}

/** Live Activities calls today ≈ rows written since UTC midnight across BOTH
 *  the search cache ("hba1|") and the content cache (each live search/content
 *  call writes exactly one row). Guards search AND content against the shared
 *  50/day Activities quota. */
async function liveCallsToday(): Promise<number> {
  try {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const admin = getSupabaseAdmin();
    const [search, content] = await Promise.all([
      admin
        .from("attraction_search_cache")
        .select("key", { count: "exact", head: true })
        .like("key", "hba1|%")
        .gte("created_at", midnight.toISOString()),
      admin
        .from("attraction_content_cache")
        .select("code", { count: "exact", head: true })
        .gte("created_at", midnight.toISOString()),
    ]);
    return (search.count ?? 0) + (content.count ?? 0);
  } catch {
    return 0;
  }
}

// ── Response mapping (defensive; field paths confirmed on the first live call)
type RawActivity = {
  code?: string;
  name?: string | { content?: string };
  country?: { destinations?: unknown };
  geolocation?: { latitude?: number; longitude?: number };
  content?: {
    description?: string;
    duration?: { value?: number; metric?: string };
    segmentation?: Array<{ code?: string; name?: string }>;
  };
  segmentationCodes?: Array<{ code?: string }>;
  amountFrom?: number;
  modalities?: Array<{
    amount?: { amounts?: Array<{ amount?: number }> };
    amountsFromDetail?: { paxAmounts?: Array<{ amount?: number }> };
    rates?: Array<{ rateDetails?: Array<{ totalAmount?: number }> }>;
  }>;
  currency?: string;
};

/** Map a Hotelbeds segmentation/type code or label to our neutral category. */
function toCategory(raw: RawActivity): AttractionCategory {
  const label =
    (raw.content?.segmentation?.[0]?.name ?? "").toLowerCase() +
    " " +
    (raw.content?.description ?? "").toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => label.includes(w));
  if (has("museum", "gallery", "exhibit")) return "museums";
  if (has("food", "wine", "tasting", "culinary", "dinner", "cooking")) return "food";
  if (has("cruise", "sail", "boat", "kayak", "snorkel", "diving", "water")) return "water";
  if (has("night", "bar", "club", "show", "flamenco")) return "nightlife";
  if (has("family", "kids", "children", "zoo", "aquarium")) return "family";
  if (has("hike", "bike", "adventure", "climb", "raft", "quad", "safari")) return "adventure";
  if (has("spa", "wellness", "hammam", "massage")) return "wellness";
  if (has("nature", "park", "garden", "mountain", "day trip", "excursion")) return "outdoors";
  if (has("history", "culture", "old town", "walking", "heritage")) return "culture";
  return "tours";
}

function firstPrice(raw: RawActivity): number | null {
  if (typeof raw.amountFrom === "number") return raw.amountFrom;
  const nums: number[] = [];
  for (const m of raw.modalities ?? []) {
    for (const a of m.amount?.amounts ?? []) if (typeof a.amount === "number") nums.push(a.amount);
    for (const p of m.amountsFromDetail?.paxAmounts ?? []) if (typeof p.amount === "number") nums.push(p.amount);
    for (const r of m.rates ?? [])
      for (const d of r.rateDetails ?? []) if (typeof d.totalAmount === "number") nums.push(d.totalAmount);
  }
  return nums.length ? Math.min(...nums) : null;
}

function mapActivities(raw: RawActivity[], query: AttractionQuery): AttractionOffer[] {
  const offers: AttractionOffer[] = [];
  for (const a of raw) {
    const code = a.code;
    const name = typeof a.name === "string" ? a.name : a.name?.content;
    const fromPrice = firstPrice(a);
    if (!code || !name || fromPrice == null) continue; // never fabricate a price
    const durMin =
      a.content?.duration?.metric?.toLowerCase().startsWith("hour")
        ? Math.round((a.content.duration.value ?? 0) * 60)
        : a.content?.duration?.value;
    const distanceKm =
      typeof query.latitude === "number" &&
      typeof query.longitude === "number" &&
      typeof a.geolocation?.latitude === "number" &&
      typeof a.geolocation?.longitude === "number"
        ? Math.round(
            haversineKm(query.latitude, query.longitude, a.geolocation.latitude, a.geolocation.longitude) * 10,
          ) / 10
        : undefined;
    offers.push({
      id: `hb-${code}`,
      name,
      category: toCategory(a),
      durationMinutes: typeof durMin === "number" && durMin > 0 ? durMin : undefined,
      fromPrice,
      currency: a.currency ?? "EUR",
      distanceKm,
      // summary comes from the content description when present; the model
      // rewrites it into the reply language when authoring the block.
      summary: a.content?.description?.slice(0, 140) || undefined,
    });
  }
  offers.sort((a, b) => a.fromPrice - b.fromPrice); // cheapest first
  return offers;
}

type FetchResult = {
  offers: AttractionOffer[];
  status: number;
  bodyBytes: number;
  activityCount: number;
  mapped: number;
  firstKeys: string[];
  rawSample: string; // TEMP verbose — remove once the mapping is confirmed
};

async function fetchActivities(query: AttractionQuery, key: string): Promise<FetchResult> {
  const body = {
    filters: [
      {
        searchFilterItems: [
          {
            type: "gps",
            latitude: query.latitude,
            longitude: query.longitude,
            radius: SEARCH_RADIUS_M,
            unit: "m",
          },
        ],
      },
    ],
    from: query.from,
    to: query.to,
    language: "en",
    paxes: [{ age: DEFAULT_PAX_AGE }],
    pagination: { itemsPerPage: ITEMS_PER_PAGE, page: 1 },
    order: "DEFAULT",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HOTELBEDS_BASE_URL}/activity-api/3.0/activities`, {
      method: "POST",
      headers: activitiesHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const rawText = await res.text();
    if (!res.ok) {
      // Carry status + body up so the trace records the real HTTP failure.
      throw new Error(`Hotelbeds activities HTTP ${res.status}: ${rawText.slice(0, 400)}`);
    }
    const data = JSON.parse(rawText) as { activities?: RawActivity[] };
    const rawActivities = Array.isArray(data.activities) ? data.activities : [];
    let offers: AttractionOffer[] = [];
    try {
      offers = mapActivities(rawActivities, query);
    } catch (mapErr) {
      console.error("mapActivities threw:", mapErr);
    }
    await cachePut(key, offers);
    return {
      offers,
      status: res.status,
      bodyBytes: rawText.length,
      activityCount: rawActivities.length,
      mapped: offers.length,
      firstKeys: rawActivities[0] ? Object.keys(rawActivities[0]) : [],
      rawSample: rawText.slice(0, 2000),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every search leaves EXACTLY ONE `attraction_search_trace` diag row with its
 * `source` and full outcome — a silent fallback (serving mock while reporting
 * success) is the very thing the diag rule exists to prevent. If NO trace at
 * all appears for a search, the hotelbeds case isn't running (stale build or
 * ATTRACTION_PROVIDER not set) — which is itself the diagnosis.
 */
export async function hotelbedsSearchAttractions(
  query: AttractionQuery,
): Promise<AttractionOffer[]> {
  const t0 = Date.now();
  const base = { destination: query.destination, from: query.from, to: query.to };
  try {
    activitiesHeaders(); // throws early when keys are missing
    if (typeof query.latitude !== "number" || typeof query.longitude !== "number") {
      throw new Error("Hotelbeds activities search needs the destination's latitude and longitude.");
    }
    const key = cacheKey(query);

    const cached = await cacheGet(key);
    if (cached) {
      await logDiag("attraction_search_trace", { ...base, source: "cache", count: cached.length, ms: Date.now() - t0 });
      return cached;
    }

    const budgetSpent = await liveCallsToday();
    if (budgetSpent >= DAILY_CALL_BUDGET) {
      const mock = await mockSearchAttractions(query);
      await logDiag("attraction_search_trace", { ...base, source: "mock:guard", budgetSpent, count: mock.length, ms: Date.now() - t0 });
      return mock;
    }

    const r = await fetchActivities(query, key);
    await logDiag("attraction_search_trace", {
      ...base,
      source: r.offers.length > 0 ? "live:real" : "live:empty",
      status: r.status,
      bodyBytes: r.bodyBytes,
      activities: r.activityCount,
      mapped: r.mapped,
      firstKeys: r.firstKeys,
      rawSample: r.rawSample, // TEMP — remove once mapping is confirmed
      ms: Date.now() - t0,
    });
    // Honest: a genuine empty live result returns [] (the concierge says
    // nothing's in inventory here). The LOUD trace above distinguishes a real
    // "no activities" from a wrong-request "0 results" while we tune.
    return r.offers;
  } catch (err) {
    console.error("Hotelbeds activities search failed:", err);
    const mock = await mockSearchAttractions(query);
    await logDiag("attraction_search_trace", {
      ...base,
      source: "mock:error",
      message: String(err).slice(0, 400),
      count: mock.length,
      ms: Date.now() - t0,
    });
    return mock;
  }
}

/** The full result set WITHOUT a live call — the show-more pool (cache-only,
 *  never burns quota). Null = expired/absent. Mirrors peekStays. */
export async function hotelbedsPeekAttractions(
  query: AttractionQuery,
): Promise<AttractionOffer[] | null> {
  return cacheGet(cacheKey(query));
}

// ── Content (images + description) — permanent cache (attraction_content_cache),
// mirroring the stays content path. Content-403 (quota) → null, and the modal/
// card show the same honest "couldn't load" fallback as stays.
export type ActivityContent = { images: string[]; description?: string; included?: string[] };

/** Pull image URLs out of the various shapes Hotelbeds content can use
 *  (media/images arrays with path/url/urls). Defensive; confirmed on first call. */
function extractImages(node: unknown): string[] {
  const urls: string[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(o)) {
      if ((k === "url" || k === "path") && typeof val === "string" && /^https?:\/\//.test(val)) {
        urls.push(val);
      } else if (k === "urls" && Array.isArray(val)) {
        for (const u of val) if (typeof u === "string" && /^https?:\/\//.test(u)) urls.push(u);
      } else {
        walk(val);
      }
    }
  };
  walk(node);
  return [...new Set(urls)].slice(0, 12);
}

export async function hotelbedsActivityContent(code: string): Promise<ActivityContent | null> {
  // cache-first (permanent)
  try {
    const { data } = await getSupabaseAdmin()
      .from("attraction_content_cache")
      .select("content")
      .eq("provider", "hotelbeds")
      .eq("code", code)
      .single();
    if (data?.content) return data.content as ActivityContent;
  } catch {
    /* miss → fetch */
  }
  try {
    activitiesHeaders();
    if ((await liveCallsToday()) >= DAILY_CALL_BUDGET) {
      await logDiag("attractions_quota_fallback", { path: "content", code });
      return null; // honest: content unavailable (the modal shows the note)
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `${HOTELBEDS_BASE_URL}/activity-content-api/1.0/activities/${encodeURIComponent(code)}?language=en`,
      { headers: activitiesHeaders(), cache: "no-store", signal: controller.signal },
    ).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`Activity content failed: HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const activity = (data.activityContent ?? data.activity ?? data) as Record<string, unknown>;
    await logDiag("activity_content_fields", {
      code,
      fields: Object.keys(activity),
      sample: JSON.stringify(activity).slice(0, 500),
    });
    const content: ActivityContent = { images: extractImages(activity) };
    const contentNode = activity.content as Record<string, unknown> | undefined;
    const description = (contentNode?.description ?? activity.description) as string | undefined;
    if (typeof description === "string" && description.trim()) content.description = description;
    await getSupabaseAdmin()
      .from("attraction_content_cache")
      .upsert({ provider: "hotelbeds", code, content, created_at: new Date().toISOString() });
    return content;
  } catch (err) {
    console.error("Hotelbeds activity content failed:", err);
    await logDiag("content_api_error", {
      provider: "hotelbeds-activity",
      code,
      message: String(err).slice(0, 300),
    });
    return null;
  }
}
