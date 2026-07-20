import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Best-effort runtime diagnostics → Supabase `diag_events`. Vercel's runtime
 * log retention is too short to hunt, so important events self-report and
 * diagnosis becomes one SQL query:
 *
 *   select at, kind, detail from diag_events order by at desc limit 20;
 *
 * Never throws; also mirrors to console for the (short) live log window.
 * Degrades to console-only until the table is migrated.
 */
export async function logDiag(
  kind: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    console.log(`diag: ${kind}`, JSON.stringify(detail).slice(0, 300));
    await getSupabaseAdmin().from("diag_events").insert({ kind, detail });
  } catch {
    /* best-effort — diagnostics must never break the request */
  }
}
