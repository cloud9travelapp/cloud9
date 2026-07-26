import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ownedTrip } from "@/lib/api/owned-trip";
import { logDiag } from "@/lib/diag";

/** Rows a delete would take with it — shown in the confirmation so a
 *  destructive action is never silent about its blast radius. */
async function tripCounts(
  admin: ReturnType<typeof getSupabaseAdmin>,
  tripId: string,
): Promise<{ messages: number; favorites: number; timelineItems: number }> {
  const count = async (table: string) => {
    try {
      const { count: n, error } = await admin
        .from(table)
        .select("trip_id", { count: "exact", head: true })
        .eq("trip_id", tripId);
      return error ? 0 : (n ?? 0);
    } catch {
      // Table not migrated yet — report 0 rather than blocking the delete.
      return 0;
    }
  };
  const [messages, favorites, timelineItems] = await Promise.all([
    count("chat_messages"),
    count("trip_favorites"),
    count("trip_timeline_items"),
  ]);
  return { messages, favorites, timelineItems };
}

/** Counts for the delete confirmation. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;
  return Response.json(await tripCounts(own.admin, own.tripId));
}

/**
 * Delete a trip and everything hanging off it.
 *
 * Children are deleted EXPLICITLY rather than trusting FK cascades: several of
 * these tables were handed over as ad-hoc SQL, so their FK definitions aren't
 * guaranteed to match the migration files. Deleting the trip last means a
 * partial failure leaves the trip reachable instead of orphaning its rows.
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;

  const counts = await tripCounts(own.admin, own.tripId);

  for (const table of [
    "trip_timeline_items",
    "trip_favorites",
    "chat_messages",
  ]) {
    try {
      const { error } = await own.admin
        .from(table)
        .delete()
        .eq("trip_id", own.tripId);
      // A missing table is fine (nothing to delete); a real failure is not.
      if (error && error.code !== "42P01") {
        console.error(`Trip delete failed on ${table}:`, error.message);
        await logDiag("trip_delete_error", {
          trip: own.tripId,
          table,
          message: error.message.slice(0, 200),
        });
        return Response.json(
          { error: "Could not delete the trip" },
          { status: 500 },
        );
      }
    } catch {
      /* table absent — continue */
    }
  }

  const { error } = await own.admin
    .from("trips")
    .delete()
    .eq("id", own.tripId)
    .eq("user_id", own.userId);
  if (error) {
    console.error("Trip delete failed:", error.message);
    await logDiag("trip_delete_error", {
      trip: own.tripId,
      table: "trips",
      message: error.message.slice(0, 200),
    });
    return Response.json({ error: "Could not delete the trip" }, { status: 500 });
  }

  // Deletion is irreversible — leave a trace so an accidental mass delete is
  // reconstructable from diag_events rather than a mystery.
  await logDiag("trip_deleted", { trip: own.tripId, ...counts });
  return Response.json({ ok: true, ...counts });
}

/**
 * Rename a trip to a custom title (e.g. "Yoav's bachelor party").
 * Auth-gated and ownership-checked; the auto-namer never overwrites a custom
 * name because it only fires while a trip is still called "New Trip".
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return Response.json(
      { error: "Name must be 1-60 characters" },
      { status: 400 },
    );
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("Supabase client init failed:", err);
    return Response.json(
      { error: "Server misconfigured: Supabase environment variables are missing." },
      { status: 500 },
    );
  }

  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("google_id", session.user.googleId)
    .single();
  if (!user) {
    return Response.json({ error: "Could not load your profile" }, { status: 500 });
  }

  const { id } = await params;
  // name_is_custom locks the title against the auto-namer. If the column
  // isn't migrated yet, fall back to a plain rename so the feature still works.
  let result = await admin
    .from("trips")
    .update({
      name,
      name_is_custom: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name")
    .single();
  if (result.error) {
    result = await admin
      .from("trips")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, name")
      .single();
  }
  if (result.error || !result.data) {
    return Response.json({ error: "Trip not found" }, { status: 404 });
  }
  return Response.json({ id: result.data.id, name: result.data.name });
}
