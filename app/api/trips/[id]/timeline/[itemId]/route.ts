import { ownedTrip } from "@/lib/api/owned-trip";
import { toTimelineItem } from "@/lib/timeline/repo";
import { isValidDate, isValidTime } from "@/lib/timeline/validate";
import {
  isTimelineCategory,
  isTimelineState,
} from "@/lib/timeline/types";

/**
 * Edit / delete one timeline item — including agent-sourced ones: the timeline
 * is the traveler's document, not the concierge's.
 *
 * Every query is scoped by BOTH item id and trip id on top of the ownedTrip()
 * gate, so an item id belonging to another trip resolves to nothing even for a
 * caller who legitimately owns some trip.
 */

const COLUMNS =
  "id, item_type, source, category, state, day_date, start_time, duration_min, sort_order, title, notes, lat, lng, item, client_ref, created_at";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const params = await ctx.params;
  const own = await ownedTrip(Promise.resolve({ id: params.id }));
  if ("error" in own) return own.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only the fields a traveler can actually change; a partial patch leaves the
  // rest untouched (state alone is the "mark as booked" path).
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return Response.json({ error: "Need a title" }, { status: 400 });
    patch.title = title.slice(0, 200);
  }
  if ("notes" in body) {
    patch.notes =
      typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim().slice(0, 2000)
        : null;
  }
  if ("date" in body) {
    if (body.date == null || body.date === "") {
      patch.day_date = null;
      // A time can't outlive its day.
      patch.start_time = null;
    } else if (typeof body.date === "string" && isValidDate(body.date)) {
      patch.day_date = body.date;
    } else {
      return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
  }
  if ("startTime" in body) {
    if (body.startTime == null || body.startTime === "") {
      patch.start_time = null;
    } else if (typeof body.startTime === "string" && isValidTime(body.startTime)) {
      patch.start_time = body.startTime;
    } else {
      return Response.json({ error: "startTime must be HH:MM" }, { status: 400 });
    }
  }
  if ("durationMin" in body) {
    if (body.durationMin == null) {
      patch.duration_min = null;
    } else {
      const n = Number(body.durationMin);
      if (!Number.isFinite(n) || n <= 0) {
        return Response.json(
          { error: "durationMin must be a positive number" },
          { status: 400 },
        );
      }
      patch.duration_min = Math.round(n);
    }
  }
  if ("category" in body) {
    if (!isTimelineCategory(body.category)) {
      return Response.json({ error: "Unknown category" }, { status: 400 });
    }
    patch.category = body.category;
  }
  if ("state" in body) {
    if (!isTimelineState(body.state)) {
      return Response.json({ error: "Unknown state" }, { status: 400 });
    }
    patch.state = body.state;
  }
  if ("sortOrder" in body && Number.isFinite(Number(body.sortOrder))) {
    patch.sort_order = Math.round(Number(body.sortOrder));
  }

  const { data, error } = await own.admin
    .from("trip_timeline_items")
    .update(patch)
    .eq("id", params.itemId)
    .eq("trip_id", own.tripId)
    .select(COLUMNS)
    .single();

  if (error || !data) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }
  return Response.json({
    item: toTimelineItem(data as Parameters<typeof toTimelineItem>[0]),
  });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const params = await ctx.params;
  const own = await ownedTrip(Promise.resolve({ id: params.id }));
  if ("error" in own) return own.error;

  const { error } = await own.admin
    .from("trip_timeline_items")
    .delete()
    .eq("id", params.itemId)
    .eq("trip_id", own.tripId);

  if (error) {
    console.error("Timeline delete failed:", error.message);
    return Response.json(
      { error: "Timeline is unavailable (migration pending?)" },
      { status: 503 },
    );
  }
  return Response.json({ ok: true });
}
