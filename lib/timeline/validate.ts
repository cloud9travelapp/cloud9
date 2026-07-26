import {
  isTimelineCategory,
  isTimelineSource,
  isTimelineState,
  type TimelineDraft,
} from "./types";

// Shared validation for every entry point (REST, chat piggyback, concierge
// tool). Pure and unit-tested: a bad date or a "14:00" that's really "1400"
// must fail at the door, not become a wrong pin on someone's itinerary.

export type ParseResult =
  | { ok: true; draft: TimelineDraft }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A syntactically valid date that also exists (rejects 2026-02-31). */
export function isValidDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function isValidTime(v: string): boolean {
  return TIME_RE.test(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseTimelineDraft(
  body: unknown,
  defaults: { source: TimelineDraft["source"] },
): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected an object" };
  }
  const b = body as Record<string, unknown>;

  const title = str(b.title);
  if (!title) return { ok: false, error: "Need a title" };
  if (title.length > 200) return { ok: false, error: "Title is too long" };

  const itemType = str(b.itemType) ?? "manual";
  const source = isTimelineSource(b.source) ? b.source : defaults.source;
  const category = isTimelineCategory(b.category) ? b.category : "other";
  const state = isTimelineState(b.state) ? b.state : "planned";

  let date: string | null = null;
  if (b.date != null && b.date !== "") {
    const raw = str(b.date);
    if (!raw || !isValidDate(raw)) {
      return { ok: false, error: "date must be YYYY-MM-DD" };
    }
    date = raw;
  }

  let startTime: string | null = null;
  if (b.startTime != null && b.startTime !== "") {
    const raw = str(b.startTime);
    if (!raw || !isValidTime(raw)) {
      return { ok: false, error: "startTime must be HH:MM" };
    }
    // A time without a day has nothing to sit on — the timeline would have to
    // invent the day, which is exactly what it must never do.
    if (!date) return { ok: false, error: "startTime needs a date" };
    startTime = raw;
  }

  let durationMin: number | null = null;
  if (b.durationMin != null) {
    const n = Number(b.durationMin);
    if (!Number.isFinite(n) || n <= 0 || n > 60 * 24 * 30) {
      return { ok: false, error: "durationMin must be a positive number" };
    }
    durationMin = Math.round(n);
  }

  const lat = coord(b.lat, 90);
  const lng = coord(b.lng, 180);
  if (lat === "bad" || lng === "bad") {
    return { ok: false, error: "lat/lng out of range" };
  }

  const clientRef = str(b.clientRef);
  if (!clientRef) return { ok: false, error: "Need a clientRef" };

  const item =
    b.item && typeof b.item === "object" && !Array.isArray(b.item)
      ? (b.item as Record<string, unknown>)
      : null;

  return {
    ok: true,
    draft: {
      itemType,
      source,
      category,
      state,
      date,
      startTime,
      durationMin,
      title,
      notes: str(b.notes),
      lat,
      lng,
      item,
      clientRef,
    },
  };
}

function coord(v: unknown, max: number): number | null | "bad" {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) return "bad";
  return n;
}
