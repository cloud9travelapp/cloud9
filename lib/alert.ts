import "server-only";
import { logDiag } from "@/lib/diag";

/**
 * Push an operational alert to a human. Best-effort: an alert that fails must
 * never break a request.
 *
 * WHY: the global spend breaker takes the app down for EVERYONE until UTC
 * midnight. A breaker nobody knows tripped is an outage that cannot be
 * responded to — which is worse than the spend it prevented. There is no
 * monitoring on this project yet, so this is the cheapest thing that actually
 * reaches a phone.
 *
 * SETUP (no account, no cost): pick a hard-to-guess topic name and set
 *   ALERT_WEBHOOK_URL = https://ntfy.sh/cloud9-alerts-<something-random>
 * in Vercel, then subscribe to that topic in the free ntfy app. Anyone who
 * guesses the topic can read the alerts, so keep it random and never put
 * secrets in an alert body.
 *
 * A Slack or Discord incoming webhook works too — both accept a plain POST;
 * this sends the message as BOTH a raw body and a {text} JSON field so the
 * common receivers all understand it without per-provider code.
 *
 * Unset ALERT_WEBHOOK_URL → no-op, and the diag row is still written, so the
 * breaker remains queryable even with no alerting configured.
 */
export async function sendAlert(
  title: string,
  body: string,
): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    await logDiag("alert_not_configured", { title, body: body.slice(0, 200) });
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Title: title.slice(0, 100), // ntfy reads this header
          Priority: "high",
        },
        body: JSON.stringify({ text: `${title}\n${body}` }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        await logDiag("alert_failed", { title, status: res.status });
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    await logDiag("alert_failed", { title, error: String(err).slice(0, 200) });
  }
}
