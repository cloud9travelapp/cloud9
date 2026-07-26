import { ownedTrip } from "@/lib/api/owned-trip";
import { insertTimelineItem, listTimelineItems } from "@/lib/timeline/repo";
import { parseTimelineDraft } from "@/lib/timeline/validate";

/**
 * The trip timeline ("המסע"): GET lists, POST adds one item.
 *
 * Auth-gated + trip-ownership-checked through the shared ownedTrip() gate —
 * our service-role key bypasses RLS, so that check is the only protection.
 * Reads degrade to an empty timeline (a trip view must never break because a
 * table is unavailable); writes report 503 so the client can show the item as
 * unsaved rather than pretending it landed.
 */

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;
  const items = await listTimelineItems(own.admin, own.tripId);
  return Response.json({ items });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseTimelineDraft(body, { source: "manual" });
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const result = await insertTimelineItem(
    own.admin,
    { tripId: own.tripId, userId: own.userId },
    parsed.draft,
  );
  if (!result.ok) {
    return Response.json(
      { error: "Timeline is unavailable (migration pending?)" },
      { status: 503 },
    );
  }
  return Response.json({ item: result.item, deduped: result.deduped });
}
