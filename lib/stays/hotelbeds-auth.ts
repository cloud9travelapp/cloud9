import "server-only";
import { createHash } from "node:crypto";

/** Shared APItude auth for the Booking and Content clients. */

export const HOTELBEDS_BASE_URL =
  process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com";

/** Request headers for ANY APItude product: Api-key + SHA-256(apiKey + secret +
 *  unix-seconds) signature. The scheme is identical across Hotels / Activities /
 *  Transfers — only the key/secret differ (Hotelbeds issues one per product).
 *  Throws when the keys are missing (callers surface a graceful error). */
export function hotelbedsHeadersFor(
  apiKey: string | undefined,
  secret: string | undefined,
  envLabel: string,
): Record<string, string> {
  if (!apiKey || !secret) {
    throw new Error(`Missing ${envLabel} env vars.`);
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

/** Hotels APItude auth (HOTELBEDS_API_KEY / HOTELBEDS_SECRET). */
export function hotelbedsHeaders(): Record<string, string> {
  return hotelbedsHeadersFor(
    process.env.HOTELBEDS_API_KEY,
    process.env.HOTELBEDS_SECRET,
    "HOTELBEDS_API_KEY / HOTELBEDS_SECRET",
  );
}

/** Activities APItude auth — a SEPARATE key/secret + its own 50/day quota. */
export function activitiesHeaders(): Record<string, string> {
  return hotelbedsHeadersFor(
    process.env.HOTELBEDS_ACTIVITIES_API_KEY,
    process.env.HOTELBEDS_ACTIVITIES_SECRET,
    "HOTELBEDS_ACTIVITIES_API_KEY / HOTELBEDS_ACTIVITIES_SECRET",
  );
}
