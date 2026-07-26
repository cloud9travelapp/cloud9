import { describe, expect, it } from "vitest";
import {
  isValidDate,
  isValidTime,
  parseTimelineDraft,
} from "@/lib/timeline/validate";

const base = { title: "יום ים", clientRef: "ref-1" };

describe("isValidDate", () => {
  it("accepts a real date", () => {
    expect(isValidDate("2026-09-10")).toBe(true);
  });

  it("rejects a well-formed but non-existent date", () => {
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
  });

  it("rejects loose formats", () => {
    expect(isValidDate("10/09/2026")).toBe(false);
    expect(isValidDate("2026-9-10")).toBe(false);
  });
});

describe("isValidTime", () => {
  it("accepts 24h times", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
  });

  it("rejects out-of-range and malformed times", () => {
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:00")).toBe(false);
    expect(isValidTime("1400")).toBe(false);
  });
});

describe("parseTimelineDraft", () => {
  it("requires a title and a clientRef", () => {
    expect(parseTimelineDraft({ clientRef: "r" }, { source: "manual" })).toEqual({
      ok: false,
      error: "Need a title",
    });
    expect(parseTimelineDraft({ title: "x" }, { source: "manual" })).toEqual({
      ok: false,
      error: "Need a clientRef",
    });
  });

  it("defaults category, state and itemType for a bare manual add", () => {
    const r = parseTimelineDraft(base, { source: "manual" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft).toMatchObject({
      itemType: "manual",
      source: "manual",
      category: "other",
      state: "planned",
      date: null,
      startTime: null,
    });
  });

  it("refuses a time with no day rather than inventing one", () => {
    const r = parseTimelineDraft(
      { ...base, startTime: "14:00" },
      { source: "manual" },
    );
    expect(r).toEqual({ ok: false, error: "startTime needs a date" });
  });

  it("keeps a time when the day is given", () => {
    const r = parseTimelineDraft(
      { ...base, date: "2026-09-12", startTime: "14:00" },
      { source: "manual" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.date).toBe("2026-09-12");
    expect(r.draft.startTime).toBe("14:00");
  });

  it("rejects an impossible date", () => {
    const r = parseTimelineDraft(
      { ...base, date: "2026-02-31" },
      { source: "manual" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(
      parseTimelineDraft({ ...base, lat: 91, lng: 0 }, { source: "manual" }).ok,
    ).toBe(false);
    expect(
      parseTimelineDraft({ ...base, lat: 0, lng: -181 }, { source: "manual" }).ok,
    ).toBe(false);
  });

  it("falls back to the caller's source and ignores unknown enum values", () => {
    const r = parseTimelineDraft(
      { ...base, source: "sneaky", category: "wormhole", state: "confirmed" },
      { source: "agent" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.source).toBe("agent");
    expect(r.draft.category).toBe("other");
    expect(r.draft.state).toBe("planned");
  });

  it("rejects a non-object body", () => {
    expect(parseTimelineDraft("nope", { source: "manual" }).ok).toBe(false);
    expect(parseTimelineDraft([1], { source: "manual" }).ok).toBe(false);
  });
});
