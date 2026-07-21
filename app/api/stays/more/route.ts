import { auth } from "@/auth";
import { peekStays } from "@/lib/stays/provider";
import { nextStayBatch } from "@/lib/stays/present";
import type { StayQuery } from "@/lib/stays/types";

/**
 * "Show more" for a stays card stack: the next batch from the SAME criteria,
 * drawn from the cached full result set — never a live provider call, never a
 * model call. The key is the compact query the chat route appended in its
 * <<MORE>> block; excludeIds accumulate client-side across replacements.
 * Honest responses: offers:[] = exhausted; expired:true = cache aged out.
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
    key = JSON.parse(typeof body.key === "string" ? body.key : "") as Record<
      string,
      unknown
    >;
  } catch {
    return Response.json({ error: "Invalid key" }, { status: 400 });
  }
  const query: StayQuery = {
    destination: typeof key.destination === "string" ? key.destination : "",
    checkIn: typeof key.checkIn === "string" ? key.checkIn : "",
    checkOut: typeof key.checkOut === "string" ? key.checkOut : "",
    guests: typeof key.guests === "number" ? key.guests : undefined,
    rooms: typeof key.rooms === "number" ? key.rooms : undefined,
    budgetLevel:
      key.budgetLevel === "budget" ||
      key.budgetLevel === "mid" ||
      key.budgetLevel === "luxury"
        ? key.budgetLevel
        : undefined,
    latitude: typeof key.latitude === "number" ? key.latitude : undefined,
    longitude: typeof key.longitude === "number" ? key.longitude : undefined,
  };
  if (
    !query.destination ||
    !/^\d{4}-\d{2}-\d{2}$/.test(query.checkIn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(query.checkOut)
  ) {
    return Response.json({ error: "Invalid key" }, { status: 400 });
  }
  const sortBy =
    key.sortBy === "price" || key.sortBy === "premium" || key.sortBy === "distance"
      ? key.sortBy
      : undefined;
  const minStars = key.minStars === 5 ? 5 : undefined;
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((x): x is string => typeof x === "string").slice(0, 200)
    : [];

  const pool = await peekStays(query);
  if (!pool) {
    return Response.json({ offers: [], remaining: 0, expired: true });
  }
  const { offers, remaining } = nextStayBatch(pool, {
    budgetLevel: query.budgetLevel,
    sortBy,
    minStars,
    excludeIds,
    batch: 5,
  });
  const mock = offers.length > 0 && offers.every((o) => o.id.startsWith("mock-"));
  return Response.json({ offers, remaining, mock, expired: false });
}
