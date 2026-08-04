import "server-only";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logDiag } from "@/lib/diag";

/**
 * Product analytics — login log + funnel events.
 *
 * BEST-EFFORT, ALWAYS. Every function here swallows its own errors. An
 * analytics write must never break a user action, and never delay one either:
 * these are awaited only where the caller is already doing I/O, and the caller
 * decides. Same contract as logDiag.
 *
 * A failed write is not silent — it lands in diag_events as analytics_failed, so
 * "the funnel looks empty" can be told apart from "nobody used it".
 */

/** The seven events that mark real intent. Free-form by design: user_events
 *  stores event_type as text, so adding one here needs no migration. */
export type UserEventType =
  | "trip_created"
  | "stay_search"
  | "attraction_search"
  | "flight_search"
  | "offer_selected"
  | "favorite_added"
  | "timeline_item_added";

/**
 * Record a funnel event.
 *
 * NEVER pass IP, user-agent, or message content in `payload`. Search CRITERIA
 * (destination, dates, party size, result counts) are the funnel and belong
 * here; what the traveler typed does not. The IP/user-agent asymmetry with
 * login_events is deliberate — see 0014_user_events.sql.
 */
export async function logUserEvent(
  eventType: UserEventType,
  opts: {
    userId: string;
    tripId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("user_events").insert({
      user_id: opts.userId,
      trip_id: opts.tripId ?? null,
      event_type: eventType,
      payload: opts.payload ?? {},
    });
    if (error) {
      await logDiag("analytics_failed", {
        table: "user_events",
        eventType,
        message: error.message.slice(0, 200),
      });
    }
  } catch (err) {
    await logDiag("analytics_failed", {
      table: "user_events",
      eventType,
      error: String(err).slice(0, 200),
    });
  }
}

/** First non-empty entry of x-forwarded-for (the client, before the proxies),
 *  falling back to x-real-ip. Returns null rather than a placeholder when there
 *  is nothing usable — the column is `inet` and would reject junk anyway, and a
 *  fake value is worse than an absent one. */
function clientIp(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  const candidate = (fwd?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  if (!candidate) return null;
  // Cheap sanity check only — Postgres does the real validation on `inet`.
  const looksLikeIp = /^[0-9a-fA-F:.]+$/.test(candidate) && candidate.length <= 45;
  return looksLikeIp ? candidate : null;
}

/**
 * Record a sign-in. IP and user-agent live HERE ONLY, justified by the security
 * purpose (account protection, unauthorised-access detection, diagnosing
 * sign-in failures) and capped at 12 months by the pg_cron purge.
 *
 * `is_first` marks the signup moment. It is derived from whether any earlier
 * row exists rather than from the users row, because that row is upserted on
 * EVERY sign-in and so cannot tell us whether this login is the first.
 */
export async function recordLogin(userId: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin();

    const { count, error: countError } = await admin
      .from("login_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    // On a counting error, record the login but do not claim it is the first —
    // a wrong signup date is worse than an absent flag.
    const isFirst = !countError && (count ?? 0) === 0;

    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = clientIp(h);
      userAgent = (h.get("user-agent") ?? "").slice(0, 400) || null;
    } catch {
      // headers() is unavailable outside a request scope; the login is still
      // worth recording without them.
    }

    const { error } = await admin.from("login_events").insert({
      user_id: userId,
      ip,
      user_agent: userAgent,
      is_first: isFirst,
    });
    if (error) {
      await logDiag("analytics_failed", {
        table: "login_events",
        message: error.message.slice(0, 200),
      });
    }
  } catch (err) {
    await logDiag("analytics_failed", {
      table: "login_events",
      error: String(err).slice(0, 200),
    });
  }
}
