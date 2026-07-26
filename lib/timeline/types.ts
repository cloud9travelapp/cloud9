// The trip timeline ("המסע") — every planned or booked item on a trip, from
// any source. Generic by itemType like favorites: a future source adds a value,
// not a column. Mirrors the DB shape in supabase/migrations/0004_trip_timeline.sql.

/** Categories double as the future learning-layer signal, so every item gets
 *  one — including manual entries, which are the strongest taste signal we
 *  have ("I wanted this and you didn't offer it"). Retro-classifying free text
 *  later would be guesswork, so the column is required from day one. */
export const TIMELINE_CATEGORIES = [
  "shopping",
  "beach",
  "nature",
  "food",
  "culture",
  "rest",
  "lodging",
  "transport",
  "other",
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export function isTimelineCategory(v: unknown): v is TimelineCategory {
  return (
    typeof v === "string" &&
    (TIMELINE_CATEGORIES as readonly string[]).includes(v)
  );
}

/** planned = chosen, NOT reserved. Selecting an offer in chat holds nothing:
 *  the price can move and the room can go. Only the traveler marks 'booked',
 *  including for things booked entirely outside Cloud9. */
export const TIMELINE_STATES = ["planned", "booked"] as const;
export type TimelineState = (typeof TIMELINE_STATES)[number];

export function isTimelineState(v: unknown): v is TimelineState {
  return typeof v === "string" && (TIMELINE_STATES as readonly string[]).includes(v);
}

export const TIMELINE_SOURCES = ["agent", "manual"] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];

export function isTimelineSource(v: unknown): v is TimelineSource {
  return (
    typeof v === "string" && (TIMELINE_SOURCES as readonly string[]).includes(v)
  );
}

/** Known types today; the field is a plain string on purpose so a new source
 *  needs no migration and no union edit here. */
export type KnownTimelineItemType =
  | "stay"
  | "flight"
  | "attraction"
  | "restaurant"
  | "manual";

export type TimelineItem = {
  id: string;
  itemType: string;
  source: TimelineSource;
  category: TimelineCategory;
  state: TimelineState;
  /** "YYYY-MM-DD", or null when the traveler hasn't placed it on a day yet. */
  date: string | null;
  /** "HH:MM", or null for a loose day-bucket item. NEVER inferred — an item
   *  without a stated time renders in the day, not on the time axis. */
  startTime: string | null;
  durationMin: number | null;
  sortOrder: number;
  title: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  /** Offer snapshot for agent-sourced items (the favorites pattern): the card
   *  renders from this with no refetch, and it survives the offer expiring. */
  item: Record<string, unknown> | null;
  clientRef: string | null;
  createdAt: string;
};

/** What a client sends to create an item. The server owns id//timestamps. */
export type TimelineDraft = {
  itemType: string;
  source: TimelineSource;
  category: TimelineCategory;
  state: TimelineState;
  date: string | null;
  startTime: string | null;
  durationMin: number | null;
  title: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  item: Record<string, unknown> | null;
  /** One user action = one clientRef. Retrying a failed write with the same
   *  ref updates the same row instead of creating a duplicate. */
  clientRef: string;
};
