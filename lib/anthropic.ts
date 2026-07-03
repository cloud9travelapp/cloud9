import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** The Cloud9 Concierge model. `claude-sonnet-5` is the current Sonnet. */
export const CONCIERGE_MODEL = "claude-sonnet-5";

/** Cheap, fast model for tiny utility calls (e.g. naming a trip). */
export const NAMER_MODEL = "claude-haiku-4-5";

let cached: Anthropic | null = null;

/**
 * Server-only Anthropic client. Lazily constructed so a missing API key only
 * fails at request time (in the chat route), never at build time.
 */
export function getAnthropic(): Anthropic {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY env var.");
  }

  cached = new Anthropic({ apiKey });
  return cached;
}
