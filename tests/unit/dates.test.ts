import { describe, expect, it } from "vitest";
import { dmy, isoDay, nightsBetween } from "@/lib/chat/dates";

describe("nightsBetween", () => {
  it("counts whole nights", () => {
    expect(nightsBetween("2026-07-15", "2026-07-22")).toBe(7);
    expect(nightsBetween("2026-07-15", "2026-07-16")).toBe(1);
    expect(nightsBetween("2026-07-15", "2026-08-15")).toBe(31);
  });
  it("crosses year boundaries", () => {
    expect(nightsBetween("2026-12-28", "2027-01-14")).toBe(17);
  });
  it("returns 0 for reversed, equal, or invalid ranges", () => {
    expect(nightsBetween("2026-07-22", "2026-07-15")).toBe(0);
    expect(nightsBetween("2026-07-15", "2026-07-15")).toBe(0);
    expect(nightsBetween("not-a-date", "2026-07-15")).toBe(0);
  });
});

describe("dmy (user-facing day-first format)", () => {
  it("converts ISO to DD-MM-YYYY", () => {
    expect(dmy("2026-08-10")).toBe("10-08-2026");
    expect(dmy("2027-01-02")).toBe("02-01-2027");
  });
});

describe("isoDay (local calendar date)", () => {
  it("formats a local Date as YYYY-MM-DD with padding", () => {
    expect(isoDay(new Date(2026, 6, 9))).toBe("2026-07-09");
    expect(isoDay(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
  it("uses the LOCAL day even just after local midnight (not UTC)", () => {
    const justAfterMidnight = new Date(2026, 6, 9, 0, 5);
    expect(isoDay(justAfterMidnight)).toBe("2026-07-09");
  });
});
