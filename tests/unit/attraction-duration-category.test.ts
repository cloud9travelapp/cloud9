import { describe, it, expect } from "vitest";
import { durationMinutesFrom } from "@/lib/attractions/hotelbeds";

// Two user-visible bugs found from ONE cached Paris offer (2026-07-30):
// "Immersive Audio Walks Paris" carried durationMinutes 1440 (rendered "24h"
// on the card) and category "nightlife". Both came from deriving a value out of
// the wrong field while the right data was already in the response.

describe("durationMinutesFrom — show nothing rather than a wrong number", () => {
  it("converts hours, the one metric that genuinely means length", () => {
    expect(durationMinutesFrom({ value: 2, metric: "hours" })).toBe(120);
    expect(durationMinutesFrom({ value: 1, metric: "Hour" })).toBe(60);
    expect(durationMinutesFrom({ value: 2.5, metric: "hours" })).toBe(150);
  });

  it("accepts minutes as-is", () => {
    expect(durationMinutesFrom({ value: 90, metric: "minutes" })).toBe(90);
  });

  it("REJECTS a day metric — that is ticket validity, not duration", () => {
    // The exact shape behind the "24h" audio-walk card.
    expect(durationMinutesFrom({ value: 1, metric: "days" })).toBeUndefined();
    // Multi-day is equally unsafe: rendering "48h" for a 2-day trip is nonsense.
    expect(durationMinutesFrom({ value: 2, metric: "days" })).toBeUndefined();
  });

  it("REJECTS an unknown or absent metric — the unit would be a guess", () => {
    expect(durationMinutesFrom({ value: 3, metric: "segments" })).toBeUndefined();
    expect(durationMinutesFrom({ value: 3 })).toBeUndefined();
    expect(durationMinutesFrom(undefined)).toBeUndefined();
  });

  it("REJECTS non-positive and non-finite values", () => {
    expect(durationMinutesFrom({ value: 0, metric: "hours" })).toBeUndefined();
    expect(durationMinutesFrom({ value: -2, metric: "hours" })).toBeUndefined();
    expect(durationMinutesFrom({ value: NaN, metric: "hours" })).toBeUndefined();
  });
});
