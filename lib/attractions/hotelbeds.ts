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
const ITEMS_PER_PAGE = 40;
const DEFAULT_PAX_AGE = 30;
const FETCH_TIMEOUT_MS = 8000; // abort a slow/hung Activities call → fast fallback

// ── Cache + budget guard (best-effort; the app still works if Supabase is down)
// Key prefix carries a GENERATION ("hba4" since the per-person-only from-price)
// so a mapping change can invalidate stale cached offers without a migration.
function cacheKey(query: AttractionQuery): string {
  return [
    "hba4",
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

/** Live Activities calls today, against the shared 50/day quota. Each live
 *  SEARCH costs TWO calls (availability + the batched content prefetch), and
 *  each writes one "hba…" search row → count those rows double. Single-code
 *  content fallbacks (src:"single") cost one call each; batch-written content
 *  rows (src:"batch") ride the search's second call and must NOT add more. */
async function liveCallsToday(): Promise<number> {
  try {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const admin = getSupabaseAdmin();
    const [search, content] = await Promise.all([
      admin
        .from("attraction_search_cache")
        .select("key", { count: "exact", head: true })
        .like("key", "hba%") // all key generations count against the quota
        .gte("created_at", midnight.toISOString()),
      admin
        .from("attraction_content_cache")
        .select("code", { count: "exact", head: true })
        .eq("content->>src", "single")
        .gte("created_at", midnight.toISOString()),
    ]);
    return (search.count ?? 0) * 2 + (content.count ?? 0);
  } catch {
    return 0;
  }
}

// ── Response mapping (defensive; field paths confirmed on the first live call)
// Shapes per the docs + a working integration (confirmed 2026-07-22 research):
// name/description live under `content`, the from-price is `amountsFrom`
// (PLURAL — a number or an array of pax amounts), currency is `currencyName`,
// duration rides each modality. All optional/defensive — the trace's rawSample
// verifies against reality.
type RawAmountsFrom = number | Array<{ amount?: number }>;
type RawActivity = {
  code?: string;
  activityCode?: string;
  name?: string | { content?: string };
  geolocation?: { latitude?: number; longitude?: number };
  content?: {
    name?: string;
    description?: string;
    duration?: { value?: number; metric?: string };
    location?: {
      startingPoints?: Array<{
        meetingPoint?: { geolocation?: { latitude?: number; longitude?: number } };
      }>;
      geolocation?: { latitude?: number; longitude?: number };
    };
    segmentation?: Array<{ code?: string; name?: string }>;
  };
  amountsFrom?: RawAmountsFrom;
  modalities?: Array<{
    name?: string;
    amountsFrom?: RawAmountsFrom;
    duration?: { value?: number; metric?: string };
    amount?: { amounts?: Array<{ amount?: number }> };
    rates?: Array<{ rateDetails?: Array<{ totalAmount?: number; paxAmounts?: unknown }> }>;
  }>;
  currencyName?: string;
  currency?: string;
};

/** Lowest POSITIVE amount — amountsFrom arrives as per-pax-type entries and
 *  CHILD/INFANT rows are often 0; a bare Math.min turned EVERY card into
 *  "0 EUR" (live 2026-07-24 finding). 0/absent = no price, never a price. */
function amountsFromMin(v: RawAmountsFrom | undefined): number | null {
  if (typeof v === "number") return v > 0 ? v : null;
  if (Array.isArray(v)) {
    const nums = v
      .map((x) => x?.amount)
      .filter((n): n is number => typeof n === "number" && n > 0);
    if (nums.length) return Math.min(...nums);
  }
  return null;
}

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

/** PER-PERSON from-price ONLY. rateDetails.totalAmount is a BOOKING TOTAL
 *  (whole party/private group), NOT a per-person price — using it as a
 *  fallback showed a private-group total labeled "from … per person" (the
 *  Zurich 225-vs-market finding, 2026-07-24). An activity whose only prices
 *  are group totals gets an honest price-less card instead. */
function firstPrice(raw: RawActivity): number | null {
  const top = amountsFromMin(raw.amountsFrom);
  if (top != null) return top;
  const nums: number[] = [];
  for (const m of raw.modalities ?? []) {
    const mf = amountsFromMin(m.amountsFrom);
    if (mf != null) nums.push(mf);
    for (const a of m.amount?.amounts ?? [])
      if (typeof a.amount === "number" && a.amount > 0) nums.push(a.amount);
  }
  return nums.length ? Math.min(...nums) : null;
}

function activityGeo(a: RawActivity): { latitude?: number; longitude?: number } | undefined {
  return (
    a.geolocation ??
    a.content?.location?.geolocation ??
    a.content?.location?.startingPoints?.[0]?.meetingPoint?.geolocation
  );
}

/** Content descriptions may carry HTML — plain text only on our cards. Tags
 *  removed, then common entities decoded ("Lakes &amp; Mountain" leaked raw
 *  in a live modal); &amp; is decoded LAST so chains can't double-decode. */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&(apos|#0?39);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The API's currencyName is a WORD ("Euro", "US Dollar") — normalize to the
 *  ISO code our money() formatting expects; 3-letter codes pass through. */
function normalizeCurrency(raw: string | undefined): string {
  if (!raw) return "EUR";
  const v = raw.trim();
  if (/^[A-Z]{3}$/.test(v)) return v;
  const byName: Record<string, string> = {
    euro: "EUR",
    "us dollar": "USD",
    dollar: "USD",
    "pound sterling": "GBP",
    pound: "GBP",
  };
  return byName[v.toLowerCase()] ?? v.toUpperCase().slice(0, 3);
}

function mapActivities(raw: RawActivity[], query: AttractionQuery): AttractionOffer[] {
  const offers: AttractionOffer[] = [];
  for (const a of raw) {
    const code = a.code ?? a.activityCode;
    const name =
      a.content?.name ?? (typeof a.name === "string" ? a.name : a.name?.content);
    if (!code || !name) continue;
    // No positive price anywhere → an honest PRICE-LESS offer (no price line on
    // the card) — never print 0 and never fabricate a number.
    const fromPrice = firstPrice(a);
    const dur = a.content?.duration ?? a.modalities?.[0]?.duration;
    const durMin = dur?.metric?.toLowerCase().startsWith("hour")
      ? Math.round((dur.value ?? 0) * 60)
      : dur?.metric?.toLowerCase().startsWith("day")
        ? Math.round((dur.value ?? 0) * 60 * 24)
        : dur?.value;
    const geo = activityGeo(a);
    const distanceKm =
      typeof query.latitude === "number" &&
      typeof query.longitude === "number" &&
      typeof geo?.latitude === "number" &&
      typeof geo?.longitude === "number"
        ? Math.round(
            haversineKm(query.latitude, query.longitude, geo.latitude, geo.longitude) * 10,
          ) / 10
        : undefined;
    const description = a.content?.description ? stripTags(a.content.description) : "";
    offers.push({
      id: `hb-${code}`,
      name,
      category: toCategory(a),
      durationMinutes: typeof durMin === "number" && durMin > 0 ? durMin : undefined,
      ...(fromPrice != null ? { fromPrice: Math.round(fromPrice) } : {}),
      currency: normalizeCurrency(a.currencyName ?? a.currency),
      distanceKm,
      // summary comes from the content description when present; the model
      // rewrites it into the reply language when authoring the block.
      summary: description ? description.slice(0, 140) : undefined,
    });
  }
  // cheapest first; price-less offers sort last
  offers.sort(
    (a, b) =>
      (a.fromPrice ?? Number.POSITIVE_INFINITY) -
      (b.fromPrice ?? Number.POSITIVE_INFINITY),
  );
  return offers;
}

type FetchResult = {
  offers: AttractionOffer[];
  status: number;
  bodyBytes: number;
  activityCount: number;
  mapped: number;
  firstKeys: string[];
  quotaHeaders: Record<string, string>;
  contentPrefetched: number;
};

/** Any quota/rate-limit-ish response headers — the docs document neither the
 *  daily-quota reset time nor quota headers, so we observe what's really sent. */
function quotaishHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (/quota|limit|remaining|reset|retry/i.test(k)) out[k] = v;
  });
  return out;
}

async function fetchActivities(query: AttractionQuery, key: string): Promise<FetchResult> {
  // Request shape per the docs + a working integration (2026-07-22 research):
  // the availability path carries the /availability suffix, the GPS filter is
  // EXACTLY {type,latitude,longitude} (Activities has NO radius/unit — the API
  // scopes by the containing destination), paxes is MANDATORY, filters cannot
  // mix gps with destination.
  const body = {
    filters: [
      {
        searchFilterItems: [
          {
            type: "gps",
            latitude: query.latitude,
            longitude: query.longitude,
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
    const res = await fetch(`${HOTELBEDS_BASE_URL}/activity-api/3.0/activities/availability`, {
      method: "POST",
      headers: activitiesHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const rawText = await res.text();
    if (!res.ok) {
      // Carry status + quota headers + body up so the trace records the real
      // HTTP failure (the mock:error trace logs this message verbatim).
      throw new Error(
        `Hotelbeds activities HTTP ${res.status} ${JSON.stringify(quotaishHeaders(res))}: ${rawText.slice(0, 300)}`,
      );
    }
    const data = JSON.parse(rawText) as { activities?: RawActivity[] };
    const rawActivities = Array.isArray(data.activities) ? data.activities : [];
    let offers: AttractionOffer[] = [];
    try {
      offers = mapActivities(rawActivities, query);
    } catch (mapErr) {
      console.error("mapActivities threw:", mapErr);
    }
    // TEMP: per-modality price summary for the first 3 activities — answers
    // the market-sanity question (private-group totals vs shared per-person
    // rates: the Zurich 225-vs-market finding). Remove once assessed.
    for (const a of rawActivities.slice(0, 3)) {
      const modalities = (a.modalities ?? []).slice(0, 6).map((m) => ({
        name: (m.name ?? "?").slice(0, 60),
        perPersonMin: amountsFromMin(m.amountsFrom),
        rateTotals: (m.rates ?? [])
          .flatMap((r) => r.rateDetails ?? [])
          .map((d) => d.totalAmount)
          .filter((t): t is number => typeof t === "number")
          .slice(0, 4),
      }));
      await logDiag("activity_price_shape", {
        code: a.code ?? a.activityCode,
        name: (typeof a.name === "string" ? a.name : a.content?.name)?.slice(0, 60),
        topAmountsFromMin: amountsFromMin(a.amountsFrom),
        modalities,
        mappedFromPrice: firstPrice(a),
      });
    }
    await cachePut(key, offers);
    // Batch-prefetch the stack's content (images/descriptions) in ONE call —
    // cards and the modal then read the permanent cache instead of firing a
    // live call each. Best-effort; the single-code fallback covers misses.
    const contentPrefetched = await prefetchActivityContent(
      offers.map((o) => o.id.slice(3)),
    );
    return {
      offers,
      status: res.status,
      bodyBytes: rawText.length,
      activityCount: rawActivities.length,
      mapped: offers.length,
      firstKeys: rawActivities[0] ? Object.keys(rawActivities[0]) : [],
      quotaHeaders: quotaishHeaders(res),
      contentPrefetched,
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
      quotaHeaders: r.quotaHeaders,
      contentPrefetched: r.contentPrefetched,
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
// Endpoint (confirmed against the docs): the MULTI request —
//   POST /activity-content-api/3.0/activities/  { language, codes:[{activityCode}] }
//   → { activitiesContent: [...] }
// One batched call fetches a whole card stack's content (the simple GET needs a
// modality code we don't track). src on each cached row marks how it was
// fetched ("batch" at search time | "single" fallback) for quota accounting.
export type ActivityContent = {
  images: string[]; // gallery-size URLs (XLARGE-preferred) — the modal
  thumbs?: string[]; // card-size URLs (LARGE2-preferred) — keeps mobile light
  description?: string;
  included?: string[]; // "what's included" — from featureGroups' included items
  excluded?: string[]; // featureGroups' excluded items (cached for later use)
  highlights?: string[]; // from the API's "highligths" (their spelling)
  src?: "batch" | "single";
  /** Content-shape version — bump when the mapper changes so previously cached
   *  rows (e.g. the image-less first generation) refetch ONCE. Mirrors the
   *  hotels CONTENT_VERSION pattern. */
  v?: number;
};
const ACTIVITY_CONTENT_VERSION = 3; // v3: structured media.images[].urls[] extraction

/** Pull image URLs out of the various shapes Hotelbeds content can use.
 *  Accepts absolute URLs under url/path/urls/resource/src/href (the Activities
 *  content commonly carries them under `resource` inside media image sizes),
 *  and image-file relative paths under the same keys (prefixed with the same
 *  photos host the hotels content uses). The unabridged media-shape diag
 *  confirms/refines this against reality. */
const URL_KEYS = new Set(["url", "path", "urls", "resource", "src", "href"]);
const ACTIVITY_PHOTO_BASE = "https://photos.hotelbeds.com/giata/";

function asImageUrl(val: string): string | null {
  if (/^https?:\/\//.test(val)) return val;
  if (/^\/\//.test(val)) return `https:${val}`;
  // relative image path ("act/123/photo.jpg") → same photos host as hotels
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(val) && !/\s/.test(val)) {
    return `${ACTIVITY_PHOTO_BASE}${val.replace(/^\//, "")}`;
  }
  return null;
}

function extractImages(node: unknown): string[] {
  const urls: string[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(o)) {
      if (URL_KEYS.has(k) && typeof val === "string") {
        const u = asImageUrl(val);
        if (u) urls.push(u);
      } else {
        walk(val); // arrays of size-variant objects included — recurse into all
      }
    }
  };
  walk(node);
  return [...new Set(urls)].slice(0, 12);
}

// ── Structured media extraction (shape confirmed from a live activity):
// media.images[] each { visualizationOrder, mimeType, language, urls[] };
// urls[] = one entry per SIZE VARIANT of the SAME image, each
// { dpi, height, width, resource (absolute URL), sizeType }. Pick ONE variant
// per image by sizeType preference so one photo never becomes six slides.
type MediaSizeUrl = { sizeType?: string; resource?: string };
type MediaImage = { visualizationOrder?: number; urls?: MediaSizeUrl[] };

const MODAL_SIZES = ["XLARGE", "LARGE2", "LARGE", "RAW", "MEDIUM"]; // gallery
const CARD_SIZES = ["LARGE2", "LARGE", "XLARGE", "RAW", "MEDIUM"]; // thumbs

export function extractActivityImages(media: unknown, sizePreference: string[]): string[] {
  const images = (media as { images?: MediaImage[] } | undefined)?.images;
  if (!Array.isArray(images)) return [];
  const sorted = [...images].sort(
    (a, b) => (a.visualizationOrder ?? 99) - (b.visualizationOrder ?? 99),
  );
  const out: string[] = [];
  for (const img of sorted) {
    const urls = Array.isArray(img.urls) ? img.urls : [];
    const valid = (u: MediaSizeUrl) =>
      typeof u.resource === "string" && /^https?:\/\//.test(u.resource);
    let pick: string | undefined;
    for (const size of sizePreference) {
      pick = urls.find((u) => u.sizeType === size && valid(u))?.resource;
      if (pick) break;
    }
    if (!pick) pick = urls.find(valid)?.resource; // any size beats no image
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out.slice(0, 12);
}

/** Collect display strings out of loosely-shaped API list items (strings or
 *  objects with name/description/text). Defensive; tags stripped. */
function collectStrings(node: unknown, cap: number): string[] {
  const out: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim() && out.length < cap) {
      const clean = stripTags(s);
      if (clean && !out.includes(clean)) out.push(clean);
    }
  };
  const walk = (v: unknown) => {
    if (out.length >= cap) return;
    if (typeof v === "string") return push(v);
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      push(o.description ?? o.name ?? o.text);
      // dig into nested group arrays (featureGroups → included → …)
      for (const val of Object.values(o)) if (Array.isArray(val)) walk(val);
    }
  };
  walk(node);
  return out;
}

/** Map one raw activitiesContent[] item to our ActivityContent. Images come
 *  from the structured media.images[].urls[] shape (one size variant per
 *  image); the generic walker over the media subtree is the fallback for any
 *  differently-shaped item. */
function mapActivityContentItem(item: Record<string, unknown>): ActivityContent {
  const gallery = extractActivityImages(item.media, MODAL_SIZES);
  const thumbs = extractActivityImages(item.media, CARD_SIZES);
  const content: ActivityContent = {
    images: gallery.length ? gallery : extractImages(item.media),
    ...(thumbs.length ? { thumbs } : {}),
    v: ACTIVITY_CONTENT_VERSION,
  };
  const nested = item.content as Record<string, unknown> | undefined;
  const description = (nested?.description ?? item.description) as string | undefined;
  if (typeof description === "string" && description.trim()) {
    content.description = stripTags(description);
  }
  // featureGroups carry ready-made included/excluded lists (Guide, Bike rental,
  // Train tickets…); "highligths" is the API's own spelling.
  const groups = item.featureGroups as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(groups)) {
    const included = collectStrings(groups.map((g) => g.included).filter(Boolean), 8);
    const excluded = collectStrings(groups.map((g) => g.excluded).filter(Boolean), 8);
    if (included.length) content.included = included;
    if (excluded.length) content.excluded = excluded;
  }
  const highlights = collectStrings(item.highligths ?? item.highlights, 6);
  if (highlights.length) content.highlights = highlights;
  return content;
}

/**
 * ONE multi-request Content call for any number of activity codes (the
 * documented batch form) → { code: content }. Instrumented like the hotels
 * path: activity_content_http on failure (status + quota headers + raw sample),
 * activity_content_fields on the first success (raw shape for mapping tuning).
 */
async function fetchActivityContentMulti(
  codes: string[],
): Promise<Record<string, ActivityContent>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HOTELBEDS_BASE_URL}/activity-content-api/3.0/activities/`, {
      method: "POST",
      headers: activitiesHeaders(),
      body: JSON.stringify({
        language: "en",
        codes: codes.map((activityCode) => ({ activityCode })),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const rawText = await res.text();
    if (!res.ok) {
      await logDiag("activity_content_http", {
        status: res.status,
        codes: codes.length,
        headers: quotaishHeaders(res),
        rawSample: rawText.slice(0, 500),
      });
      throw new Error(`Activity content failed: HTTP ${res.status}`);
    }
    const data = JSON.parse(rawText) as { activitiesContent?: Array<Record<string, unknown>> };
    const items = Array.isArray(data.activitiesContent) ? data.activitiesContent : [];
    if (items[0]) {
      await logDiag("activity_content_fields", {
        requested: codes.length,
        got: items.length,
        fields: Object.keys(items[0]),
        sample: JSON.stringify(items[0]).slice(0, 600),
      });
    }
    const byCode: Record<string, ActivityContent> = {};
    for (const item of items) {
      const code = (item.activityCode ?? item.code) as string | undefined;
      if (code) byCode[code] = mapActivityContentItem(item);
    }
    return byCode;
  } finally {
    clearTimeout(timer);
  }
}

/** Batch-prefetch a card stack's content in ONE quota call at search time and
 *  cache it permanently — cards/modal then read the cache (no per-card live
 *  calls). Best-effort: a failure just means the per-card fallback path runs. */
async function prefetchActivityContent(codes: string[]): Promise<number> {
  if (!codes.length) return 0;
  try {
    const byCode = await fetchActivityContentMulti(codes);
    const now = new Date().toISOString();
    const rows = Object.entries(byCode).map(([code, content]) => ({
      provider: "hotelbeds",
      code,
      content: { ...content, src: "batch" as const },
      created_at: now,
    }));
    if (rows.length) {
      await getSupabaseAdmin().from("attraction_content_cache").upsert(rows);
    }
    return rows.length;
  } catch (err) {
    console.error("Activity content prefetch failed:", err);
    return 0;
  }
}

// In-flight dedup: concurrent requests for the same code (card gallery + modal
// open within seconds) share ONE fetch instead of burning quota twice. Module-
// level, so it holds per warm serverless instance — exactly the same-user,
// same-interaction race it exists for.
const inflightContent = new Map<string, Promise<ActivityContent | null>>();

export async function hotelbedsActivityContent(code: string): Promise<ActivityContent | null> {
  // cache-first (permanent). A row from an older content shape (missing or
  // lower v — e.g. the image-less first generation) is a miss ONCE; the
  // refetched row carries the current version, so this can't loop.
  try {
    const { data } = await getSupabaseAdmin()
      .from("attraction_content_cache")
      .select("content")
      .eq("provider", "hotelbeds")
      .eq("code", code)
      .single();
    const cached = data?.content as ActivityContent | undefined;
    if (cached && cached.v === ACTIVITY_CONTENT_VERSION) return cached;
  } catch {
    /* miss → fetch */
  }
  const inflight = inflightContent.get(code);
  if (inflight) return inflight;
  const p = (async (): Promise<ActivityContent | null> => {
    try {
      activitiesHeaders();
      if ((await liveCallsToday()) >= DAILY_CALL_BUDGET) {
        await logDiag("attractions_quota_fallback", { path: "content", code });
        return null; // honest: content unavailable (the modal shows the note)
      }
      const content = (await fetchActivityContentMulti([code]))[code] ?? null;
      if (content) {
        await getSupabaseAdmin()
          .from("attraction_content_cache")
          .upsert({
            provider: "hotelbeds",
            code,
            content: { ...content, src: "single" as const },
            created_at: new Date().toISOString(),
          });
      }
      return content;
    } catch (err) {
      console.error("Hotelbeds activity content failed:", err);
      await logDiag("content_api_error", {
        provider: "hotelbeds-activity",
        code,
        message: String(err).slice(0, 300),
      });
      return null;
    } finally {
      inflightContent.delete(code);
    }
  })();
  inflightContent.set(code, p);
  return p;
}
