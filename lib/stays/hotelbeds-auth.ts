import "server-only";
import { createHash } from "node:crypto";

/** Shared APItude auth for the Booking and Content clients. */

export const HOTELBEDS_BASE_URL =
  process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com";

/** Request headers: Api-key + SHA-256(apiKey+secret+unix-seconds) signature.
 *  Throws when the keys are missing (callers surface a graceful error). */
export function hotelbedsHeaders(): Record<string, string> {
  const apiKey = process.env.HOTELBEDS_API_KEY;
  const secret = process.env.HOTELBEDS_SECRET;
  if (!apiKey || !secret) {
    throw new Error("Missing HOTELBEDS_API_KEY / HOTELBEDS_SECRET env vars.");
  }
  const signature = createHash("sha256")
    .update(`${apiKey}${secret}${Math.floor(Date.now() / 1000)}`)
    .digest("hex");
  return {
    "Api-key": apiKey,
    "X-Signature": signature,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
