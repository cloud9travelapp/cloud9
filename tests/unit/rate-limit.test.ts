import { describe, it, expect } from "vitest";
import {
  RATE_LIMITS,
  decideLimit,
  limitMessage,
  minutesUntilHourWindowFrees,
  minutesUntilUtcMidnight,
  usdFromTokens,
} from "@/lib/chat/rate-limit";

const NOW = new Date("2026-07-30T14:30:00Z");
const OK = {
  now: NOW,
  tripTurns: 0,
  userTurnsHour: 0,
  userTurnsDay: 0,
  globalUsdToday: 0,
  oldestInHourWindow: null,
};

describe("usdFromTokens", () => {
  it("prices each bucket at its own rate, thinking included in output", () => {
    // 1M of each: 5 + 0.5 + 10 + 25
    expect(
      usdFromTokens({
        input: 1e6,
        cacheRead: 1e6,
        cacheWrite: 1e6,
        output: 1e6,
      }),
    ).toBeCloseTo(40.5, 6);
  });

  it("matches the measured ~$0.074 per turn shape", () => {
    // A representative cached turn: tiny uncached input, big cache read.
    const usd = usdFromTokens({
      input: 5,
      cacheRead: 20000,
      cacheWrite: 0,
      output: 2500,
    });
    expect(usd).toBeGreaterThan(0.05);
    expect(usd).toBeLessThan(0.12);
  });
});

describe("decideLimit — precedence", () => {
  it("allows a normal turn", () => {
    expect(decideLimit(OK)).toEqual({ allowed: true });
  });

  it("checks the GLOBAL breaker first — never blames the user for an outage", () => {
    const d = decideLimit({
      ...OK,
      globalUsdToday: RATE_LIMITS.globalUsdPerDay,
      userTurnsDay: RATE_LIMITS.userTurnsPerDay, // both tripped at once
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.scope).toBe("global_day");
  });

  it("day beats hour, hour beats trip", () => {
    const day = decideLimit({
      ...OK,
      userTurnsDay: RATE_LIMITS.userTurnsPerDay,
      userTurnsHour: RATE_LIMITS.userTurnsPerHour,
      tripTurns: RATE_LIMITS.tripTurns,
    });
    if (!day.allowed) expect(day.scope).toBe("user_day");

    const hour = decideLimit({
      ...OK,
      userTurnsHour: RATE_LIMITS.userTurnsPerHour,
      tripTurns: RATE_LIMITS.tripTurns,
    });
    if (!hour.allowed) expect(hour.scope).toBe("user_hour");
  });

  it("does not throttle below the observed p95 conversation (~23 turns)", () => {
    // A genuine long session must pass: throttling a real user is the worse failure.
    expect(
      decideLimit({ ...OK, tripTurns: 26, userTurnsHour: 26, userTurnsDay: 26 }),
    ).toEqual({ allowed: true });
  });

  it("trip cap suggests no wait — a new trip works immediately", () => {
    const d = decideLimit({ ...OK, tripTurns: RATE_LIMITS.tripTurns });
    if (!d.allowed) {
      expect(d.scope).toBe("trip");
      expect(d.retryAfterMin).toBe(0);
    }
  });
});

describe("window math", () => {
  it("counts minutes to the next UTC midnight", () => {
    expect(minutesUntilUtcMidnight(NOW)).toBe(570); // 09:30 left
  });

  it("frees an hour slot when the oldest message ages out", () => {
    const oldest = new Date("2026-07-30T14:00:00Z"); // 30 min ago
    expect(minutesUntilHourWindowFrees(NOW, oldest)).toBe(30);
  });

  it("falls back to a full hour when the oldest is unknown", () => {
    expect(minutesUntilHourWindowFrees(NOW, null)).toBe(60);
  });
});

describe("limitMessage", () => {
  it("the global breaker never says 'you' — the user did nothing", () => {
    const he = limitMessage("global_day", "he", 570);
    const en = limitMessage("global_day", "en", 570);
    expect(en.toLowerCase()).not.toContain("you've reached");
    expect(en).toContain("temporarily unavailable");
    expect(he).toContain("השירות");
    // and never leaks what it actually costs us
    expect(en + he).not.toMatch(/\$|USD|limit of/i);
  });

  it("personal limits confirm nothing is lost and give a concrete time", () => {
    expect(limitMessage("user_hour", "en", 12)).toContain("12 minutes");
    expect(limitMessage("user_hour", "he", 12)).toContain("12");
    expect(limitMessage("user_day", "en", 570)).toContain("saved");
    expect(limitMessage("user_day", "he", 570)).toContain("שמורה");
  });

  it("the trip cap points at the way forward, not at a wait", () => {
    expect(limitMessage("trip", "en", 0)).toContain("new trip");
    expect(limitMessage("trip", "he", 0)).toContain("טיול חדש");
  });
});
