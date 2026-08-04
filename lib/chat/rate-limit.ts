// Rate limiting for /api/chat — PURE logic (window math, thresholds, copy).
// The route does the counting; everything decidable without I/O lives here so
// it is unit-testable.
//
// WHY THIS EXISTS: a conversation costs real money. Measured 2026-07-30 over 5
// conversations (thinking tokens included): median $0.93, p95 $1.73, worst
// $1.76, 13.2 turns average and 26 at most — about $0.074 per turn. The endpoint
// is auth-gated but was otherwise unthrottled, so one looping or abusive account
// could run up an unbounded bill.
//
// THESE NUMBERS COME FROM n=5 OF MAX'S OWN TESTING. They are a starting point
// sized to today, NOT validated limits. Revisit once strangers are using the
// app — the chat_rate_limited diag is the evidence base for doing so.

/** Anthropic pricing for the concierge model, USD per million tokens.
 *  Cache WRITES are 2x base because both breakpoints use ttl:"1h"; cache READS
 *  are 0.1x. Keep in sync with the model choice in the chat route. */
export const PRICE_PER_MTOK = {
  input: 5.0,
  cacheRead: 0.5,
  cacheWrite: 10.0,
  output: 25.0, // adaptive thinking bills here too
} as const;

export const RATE_LIMITS = {
  /** One runaway conversation. 3.8x the longest real one observed (26 turns). */
  tripTurns: 100,
  /** ~3 median conversations inside an hour. Deliberately above the p95
   *  conversation (~23 turns) — throttling a genuine user is the worse failure. */
  // TEMP-LIVE-TEST 2026-07-30 — real value is 40. RESTORE IMMEDIATELY AFTER.
  userTurnsPerHour: 2,
  /** ~11 median conversations in a day; bounds one bad account to ~$11. */
  userTurnsPerDay: 150,
  /** THE ONLY LIMIT THAT ACTUALLY CAPS THE BILL. Per-user caps assume the
   *  attacker uses one account, and Google sign-in is friction, not prevention.
   *  Sized to what a legitimate day costs TODAY (Max's heaviest testing day is
   *  nowhere near $20), not to a comfortable future — raise it deliberately when
   *  real usage justifies it, never quietly. */
  globalUsdPerDay: 20,
} as const;

export type LimitScope = "trip" | "user_hour" | "user_day" | "global_day";

export type LimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      scope: LimitScope;
      count: number;
      limit: number;
      retryAfterMin: number;
    };

export type UsageTokens = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
};

/** USD for a token bundle. Used for the global breaker and for reporting. */
export function usdFromTokens(t: UsageTokens): number {
  return (
    (t.input * PRICE_PER_MTOK.input +
      t.cacheRead * PRICE_PER_MTOK.cacheRead +
      t.cacheWrite * PRICE_PER_MTOK.cacheWrite +
      t.output * PRICE_PER_MTOK.output) /
    1_000_000
  );
}

/** Minutes until the next UTC midnight — when the CALENDAR-day windows reset.
 *  Calendar rather than rolling so the user-facing promise ("tomorrow") is
 *  true and the breaker's reset is predictable. Note this is UTC: for Israel
 *  (UTC+3) the reset lands at 03:00 local. */
export function minutesUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 60000));
}

/** Minutes until the rolling hour window frees a slot, from the oldest message
 *  still inside it. Unknown oldest → a full hour (conservative but honest). */
export function minutesUntilHourWindowFrees(
  now: Date,
  oldestInWindow: Date | null,
): number {
  if (!oldestInWindow) return 60;
  const freesAt = oldestInWindow.getTime() + 60 * 60 * 1000;
  return Math.max(1, Math.ceil((freesAt - now.getTime()) / 60000));
}

/**
 * The decision. Order matters: the GLOBAL breaker is checked first, because
 * when it trips the service is down for everyone and that fact outranks any
 * personal limit — telling a user "you've hit your limit" when actually the
 * whole app is capped would be a lie.
 */
export function decideLimit(input: {
  now: Date;
  tripTurns: number;
  userTurnsHour: number;
  userTurnsDay: number;
  globalUsdToday: number;
  oldestInHourWindow: Date | null;
}): LimitDecision {
  const {
    now,
    tripTurns,
    userTurnsHour,
    userTurnsDay,
    globalUsdToday,
    oldestInHourWindow,
  } = input;

  if (globalUsdToday >= RATE_LIMITS.globalUsdPerDay) {
    return {
      allowed: false,
      scope: "global_day",
      count: Math.round(globalUsdToday * 100) / 100,
      limit: RATE_LIMITS.globalUsdPerDay,
      retryAfterMin: minutesUntilUtcMidnight(now),
    };
  }
  if (userTurnsDay >= RATE_LIMITS.userTurnsPerDay) {
    return {
      allowed: false,
      scope: "user_day",
      count: userTurnsDay,
      limit: RATE_LIMITS.userTurnsPerDay,
      retryAfterMin: minutesUntilUtcMidnight(now),
    };
  }
  if (userTurnsHour >= RATE_LIMITS.userTurnsPerHour) {
    return {
      allowed: false,
      scope: "user_hour",
      count: userTurnsHour,
      limit: RATE_LIMITS.userTurnsPerHour,
      retryAfterMin: minutesUntilHourWindowFrees(now, oldestInHourWindow),
    };
  }
  if (tripTurns >= RATE_LIMITS.tripTurns) {
    return {
      allowed: false,
      scope: "trip",
      count: tripTurns,
      limit: RATE_LIMITS.tripTurns,
      retryAfterMin: 0, // a new trip works immediately; waiting does not help
    };
  }
  return { allowed: true };
}

/**
 * User-facing copy. Language is the route's COMPUTED lang, never model-inferred.
 *
 * Two rules:
 *  - A personal limit says "you", states that nothing is lost, and gives a
 *    concrete time. It never implies wrongdoing.
 *  - The GLOBAL breaker must NOT say "you" — the user did nothing. It is a
 *    service-capacity message, and it never mentions cost or limits we would
 *    not want a stranger reading.
 */
export function limitMessage(
  scope: LimitScope,
  lang: "he" | "en",
  retryAfterMin: number,
): string {
  const he = lang === "he";
  switch (scope) {
    case "global_day":
      return he
        ? "השירות עמוס כרגע ואינו זמין לרגע. השיחה שלך שמורה — כדאי לנסות שוב מאוחר יותר."
        : "The service is temporarily unavailable. Your conversation is saved — please try again later.";
    case "user_day":
      return he
        ? "הגעת למגבלת השימוש היומית. השיחה שלך שמורה ואפשר להמשיך מחר."
        : "You've reached today's usage limit. Your conversation is saved — you can continue tomorrow.";
    case "user_hour":
      return he
        ? `הגעת למגבלת השימוש לשעה. השיחה שלך שמורה — אפשר להמשיך בעוד כ-${retryAfterMin} דקות.`
        : `You've reached the hourly usage limit. Your conversation is saved — you can continue in about ${retryAfterMin} minutes.`;
    case "trip":
      return he
        ? "השיחה הזאת הגיעה לאורך המרבי. אפשר לפתוח טיול חדש ולהמשיך שם — כל מה שכאן נשמר."
        : "This conversation has reached its maximum length. Start a new trip to continue — everything here is saved.";
  }
}
