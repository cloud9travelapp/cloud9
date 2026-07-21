import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
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

async function ownedTripId(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<
  | { tripId: string; admin: ReturnType<typeof getSupabaseAdmin> }
  | { error: Response }
> {
  const session = await auth();
  if (!session?.user?.googleId) {
    return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("Supabase client init failed:", err);
    return {
      error: Response.json(
        { error: "Server misconfigured: Supabase environment variables are missing." },
        { status: 500 },
      ),
    };
  }
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("google_id", session.user.googleId)
    .single();
  if (!user) {
    return { error: Response.json({ error: "Could not load your profile" }, { status: 500 }) };
  }
  const { id } = await params;
  const { data: trip } = await admin
    .from("trips")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!trip) {
    return { error: Response.json({ error: "Trip not found" }, { status: 404 }) };
  }
  return { tripId: trip.id as string, admin };
}

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
  const own = await ownedTripId(request, ctx.params);
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
  const own = await ownedTripId(request, ctx.params);
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

  const { data: user } = await own.admin
    .from("trips")
    .select("user_id")
    .eq("id", own.tripId)
    .single();
  const { error } = await own.admin.from("trip_favorites").upsert(
    {
      user_id: (user as { user_id: string }).user_id,
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
  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const own = await ownedTripId(request, ctx.params);
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
