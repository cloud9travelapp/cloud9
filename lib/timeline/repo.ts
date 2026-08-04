import "server-only";
import type { getSupabaseAdmin } from "@/lib/supabase";
import { logUserEvent } from "@/lib/analytics";
import {
  isTimelineCategory,
  isTimelineSource,
  isTimelineState,
  type TimelineDraft,
  type TimelineItem,
} from "./types";

// The ONE write path into trip_timeline_items. Three entry points use it — the
// REST route (manual add / edit), the chat route (a selection riding along with
// the message), and the concierge's add-item tool — so validation, idempotency
// and row shape can't drift between them.

type Admin = ReturnType<typeof getSupabaseAdmin>;

type DbRow = {
  id: string;
  item_type: string;
  source: string;
  category: string;
  state: string;
  day_date: string | null;
  start_time: string | null;
  duration_min: number | null;
  sort_order: number;
  title: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  item: Record<string, unknown> | null;
  client_ref: string | null;
  created_at: string;
};

const COLUMNS =
  "id, item_type, source, category, state, day_date, start_time, duration_min, sort_order, title, notes, lat, lng, item, client_ref, created_at";

export function toTimelineItem(row: DbRow): TimelineItem {
  return {
    id: row.id,
    itemType: row.item_type,
    source: isTimelineSource(row.source) ? row.source : "manual",
    category: isTimelineCategory(row.category) ? row.category : "other",
    state: isTimelineState(row.state) ? row.state : "planned",
    date: row.day_date,
    // Postgres `time` comes back as "HH:MM:SS"; the UI speaks "HH:MM".
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    durationMin: row.duration_min,
    sortOrder: row.sort_order,
    title: row.title,
    notes: row.notes,
    lat: row.lat,
    lng: row.lng,
    item: row.item,
    clientRef: row.client_ref,
    createdAt: row.created_at,
  };
}

/** Reads degrade to an empty timeline rather than breaking the trip view. */
export async function listTimelineItems(
  admin: Admin,
  tripId: string,
): Promise<TimelineItem[]> {
  const { data, error } = await admin
    .from("trip_timeline_items")
    .select(COLUMNS)
    .eq("trip_id", tripId)
    .order("day_date", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Timeline load failed:", error.message);
    return [];
  }
  return ((data ?? []) as DbRow[]).map(toTimelineItem);
}

export type InsertResult =
  | { ok: true; item: TimelineItem; deduped: boolean }
  | { ok: false; reason: string };

/**
 * Insert one item, idempotently on clientRef.
 *
 * A selection writes the chat message and the timeline row in the SAME request,
 * so a retry after a failure replays both — without this, the second attempt
 * would duplicate the item. The partial unique index on (trip_id, client_ref)
 * is the real guarantee; a 23505 here means "someone already wrote it", which
 * is success, not failure.
 */
export async function insertTimelineItem(
  admin: Admin,
  ctx: { tripId: string; userId: string },
  draft: TimelineDraft,
): Promise<InsertResult> {
  const row = {
    trip_id: ctx.tripId,
    user_id: ctx.userId,
    item_type: draft.itemType,
    source: draft.source,
    category: draft.category,
    state: draft.state,
    day_date: draft.date,
    start_time: draft.startTime,
    duration_min: draft.durationMin,
    title: draft.title.slice(0, 200),
    notes: draft.notes ? draft.notes.slice(0, 2000) : null,
    lat: draft.lat,
    lng: draft.lng,
    item: draft.item,
    client_ref: draft.clientRef,
  };

  const { data, error } = await admin
    .from("trip_timeline_items")
    .insert(row)
    .select(COLUMNS)
    .single();

  if (!error && data) {
    // Emitted HERE, inside the one write path, so BOTH callers (the REST route
    // and the chat piggyback) report it by construction — the symmetric
    // observability rule, enforced structurally rather than by remembering to
    // add a line at each call site. Deliberately NOT emitted on the deduped
    // branch below: a retry of the same user action is one action, and counting
    // it twice would inflate the funnel.
    await logUserEvent("timeline_item_added", {
      userId: ctx.userId,
      tripId: ctx.tripId,
      payload: {
        itemType: draft.itemType,
        source: draft.source,
        category: draft.category,
        state: draft.state,
      },
    });
    return { ok: true, item: toTimelineItem(data as DbRow), deduped: false };
  }

  // Unique violation on client_ref: this exact user action already landed.
  if (error?.code === "23505" && draft.clientRef) {
    const { data: existing } = await admin
      .from("trip_timeline_items")
      .select(COLUMNS)
      .eq("trip_id", ctx.tripId)
      .eq("client_ref", draft.clientRef)
      .single();
    if (existing) {
      return { ok: true, item: toTimelineItem(existing as DbRow), deduped: true };
    }
  }

  console.error("Timeline insert failed:", error?.message);
  return { ok: false, reason: error?.message ?? "unknown" };
}
