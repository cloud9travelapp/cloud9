import { describe, expect, it } from "vitest";
import {
  displayText,
  parseAssistantMessage,
  splitDates,
  splitFlights,
  splitOptions,
  splitStays,
} from "@/lib/chat/blocks";

const FLIGHT_OFFER = {
  id: "f1",
  airlineName: "El Al",
  segments: [{ origin: "TLV", destination: "FCO", departTime: "2026-08-10T08:00", arriveTime: "2026-08-10T11:00" }],
  totalDurationMinutes: 180,
  stops: 0,
  price: 320,
  currency: "USD",
};
const STAY_OFFER = {
  id: "s1",
  name: "NH Collection Roma",
  type: "hotel",
  area: "Monti",
  stars: 4,
  amenities: [],
  pricePerNight: 170,
  totalPrice: 850,
  currency: "USD",
};

const staysMsg = (extra = "") =>
  `מצאתי כמה אפשרויות.\n<<STAYS>>\n${JSON.stringify({ lang: "he", mock: true, offers: [STAY_OFFER] })}\n<<END>>${extra}`;

describe("displayText", () => {
  it("passes plain text through", () => {
    expect(displayText("שלום, לאן נוסעים?")).toBe("שלום, לאן נוסעים?");
  });
  it("strips from a complete marker", () => {
    expect(displayText('קדימה.\n<<OPTIONS>>\n{"options":["א"]}\n<<END>>')).toBe("קדימה.");
  });
  it("strips a partial marker still streaming in", () => {
    expect(displayText("בודק טיסות...\n<<FLIGH")).toBe("בודק טיסות...");
  });
  it("strips a malformed marker so raw blocks never leak", () => {
    expect(displayText("הנה.\n<< STAYS >>{oops")).toBe("הנה.");
  });
});

describe("splitOptions", () => {
  it("parses a valid block", () => {
    const r = splitOptions('מתי?\n<<OPTIONS>>\n{"question":"מתי?","options":["קיץ","סתיו"]}\n<<END>>');
    expect(r.text).toBe("מתי?");
    expect(r.options).toEqual(["קיץ", "סתיו"]);
  });
  it("caps at 4 options and drops empties", () => {
    const r = splitOptions('Q\n<<OPTIONS>>\n{"options":["a","","b","c","d","e"]}\n<<END>>');
    expect(r.options).toEqual(["a", "b", "c", "d"]);
  });
  it("degrades to plain text on malformed JSON", () => {
    const r = splitOptions("Q\n<<OPTIONS>>\n{oops\n<<END>>");
    expect(r).toEqual({ text: "Q", options: null });
  });
  it("degrades when END is missing", () => {
    expect(splitOptions('Q\n<<OPTIONS>>\n{"options":["a"]}').options).toBeNull();
  });
  it("matches markers tolerantly (case + spacing)", () => {
    const r = splitOptions('Q\n<< options >>\n{"options":["a","b"]}\n<< end >>');
    expect(r.options).toEqual(["a", "b"]);
  });
});

describe("splitFlights", () => {
  it("parses the object form and defaults lang to en unless exactly he", () => {
    const r = splitFlights(`הנה.\n<<FLIGHTS>>\n${JSON.stringify({ lang: "he", mock: false, offers: [FLIGHT_OFFER] })}\n<<END>>`);
    expect(r.flights?.lang).toBe("he");
    expect(r.flights?.mock).toBe(false);
    expect(r.flights?.offers).toHaveLength(1);
    const r2 = splitFlights(`Here.\n<<FLIGHTS>>\n${JSON.stringify({ lang: "fr", offers: [FLIGHT_OFFER] })}\n<<END>>`);
    expect(r2.flights?.lang).toBe("en");
    expect(r2.flights?.mock).toBe(true); // label unless explicitly false
  });
  it("accepts a bare offers array", () => {
    const r = splitFlights(`X\n<<FLIGHTS>>\n${JSON.stringify([FLIGHT_OFFER])}\n<<END>>`);
    expect(r.flights?.offers).toHaveLength(1);
  });
  it("drops invalid offers and degrades when none survive", () => {
    const r = splitFlights('X\n<<FLIGHTS>>\n{"offers":[{"airlineName":"El Al"}]}\n<<END>>');
    expect(r.flights).toBeNull();
  });
  it("caps offers at 8", () => {
    const offers = Array.from({ length: 12 }, (_, i) => ({ ...FLIGHT_OFFER, id: `f${i}` }));
    const r = splitFlights(`X\n<<FLIGHTS>>\n${JSON.stringify({ offers })}\n<<END>>`);
    expect(r.flights?.offers).toHaveLength(8);
  });
});

describe("splitStays", () => {
  it("parses a valid block", () => {
    const r = splitStays(staysMsg());
    expect(r.text).toBe("מצאתי כמה אפשרויות.");
    expect(r.stays?.offers[0].name).toBe("NH Collection Roma");
  });
  it("requires name/type/pricePerNight per offer", () => {
    const r = splitStays('X\n<<STAYS>>\n{"offers":[{"name":"A"}]}\n<<END>>');
    expect(r.stays).toBeNull();
  });
});

describe("splitDates", () => {
  it("parses he range", () => {
    const r = splitDates('מצוין. נבחר תאריכים:\n<<DATES>>\n{"lang":"he","mode":"range"}\n<<END>>');
    expect(r.dates).toEqual({ lang: "he", mode: "range", min: undefined, max: undefined });
  });
  it("parses single with bounds", () => {
    const r = splitDates('When?\n<<DATES>>\n{"lang":"en","mode":"single","min":"2026-08-01","max":"2026-09-01"}\n<<END>>');
    expect(r.dates?.mode).toBe("single");
    expect(r.dates?.min).toBe("2026-08-01");
  });
  it("defaults an empty object to range/en", () => {
    const r = splitDates("Q\n<<DATES>>\n{}\n<<END>>");
    expect(r.dates).toEqual({ lang: "en", mode: "range", min: undefined, max: undefined });
  });
  it("degrades on arrays, malformed JSON, and non-string bounds", () => {
    expect(splitDates("Q\n<<DATES>>\n[1,2]\n<<END>>").dates).toBeNull();
    expect(splitDates("Q\n<<DATES>>\n{oops\n<<END>>").dates).toBeNull();
    expect(splitDates('Q\n<<DATES>>\n{"min":123}\n<<END>>').dates?.min).toBeUndefined();
  });
});

describe("parseAssistantMessage (mutually exclusive, cards win ties)", () => {
  it("cards win when a message carries both STAYS and OPTIONS", () => {
    const both = staysMsg('\n<<OPTIONS>>\n{"question":"טיסות?","options":["כן","לא"]}\n<<END>>');
    const r = parseAssistantMessage(both);
    expect(r.stays).not.toBeNull();
    expect(r.options).toBeNull();
    expect(r.text).toBe("מצאתי כמה אפשרויות.");
  });
  it("flights win over stays and options", () => {
    const msg = `X\n<<FLIGHTS>>\n${JSON.stringify({ offers: [FLIGHT_OFFER] })}\n<<END>>\n<<OPTIONS>>\n{"options":["a","b"]}\n<<END>>`;
    const r = parseAssistantMessage(msg);
    expect(r.flights).not.toBeNull();
    expect(r.options).toBeNull();
  });
  it("options-only messages still get pills", () => {
    const r = parseAssistantMessage('Q\n<<OPTIONS>>\n{"options":["a","b"]}\n<<END>>');
    expect(r.options).toEqual(["a", "b"]);
    expect(r.stays).toBeNull();
  });
  it("dates parse when nothing else matches", () => {
    const r = parseAssistantMessage('נבחר תאריכים:\n<<DATES>>\n{"lang":"he"}\n<<END>>');
    expect(r.dates?.lang).toBe("he");
  });
  it("plain text yields text only", () => {
    const r = parseAssistantMessage("בסדר גמור, נשאיר את הטיסות בצד.");
    expect(r).toEqual({
      text: "בסדר גמור, נשאיר את הטיסות בצד.",
      flights: null,
      stays: null,
      options: null,
      dates: null,
    });
  });
});
