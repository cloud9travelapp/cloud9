import { ownedTrip } from "@/lib/api/owned-trip";
import { logUserEvent } from "@/lib/analytics";
import {
  FAVORITE_ITEM_TYPES,
  providerFromOfferId,
  type FavoriteItemType,
  type TripFavorite,
} from "@/lib/favorites";

/**
 * Trip favorites (hearts): GET lists, POST hearts, DELETE unhearts.
 * Auth-gated + trip-ownership-checked like PATCH /api/trips/[id]. Degrades
 * gracefully while the trip_favorites migration is pending (GET → [],
 * POST/DELETE → 503 with a clear reason; the client reverts optimistically).
 */

type DbRow = {
  item_type: string;
  item_provider: string;
  item_code: string;
  item: Record<string, unknown>;
  created_at: string;
};

function toFavorite(row: DbRow): TripFavorite {
  return {
    itemType: row.item_type as FavoriteItemType,
    itemProvider: row.item_provider,
    itemCode: row.item_code,
    item: row.item,
    createdAt: row.created_at,
  };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;
  const { data, error } = await own.admin
    .from("trip_favorites")
    .select("item_type, item_provider, item_code, item, created_at")
    .eq("trip_id", own.tripId)
    .order("created_at", { ascending: false });
  if (error) {
    // Table not migrated yet (or transient) — hearts just aren't loaded.
    console.error("Favorites load failed:", error.message);
    return Response.json({ favorites: [] });
  }
  return Response.json({ favorites: ((data ?? []) as DbRow[]).map(toFavorite) });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;

  let body: { itemType?: unknown; item?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const itemType = FAVORITE_ITEM_TYPES.includes(body.itemType as FavoriteItemType)
    ? (body.itemType as FavoriteItemType)
    : null;
  const item =
    body.item && typeof body.item === "object" && !Array.isArray(body.item)
      ? (body.item as Record<string, unknown>)
      : null;
  const itemCode = item && typeof item.id === "string" ? item.id : null;
  if (!itemType || !item || !itemCode) {
    return Response.json(
      { error: "Need itemType and an item with an id" },
      { status: 400 },
    );
  }

  const { error } = await own.admin.from("trip_favorites").upsert(
    {
      // ownedTrip already resolved the owner — no second lookup needed.
      user_id: own.userId,
      trip_id: own.tripId,
      item_type: itemType,
      item_provider: providerFromOfferId(itemCode),
      item_code: itemCode,
      item,
    },
    { onConflict: "trip_id,item_type,item_provider,item_code" },
  );
  if (error) {
    console.error("Favorite save failed:", error.message);
    return Response.json(
      { error: "Favorites are unavailable (migration pending?)" },
      { status: 503 },
    );
  }

  // Hearts are the strongest taste signal we collect, so they are worth
  // counting. The upsert makes re-hearting idempotent in the table, but this
  // fires on every successful call — a repeat heart of the same item is rare
  // and harmless, and de-duplicating here would need a read we do not want.
  await logUserEvent("favorite_added", {
    userId: own.userId,
    tripId: own.tripId,
    payload: {
      itemType,
      provider: providerFromOfferId(itemCode),
      code: itemCode,
    },
  });
  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTrip(ctx.params);
  if ("error" in own) return own.error;
  const url = new URL(request.url);
  const itemType = url.searchParams.get("type") ?? "";
  const itemCode = url.searchParams.get("code") ?? "";
  if (!itemType || !itemCode) {
    return Response.json({ error: "Need type and code" }, { status: 400 });
  }
  const { error } = await own.admin
    .from("trip_favorites")
    .delete()
    .eq("trip_id", own.tripId)
    .eq("item_type", itemType)
    .eq("item_code", itemCode);
  if (error) {
    console.error("Favorite delete failed:", error.message);
    return Response.json(
      { error: "Favorites are unavailable (migration pending?)" },
      { status: 503 },
    );
  }
  return Response.json({ ok: true });
}
