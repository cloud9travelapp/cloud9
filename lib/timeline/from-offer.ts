import type { StayOffer } from "@/lib/stays/types";
import type { FlightOffer } from "@/lib/flights/types";
import type {
  AttractionCategory,
  AttractionOffer,
} from "@/lib/attractions/types";
import type { TimelineCategory, TimelineDraft } from "./types";

// Selecting an offer in chat currently produces ONE prose sentence and throws
// the structured offer away (id, provider, price, coordinates). These mappers
// run at the moment of the tap, while the offer object is still in hand, and
// turn it into a timeline row. Everything they emit is data the offer actually
// carries — nothing here invents a time, a date, or a place.

/** Coordinates are optional on the offer types: real providers supply them,
 *  the mock only does so around a known searched point, and offers cached
 *  before the hb2/hba5 generations have none. Absent → the item lands in the
 *  map's "no location" list rather than at a guessed pin. */
type WithCoords = { latitude?: number; longitude?: number };

function coords(o: WithCoords): { lat: number | null; lng: number | null } {
  return {
    lat: typeof o.latitude === "number" ? o.latitude : null,
    lng: typeof o.longitude === "number" ? o.longitude : null,
  };
}

/** The activity taxonomy is richer than the timeline's; these two are honestly
 *  coarse ("nightlife"/"family" have no timeline home) rather than forced into
 *  a category that would mislead the future learning layer. */
const ATTRACTION_CATEGORY: Record<AttractionCategory, TimelineCategory> = {
  tours: "culture",
  museums: "culture",
  culture: "culture",
  outdoors: "nature",
  adventure: "nature",
  water: "beach",
  food: "food",
  wellness: "rest",
  nightlife: "other",
  family: "other",
};

export function timelineCategoryForAttraction(
  category: AttractionCategory,
): TimelineCategory {
  return ATTRACTION_CATEGORY[category] ?? "other";
}

export function stayToTimelineDraft(
  offer: StayOffer & WithCoords,
  opts: { checkIn: string | null; clientRef: string },
): TimelineDraft {
  return {
    itemType: "stay",
    source: "agent",
    category: "lodging",
    state: "planned",
    // Check-in day. Check-in TIME is not in the offer, so it stays a day-level
    // item rather than a made-up 15:00.
    date: opts.checkIn,
    startTime: null,
    durationMin: null,
    title: offer.name,
    notes: offer.area || null,
    ...coords(offer),
    item: { ...offer } as Record<string, unknown>,
    clientRef: opts.clientRef,
  };
}

export function flightToTimelineDraft(
  offer: FlightOffer,
  opts: { clientRef: string },
): TimelineDraft {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  // Departure date and time are real data on the segment — not inferred.
  const date = first ? first.departTime.slice(0, 10) : null;
  const startTime = first ? first.departTime.slice(11, 16) : null;
  return {
    itemType: "flight",
    source: "agent",
    category: "transport",
    state: "planned",
    date,
    startTime,
    durationMin: offer.totalDurationMinutes || null,
    title: first && last
      ? `${offer.airlineName} ${first.origin}→${last.destination}`
      : offer.airlineName,
    notes: null,
    lat: null,
    lng: null,
    item: { ...offer } as Record<string, unknown>,
    clientRef: opts.clientRef,
  };
}

export function attractionToTimelineDraft(
  offer: AttractionOffer & WithCoords,
  opts: { date?: string | null; clientRef: string },
): TimelineDraft {
  return {
    itemType: "attraction",
    source: "agent",
    category: timelineCategoryForAttraction(offer.category),
    state: "planned",
    // Attractions carry no date — they land unscheduled until the traveler
    // places them. Guessing a day would be inventing their itinerary.
    date: opts.date ?? null,
    startTime: null,
    durationMin: offer.durationMinutes ?? null,
    title: offer.name,
    notes: offer.area || null,
    ...coords(offer),
    item: { ...offer } as Record<string, unknown>,
    clientRef: opts.clientRef,
  };
}
