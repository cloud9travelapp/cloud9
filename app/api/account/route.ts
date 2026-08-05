import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logDiag } from "@/lib/diag";

/**
 * Account deletion — the right to erasure, self-serve.
 *
 * GET  returns the blast radius (live counts) for the confirmation dialog.
 * DELETE erases the account IMMEDIATELY and irreversibly.
 *
 * NO GRACE PERIOD (Max's decision, 2026-08-04). Soft deletion with a declared
 * cooling-off window is a legitimate pattern — Facebook holds 30 days, Microsoft
 * 30 then deletes irreversibly — but it is only legitimate when the window is
 * DECLARED and genuinely ends in deletion, and it needs suspension, restoration
 * and scheduled-deletion machinery. Trip planning is not an account where losing
 * years of content is traumatic, so: you pressed it, it is gone. Simple to
 * explain, simple to build, and impossible to get subtly wrong.
 *
 * What it does NOT do is the thing that was happening by accident before: mark
 * an account deleted while the identity quietly comes back. See the upsert →
 * select change in app/api/chat/route.ts.
 */

/** Counts for the confirmation dialog. Naming the real blast radius beats a
 *  generic "all your data" — the decision should be informed. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: user } = await admin
    .from("users")
    .select("id, email")
    .eq("google_id", session.user.googleId)
    .single();

  if (!user) {
    // No row for a valid session = the account is already gone.
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const counted = async (table: string) => {
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    return count ?? 0;
  };

  const [trips, messages, favorites, timelineItems] = await Promise.all([
    counted("trips"),
    counted("chat_messages"),
    counted("trip_favorites"),
    counted("trip_timeline_items"),
  ]);

  // The email is returned so the dialog can require typing it. It is the user's
  // own address, already visible to them, and it makes the gate language-neutral
  // and immune to muscle memory in a way "type DELETE" is not.
  return Response.json({
    email: user.email,
    trips,
    messages,
    favorites,
    timelineItems,
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.googleId) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("google_id", session.user.googleId)
    .single();

  if (!user) {
    // Already deleted — idempotent, so a double-tap or a retry is a success.
    return Response.json({ ok: true, alreadyGone: true });
  }

  // Counts BEFORE the delete, for the (identifier-free) audit row below.
  const counted = async (table: string) => {
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    return count ?? 0;
  };
  const [trips, messages, favorites, timelineItems] = await Promise.all([
    counted("trips"),
    counted("chat_messages"),
    counted("trip_favorites"),
    counted("trip_timeline_items"),
  ]);

  // hotel_reviews FIRST, and this is not defensive noise: it is the ONE table
  // whose foreign keys are not `on delete cascade` (see 0011_hotel_reviews.sql,
  // where the shape was transcribed faithfully from production rather than
  // "improved"). Without this, deleting a user who has written a review fails
  // outright with a foreign-key violation. The table is empty today, so this has
  // never fired — it will the moment reviews ship.
  //
  // Whether a verified review should be DELETED or ANONYMISED on erasure is
  // Question 7 to counsel; the answer decides whether that FK becomes `cascade`
  // or `set null`. Until then, deleting is the choice that honours the request.
  const { error: reviewError } = await admin
    .from("hotel_reviews")
    .delete()
    .eq("user_id", user.id);
  if (reviewError) {
    await logDiag("account_delete_failed", {
      stage: "hotel_reviews",
      message: reviewError.message.slice(0, 200),
    });
    return Response.json({ error: "Could not delete account" }, { status: 500 });
  }

  // The cascade does the rest: trips, chat_messages, trip_favorites,
  // trip_timeline_items, login_events, user_events.
  const { error } = await admin.from("users").delete().eq("id", user.id);
  if (error) {
    await logDiag("account_delete_failed", {
      stage: "users",
      message: error.message.slice(0, 200),
    });
    return Response.json({ error: "Could not delete account" }, { status: 500 });
  }

  // Audit row with NO identifier — deliberately. diag_events has no FK, so it
  // survives the cascade; putting a user id or email in it would retain data
  // about someone who just asked to be erased. It exists to prove deletions
  // happen and to notice a spike, nothing more.
  await logDiag("account_deleted", { trips, messages, favorites, timelineItems });

  return Response.json({ ok: true });
}
