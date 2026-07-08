import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

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
