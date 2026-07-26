import type { TimelineItem } from "./types";

// Pure presentation logic for the timeline. No React, no I/O — every rule here
// is unit-tested, because "which day is this on" and "do these overlap" are
// exactly the questions a screenshot can't answer.

/** A day bucket. `isEmpty` marks a real gap INSIDE the trip span — surfaced to
 *  the traveler, never auto-filled. */
export type TimelineDay = {
  date: string; // "YYYY-MM-DD"
  dayNumber: number; // 1-based, from the trip's first dated item
  items: TimelineItem[];
  isEmpty: boolean;
};

/** Two items whose times genuinely collide. Reported, never auto-resolved. */
export type TimelineOverlap = {
  date: string;
  aId: string;
  bId: string;
};

export type GroupedTimeline = {
  days: TimelineDay[];
  /** Items with no date yet — a real bucket, not a failure. */
  unscheduled: TimelineItem[];
  overlaps: TimelineOverlap[];
};

/** Guard against a typo'd year turning into 200k rendered day rows. */
const MAX_SPAN_DAYS = 400;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Minutes since midnight for "HH:MM". */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Timed items first in clock order, then untimed ones by explicit sort order
 *  (then creation). Mixed granularity is the point: an item without a time is
 *  not "unknown time to be guessed", it's a day-level plan. */
export function sortWithinDay(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.startTime && b.startTime) {
      const diff = toMinutes(a.startTime) - toMinutes(b.startTime);
      if (diff !== 0) return diff;
    } else if (a.startTime) {
      return -1;
    } else if (b.startTime) {
      return 1;
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** True when two timed items collide. An item with no duration is a point in
 *  time — it only conflicts with something starting at the same moment. */
export function itemsOverlap(a: TimelineItem, b: TimelineItem): boolean {
  if (!a.startTime || !b.startTime) return false;
  const aStart = toMinutes(a.startTime);
  const bStart = toMinutes(b.startTime);
  if (aStart === bStart) return true;
  const aEnd = aStart + (a.durationMin ?? 0);
  const bEnd = bStart + (b.durationMin ?? 0);
  return aStart < bEnd && bStart < aEnd;
}

function overlapsInDay(date: string, items: TimelineItem[]): TimelineOverlap[] {
  const found: TimelineOverlap[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (itemsOverlap(items[i], items[j])) {
        found.push({ date, aId: items[i].id, bId: items[j].id });
      }
    }
  }
  return found;
}

/**
 * Group items into contiguous day buckets spanning first → last dated item,
 * including the empty days in between. Day 1 is derived from the earliest
 * dated item — the trip itself stores no start date, and inventing one from
 * the conversation would be a guess.
 */
export function groupTimeline(items: TimelineItem[]): GroupedTimeline {
  const unscheduled = sortWithinDay(items.filter((i) => !i.date));
  const dated = items.filter((i): i is TimelineItem & { date: string } =>
    Boolean(i.date),
  );

  if (dated.length === 0) {
    return { days: [], unscheduled, overlaps: [] };
  }

  const dates = dated.map((i) => i.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = Math.min(daysBetween(first, last), MAX_SPAN_DAYS - 1);

  const byDate = new Map<string, TimelineItem[]>();
  for (const item of dated) {
    const bucket = byDate.get(item.date);
    if (bucket) bucket.push(item);
    else byDate.set(item.date, [item]);
  }

  const days: TimelineDay[] = [];
  const overlaps: TimelineOverlap[] = [];
  for (let offset = 0; offset <= span; offset++) {
    const date = addDays(first, offset);
    const dayItems = sortWithinDay(byDate.get(date) ?? []);
    days.push({
      date,
      dayNumber: offset + 1,
      items: dayItems,
      isEmpty: dayItems.length === 0,
    });
    overlaps.push(...overlapsInDay(date, dayItems));
  }

  return { days, unscheduled, overlaps };
}

/** Today as a LOCAL calendar date. `toISOString().slice(0,10)` would be UTC,
 *  which after 21:00 in Israel is still yesterday — the "today" marker would
 *  point at the wrong day exactly when someone is checking tonight's plan. */
export function localDateString(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** A stay's coverage of one day. `nightIndex` is 1-based; a check-OUT day has
 *  no nightIndex — you slept there the night before, not that night. */
export type StayCoverage = {
  item: TimelineItem;
  /** Index among the trip's stays — drives alternating band tints so two
   *  adjacent stays never read as one continuous block. */
  stayIndex: number;
  nightIndex: number | null;
  nights: number;
  isFirstNight: boolean;
  isLastNight: boolean;
  isCheckOut: boolean;
};

function stayRange(item: TimelineItem): { start: string; end: string } | null {
  if (item.itemType !== "stay" || !item.date) return null;
  const snapshot = item.item as { checkOut?: unknown } | null;
  const end =
    typeof snapshot?.checkOut === "string" ? snapshot.checkOut : null;
  // No check-out (a manual stay, or a block written before the dates existed)
  // → a single-day item. Inventing a length would draw nights that may not
  // exist. See the handoff's known-limitation note.
  if (!end || end <= item.date) return null;
  return { start: item.date, end };
}

/**
 * Which stay (if any) covers each date.
 *
 * THE NIGHT RULE: you sleep where you check IN. Check-in 10th, check-out 13th
 * = nights of the 10th, 11th and 12th; the 13th is a check-out, not a night.
 * That one rule makes the transition day — check out of A, check into B —
 * resolve on its own: B owns the night, A only shows a departure.
 */
export function stayCoverageByDate(
  items: TimelineItem[],
): Map<string, StayCoverage[]> {
  const stays = items
    .filter((i) => i.itemType === "stay" && i.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const byDate = new Map<string, StayCoverage[]>();
  stays.forEach((item, stayIndex) => {
    const range = stayRange(item);
    if (!range) return;
    const nights = daysBetween(range.start, range.end);
    for (let n = 0; n < nights; n++) {
      const date = addDays(range.start, n);
      const entry: StayCoverage = {
        item,
        stayIndex,
        nightIndex: n + 1,
        nights,
        isFirstNight: n === 0,
        isLastNight: n === nights - 1,
        isCheckOut: false,
      };
      byDate.set(date, [...(byDate.get(date) ?? []), entry]);
    }
    // The check-out day itself: a departure, never a night.
    byDate.set(range.end, [
      ...(byDate.get(range.end) ?? []),
      {
        item,
        stayIndex,
        nightIndex: null,
        nights,
        isFirstNight: false,
        isLastNight: false,
        isCheckOut: true,
      },
    ]);
  });
  return byDate;
}

/** Booked vs total — the "trip isn't closed yet" signal, without declaring the
 *  whole document a draft (most of the planning happens before anything is
 *  booked, and a permanent "none of this is real" banner would undercut it). */
export function bookingProgress(items: TimelineItem[]): {
  booked: number;
  total: number;
} {
  return {
    booked: items.filter((i) => i.state === "booked").length,
    total: items.length,
  };
}

/**
 * Which empty-state to show. A trip that predates the timeline feature looks
 * identical to a brand-new one in the data — but not to the traveler, who
 * remembers choosing a hotel. Telling them apart is the difference between
 * "start planning" and "this looks broken".
 */
export type TimelineEmptyKind = "new" | "predates-feature";

export function emptyStateKind(
  tripCreatedAt: string,
  featureSince: string,
): TimelineEmptyKind {
  return Date.parse(tripCreatedAt) < Date.parse(featureSince)
    ? "predates-feature"
    : "new";
}
