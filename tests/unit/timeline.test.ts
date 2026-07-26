import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  emptyStateKind,
  groupTimeline,
  itemsOverlap,
  sortWithinDay,
} from "@/lib/timeline/present";
import {
  attractionToTimelineDraft,
  flightToTimelineDraft,
  stayToTimelineDraft,
  timelineCategoryForAttraction,
} from "@/lib/timeline/from-offer";
import type { TimelineItem } from "@/lib/timeline/types";
import type { StayOffer } from "@/lib/stays/types";
import type { FlightOffer } from "@/lib/flights/types";
import type { AttractionOffer } from "@/lib/attractions/types";

function item(over: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    itemType: "manual",
    source: "manual",
    category: "other",
    state: "planned",
    date: null,
    startTime: null,
    durationMin: null,
    sortOrder: 0,
    title: "Item",
    notes: null,
    lat: null,
    lng: null,
    item: null,
    clientRef: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("date helpers", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-09-29", 3)).toBe("2026-10-02");
  });

  it("adds days across a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-09-10", "2026-09-17")).toBe(7);
    expect(daysBetween("2026-09-10", "2026-09-10")).toBe(0);
  });
});

describe("sortWithinDay", () => {
  it("puts timed items in clock order before untimed ones", () => {
    const sorted = sortWithinDay([
      item({ id: "loose" }),
      item({ id: "late", startTime: "18:30" }),
      item({ id: "early", startTime: "09:00" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["early", "late", "loose"]);
  });

  it("orders untimed items by sortOrder, then creation", () => {
    const sorted = sortWithinDay([
      item({ id: "c", sortOrder: 1, createdAt: "2026-09-01T10:00:00.000Z" }),
      item({ id: "a", sortOrder: 0, createdAt: "2026-09-01T09:00:00.000Z" }),
      item({ id: "b", sortOrder: 0, createdAt: "2026-09-01T11:00:00.000Z" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("itemsOverlap", () => {
  it("is false when either item has no time (never a guessed conflict)", () => {
    expect(
      itemsOverlap(
        item({ id: "a", startTime: "10:00", durationMin: 120 }),
        item({ id: "b" }),
      ),
    ).toBe(false);
  });

  it("detects a genuine time collision", () => {
    expect(
      itemsOverlap(
        item({ id: "a", startTime: "10:00", durationMin: 120 }),
        item({ id: "b", startTime: "11:00", durationMin: 60 }),
      ),
    ).toBe(true);
  });

  it("treats touching intervals as fine", () => {
    expect(
      itemsOverlap(
        item({ id: "a", startTime: "10:00", durationMin: 60 }),
        item({ id: "b", startTime: "11:00", durationMin: 60 }),
      ),
    ).toBe(false);
  });

  it("flags two items starting at the same minute even with no duration", () => {
    expect(
      itemsOverlap(
        item({ id: "a", startTime: "09:00" }),
        item({ id: "b", startTime: "09:00" }),
      ),
    ).toBe(true);
  });
});

describe("groupTimeline", () => {
  it("returns no days and keeps undated items unscheduled", () => {
    const grouped = groupTimeline([item({ id: "a" }), item({ id: "b" })]);
    expect(grouped.days).toEqual([]);
    expect(grouped.unscheduled.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("spans first to last dated item and marks the gap days empty", () => {
    const grouped = groupTimeline([
      item({ id: "d1", date: "2026-09-10" }),
      item({ id: "d4", date: "2026-09-13" }),
    ]);
    expect(grouped.days).toHaveLength(4);
    expect(grouped.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(grouped.days.map((d) => d.isEmpty)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(grouped.days[3].date).toBe("2026-09-13");
  });

  it("keeps dated and undated items in their own buckets", () => {
    const grouped = groupTimeline([
      item({ id: "dated", date: "2026-09-10" }),
      item({ id: "floating" }),
    ]);
    expect(grouped.days[0].items.map((i) => i.id)).toEqual(["dated"]);
    expect(grouped.unscheduled.map((i) => i.id)).toEqual(["floating"]);
  });

  it("reports overlaps per day", () => {
    const grouped = groupTimeline([
      item({ id: "a", date: "2026-09-10", startTime: "10:00", durationMin: 120 }),
      item({ id: "b", date: "2026-09-10", startTime: "11:00", durationMin: 60 }),
      item({ id: "c", date: "2026-09-10", startTime: "16:00", durationMin: 60 }),
    ]);
    expect(grouped.overlaps).toEqual([
      { date: "2026-09-10", aId: "a", bId: "b" },
    ]);
  });

  it("caps a typo'd far-future date instead of building 200k days", () => {
    const grouped = groupTimeline([
      item({ id: "a", date: "2026-09-10" }),
      item({ id: "typo", date: "2126-09-10" }),
    ]);
    expect(grouped.days.length).toBeLessThanOrEqual(400);
  });
});

describe("emptyStateKind", () => {
  const since = "2026-07-26T00:00:00.000Z";

  it("calls a trip created before the feature a legacy trip", () => {
    expect(emptyStateKind("2026-07-20T10:00:00.000Z", since)).toBe(
      "predates-feature",
    );
  });

  it("calls a trip created after the feature new", () => {
    expect(emptyStateKind("2026-07-28T10:00:00.000Z", since)).toBe("new");
  });
});

describe("offer → timeline drafts", () => {
  const stay: StayOffer = {
    id: "hb-123",
    name: "My Story Hotel Tejo",
    type: "hotel",
    area: "Baixa",
    stars: 3,
    amenities: [],
    pricePerNight: 171,
    totalPrice: 1194,
    currency: "EUR",
  };

  it("maps a stay to a lodging item on the check-in day with no invented time", () => {
    const draft = stayToTimelineDraft(stay, {
      checkIn: "2026-09-10",
      clientRef: "ref-1",
    });
    expect(draft.category).toBe("lodging");
    expect(draft.state).toBe("planned");
    expect(draft.source).toBe("agent");
    expect(draft.date).toBe("2026-09-10");
    expect(draft.startTime).toBeNull();
    expect(draft.title).toBe("My Story Hotel Tejo");
    expect(draft.item).toMatchObject({ id: "hb-123" });
  });

  it("passes coordinates through when the provider supplies them", () => {
    const draft = stayToTimelineDraft(
      { ...stay, latitude: 38.71, longitude: -9.13 },
      { checkIn: "2026-09-10", clientRef: "ref-1" },
    );
    expect(draft.lat).toBe(38.71);
    expect(draft.lng).toBe(-9.13);
  });

  it("leaves coordinates null when the offer has none", () => {
    const draft = stayToTimelineDraft(stay, {
      checkIn: null,
      clientRef: "ref-1",
    });
    expect(draft.lat).toBeNull();
    expect(draft.lng).toBeNull();
    expect(draft.date).toBeNull();
  });

  it("maps a flight to a transport item using the real departure time", () => {
    const flight: FlightOffer = {
      id: "mock-1",
      airlineName: "Israir",
      segments: [
        {
          origin: "TLV",
          destination: "LIS",
          departTime: "2026-09-10T06:25:00Z",
          arriveTime: "2026-09-10T10:05:00Z",
        },
      ],
      totalDurationMinutes: 340,
      stops: 0,
      price: 470,
      currency: "USD",
    };
    const draft = flightToTimelineDraft(flight, { clientRef: "ref-2" });
    expect(draft.category).toBe("transport");
    expect(draft.date).toBe("2026-09-10");
    expect(draft.startTime).toBe("06:25");
    expect(draft.durationMin).toBe(340);
    expect(draft.title).toBe("Israir TLV→LIS");
  });

  it("maps an attraction unscheduled, since offers carry no date", () => {
    const attraction: AttractionOffer = {
      id: "hb-a1",
      name: "Fado in Chiado Show",
      category: "culture",
      currency: "EUR",
      durationMinutes: 60,
    };
    const draft = attractionToTimelineDraft(attraction, { clientRef: "ref-3" });
    expect(draft.date).toBeNull();
    expect(draft.category).toBe("culture");
    expect(draft.durationMin).toBe(60);
  });

  it("maps the activity taxonomy onto timeline categories", () => {
    expect(timelineCategoryForAttraction("museums")).toBe("culture");
    expect(timelineCategoryForAttraction("water")).toBe("beach");
    expect(timelineCategoryForAttraction("wellness")).toBe("rest");
    expect(timelineCategoryForAttraction("outdoors")).toBe("nature");
    // honestly coarse rather than misleadingly specific
    expect(timelineCategoryForAttraction("nightlife")).toBe("other");
  });
});
