import { describe, expect, it } from "vitest";
import {
  collectShownStayIds,
  displayText,
  fixSentenceSpacing,
  stripHtmlTags,
  hasErrorMarker,
  parseAssistantMessage,
  sortStayOffers,
  splitDates,
  splitMore,
  splitFlights,
  splitOptions,
  splitStays,
  stripMoreBlock,
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

describe("fixSentenceSpacing (language-agnostic space-after-period guard)", () => {
  it("fixes the English regression case", () => {
    expect(fixSentenceSpacing("high ceiling.Only two rooms left.")).toBe(
      "high ceiling. Only two rooms left.",
    );
  });
  it("fixes Hebrew and question marks", () => {
    expect(fixSentenceSpacing("נהדר.נמשיך לתאריכים?מצוין")).toBe(
      "נהדר. נמשיך לתאריכים? מצוין",
    );
  });
  it("leaves decimals, domains, acronyms and ellipses alone", () => {
    expect(fixSentenceSpacing("rated 4.5 stars")).toBe("rated 4.5 stars");
    expect(fixSentenceSpacing("cloud9app.io works")).toBe("cloud9app.io works");
    expect(fixSentenceSpacing("the U.S.A. flight")).toBe("the U.S.A. flight");
    expect(fixSentenceSpacing("בודק טיסות...")).toBe("בודק טיסות...");
  });
  it("is applied by displayText", () => {
    expect(displayText("Done.Next<<OPTIONS>>")).toBe("Done. Next");
  });
});

describe("error marker (in-stream server failure protocol)", () => {
  it("detects the marker, tolerantly", () => {
    expect(hasErrorMarker("רגע, בודק...\n<<ERROR>>")).toBe(true);
    expect(hasErrorMarker("<< error >>")).toBe(true);
    expect(hasErrorMarker("normal reply")).toBe(false);
    expect(hasErrorMarker("<<STAYS>>")).toBe(false);
  });
  it("never renders raw — displayText strips it even with partial text", () => {
    expect(displayText("רגע, בודק טיסות...\n<<ERROR>>")).toBe("רגע, בודק טיסות...");
    expect(displayText("\n<<ERROR>>")).toBe("");
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

describe("splitStays recommendedId", () => {
  it("parses a recommendedId that names a shown offer", () => {
    const msg = `הנה.\n<<STAYS>>\n${JSON.stringify({ lang: "he", mock: false, recommendedId: "s1", offers: [STAY_OFFER] })}\n<<END>>`;
    expect(splitStays(msg).stays?.recommendedId).toBe("s1");
  });
  it("drops a recommendedId that matches no shown offer (never a wrong badge)", () => {
    const msg = `הנה.\n<<STAYS>>\n${JSON.stringify({ lang: "he", mock: false, recommendedId: "ghost", offers: [STAY_OFFER] })}\n<<END>>`;
    expect(splitStays(msg).stays?.recommendedId).toBeUndefined();
  });
  it("absent recommendedId stays undefined", () => {
    const msg = `הנה.\n<<STAYS>>\n${JSON.stringify({ lang: "he", mock: false, offers: [STAY_OFFER] })}\n<<END>>`;
    expect(splitStays(msg).stays?.recommendedId).toBeUndefined();
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
      attractions: null,
      options: null,
      dates: null,
    });
  });
  it("attractions parse and win over options (cards win ties)", () => {
    const msg =
      'הנה כמה רעיונות:\n<<ATTRACTIONS>>\n' +
      JSON.stringify({
        mock: true,
        lang: "he",
        offers: [{ id: "mock-1", name: "Colosseum Tour", category: "tours", fromPrice: 45, currency: "EUR" }],
        recommendedId: "mock-1",
      }) +
      '\n<<END>>\n<<OPTIONS>>\n{"options":["a","b"]}\n<<END>>';
    const r = parseAssistantMessage(msg);
    expect(r.attractions?.offers).toHaveLength(1);
    expect(r.attractions?.recommendedId).toBe("mock-1");
    expect(r.options).toBeNull();
    expect(r.stays).toBeNull();
    expect(r.text).toBe("הנה כמה רעיונות:");
  });
});

describe("sortStayOffers (client-side sort chips)", () => {
  const mk = (id: string, price: number, km?: number, min?: number) => ({
    ...STAY_OFFER, id, pricePerNight: price, distanceKm: km, distanceMinutes: min,
  });
  const offers = [mk("a", 120, 3.1), mk("b", 90, 0.4), mk("c", 200, 1.2)];
  it("fit floats the recommended card, keeps delivered order otherwise", () => {
    expect(sortStayOffers(offers, "fit", "c").map((o) => o.id)).toEqual(["c", "a", "b"]);
    expect(sortStayOffers(offers, "fit").map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
  it("price both ways", () => {
    expect(sortStayOffers(offers, "priceAsc").map((o) => o.id)).toEqual(["b", "a", "c"]);
    expect(sortStayOffers(offers, "priceDesc").map((o) => o.id)).toEqual(["c", "a", "b"]);
  });
  it("distance: km ascending, missing km last, mock minutes as tie-break", () => {
    expect(sortStayOffers(offers, "distance").map((o) => o.id)).toEqual(["b", "c", "a"]);
    const mocky = [mk("m1", 100, undefined, 12), mk("m2", 100, undefined, 4)];
    expect(sortStayOffers(mocky, "distance").map((o) => o.id)).toEqual(["m2", "m1"]);
  });
  it("never mutates the input", () => {
    const before = offers.map((o) => o.id);
    sortStayOffers(offers, "priceDesc");
    expect(offers.map((o) => o.id)).toEqual(before);
  });
});

describe("splitMore (server-authored show-more ticket)", () => {
  it("parses the key and coexists with a STAYS block", () => {
    const msg = `${staysMsg()}\n<<MORE>>\n{"key":"{\\"destination\\":\\"Hanoi\\"}"}\n<<END>>`;
    expect(splitMore(msg)?.key).toBe('{"destination":"Hanoi"}');
    expect(splitStays(msg).stays?.offers).toHaveLength(1);
    expect(splitStays(msg).text).toBe("מצאתי כמה אפשרויות.");
  });
  it("degrades to null on absence or malformed JSON", () => {
    expect(splitMore("plain text")).toBeNull();
    expect(splitMore("X\n<<MORE>>\n{oops\n<<END>>")).toBeNull();
    expect(splitMore('X\n<<MORE>>\n{"key":""}\n<<END>>')).toBeNull();
  });
});

describe("stripMoreBlock (model-history hygiene for persisted MORE tickets)", () => {
  it("removes the MORE block, keeps text and the STAYS block intact", () => {
    const msg = `${staysMsg()}\n<<MORE>>\n{"key":"{\\"destination\\":\\"Bangkok\\"}"}\n<<END>>`;
    const stripped = stripMoreBlock(msg);
    expect(stripped).not.toContain("MORE");
    expect(splitStays(stripped).stays?.offers).toHaveLength(1);
    expect(stripped).toContain("מצאתי כמה אפשרויות.");
  });
  it("is a no-op without a MORE block and tolerates spacing", () => {
    expect(stripMoreBlock("plain text")).toBe("plain text");
    expect(stripMoreBlock('X\n<< more >>\n{"key":"k"}\n<< end >>')).toBe("X");
  });
});

describe("collectShownStayIds (session-wide show-more exclusion seed)", () => {
  const block = (ids: string[]) =>
    `הנה.\n<<STAYS>>\n${JSON.stringify({ lang: "he", offers: ids.map((id) => ({ ...STAY_OFFER, id })) })}\n<<END>>`;
  it("unions ids across all STAYS blocks, deduped", () => {
    const ids = collectShownStayIds([
      "user text",
      block(["hb-1", "hb-2"]),
      "another user text",
      block(["hb-2", "hb-3"]),
    ]);
    expect(ids.sort()).toEqual(["hb-1", "hb-2", "hb-3"]);
  });
  it("empty conversation → empty seed", () => {
    expect(collectShownStayIds([])).toEqual([]);
    expect(collectShownStayIds(["no blocks here"])).toEqual([]);
  });
});

describe("stripHtmlTags", () => {
  it("turns <br> into a newline and removes inline tags (the <br> leak)", () => {
    // displayText trims, so a trailing <br> vanishes cleanly
    expect(displayText("או שתעדיף שאני אציע?<br>\n<<OPTIONS>>\n{}\n<<END>>")).toBe(
      "או שתעדיף שאני אציע?",
    );
    expect(stripHtmlTags("line1<br>line2")).toBe("line1\nline2");
    expect(stripHtmlTags("say <b>hi</b> now")).toBe("say hi now");
    expect(stripHtmlTags('<p class="x">text</p>')).toBe("text");
  });
  it("leaves bare '<' and non-tag angle text alone", () => {
    expect(stripHtmlTags("2 < 3 and a > b")).toBe("2 < 3 and a > b");
    expect(stripHtmlTags("email <a@b.com>")).toBe("email <a@b.com>");
  });
});
