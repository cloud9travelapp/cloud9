import "server-only";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * THE ownership gate for every trip-scoped route.
 *
 * Our Supabase client uses the service-role key, which BYPASSES RLS — so this
 * check is the only thing standing between a caller and someone else's trip.
 * It lives in one audited place on purpose: a route that forgets it, or writes
 * a subtly different version of it, is a data-leak bug.
 *
 * Ownership is a compound filter (`.eq("id").eq("user_id")`), never a
 * fetch-then-compare, and a trip owned by someone else is reported as 404 —
 * indistinguishable from one that doesn't exist, so ids can't be probed.
 */
export type OwnedTrip = {
  tripId: string;
  /** users.id — denormalize onto child rows without a second query. */
  userId: string;
  admin: ReturnType<typeof getSupabaseAdmin>;
};

export async function ownedTrip(
  params: Promise<{ id: string }>,
): Promise<OwnedTrip | { error: Response }> {
  const session = await auth();
  if (!session?.user?.googleId) {
    return {
      error: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("Supabase client init failed:", err);
    return {
      error: Response.json(
        {
          error:
            "Server misconfigured: Supabase environment variables are missing.",
        },
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
    return {
      error: Response.json(
        { error: "Could not load your profile" },
        { status: 500 },
      ),
    };
  }

  const { id } = await params;
  const { data: trip } = await admin
    .from("trips")
    .select("id")
    .eq("id", id)
    .eq("user_id", (user as { id: string }).id)
    .single();
  if (!trip) {
    return { error: Response.json({ error: "Trip not found" }, { status: 404 }) };
  }

  return {
    tripId: (trip as { id: string }).id,
    userId: (user as { id: string }).id,
    admin,
  };
}
