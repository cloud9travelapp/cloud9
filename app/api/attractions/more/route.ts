import { auth } from "@/auth";
import { peekAttractions } from "@/lib/attractions/provider";
import { nextAttractionBatch } from "@/lib/attractions/present";
import type { AttractionQuery } from "@/lib/attractions/types";

/**
 * "Show more" for an attractions card stack: the next batch from the SAME
 * criteria, drawn from the cached full result set — never a live provider call,
 * never a model call. The key is the compact query the chat route appended in
 * its <<MORE>> block; excludeIds accumulate client-side across replacements.
 * Honest responses: offers:[] = exhausted; expired:true = cache aged out.
 * Mirrors /api/stays/more.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { key?: unknown; excludeIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let key: Record<string, unknown>;
  try {
    key = JSON.parse(typeof body.key === "string" ? body.key : "") as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid key" }, { status: 400 });
  }

  const CATS = ["tours", "museums", "outdoors", "food", "nightlife", "family", "water", "culture", "adventure", "wellness"];
  const query: AttractionQuery = {
    destination: typeof key.destination === "string" ? key.destination : "",
    from: typeof key.from === "string" ? key.from : "",
    to: typeof key.to === "string" ? key.to : "",
    latitude: typeof key.latitude === "number" ? key.latitude : undefined,
    longitude: typeof key.longitude === "number" ? key.longitude : undefined,
    category: CATS.includes(String(key.category))
      ? (key.category as AttractionQuery["category"])
      : undefined,
    priceLevel:
      key.priceLevel === "budget" || key.priceLevel === "mid" || key.priceLevel === "premium"
        ? key.priceLevel
        : undefined,
  };
  if (
    !query.destination ||
    !/^\d{4}-\d{2}-\d{2}$/.test(query.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(query.to)
  ) {
    return Response.json({ error: "Invalid key" }, { status: 400 });
  }
  const sortBy =
    key.sortBy === "price" || key.sortBy === "distance" || key.sortBy === "duration"
      ? key.sortBy
      : undefined;
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((x): x is string => typeof x === "string").slice(0, 200)
    : [];

  const pool = await peekAttractions(query);
  if (!pool) {
    return Response.json({ offers: [], remaining: 0, expired: true });
  }
  const { offers, remaining } = nextAttractionBatch(pool, {
    priceLevel: query.priceLevel,
    sortBy,
    excludeIds,
    batch: 5,
  });
  const mock = offers.length > 0 && offers.every((o) => o.id.startsWith("mock-"));
  return Response.json({ offers, remaining, mock, expired: false });
}
