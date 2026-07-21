// Delimiter-block parsing for assistant messages, extracted from the chat
// client so the unit tests exercise the REAL code. Assistant messages may
// carry ONE trailing special block (<<OPTIONS>>, <<FLIGHTS>>, <<STAYS>>,
// <<DATES>> … <<END>>).
//
// For DISPLAY we strip everything from the first "<<" onward — bulletproof
// against a complete marker, a partial marker still streaming in (e.g.
// "<<FLIGH"), or a slightly-malformed one, so raw block content is NEVER shown.
// For PARSING we match markers tolerantly (case- and inner-whitespace-
// insensitive), so cards still render even if the model formats a marker oddly.

import type {
  DatesPayload,
  FlightOfferView,
  FlightsPayload,
  Lang,
  StayOfferView,
  StaysPayload,
} from "@/components/chat/message-parts";

/**
 * Deterministic guard for the "space after sentence punctuation" writing rule
 * (a live-session regression showed it slipping in English: "ceiling.Only").
 * Conservative on purpose: fixes only letter+punctuation immediately followed
 * by an uppercase Latin or any Hebrew letter — decimals ("4.5"), domains
 * ("cloud9app.io"), acronyms ("U.S.A.") and ellipses stay untouched.
 */
export function fixSentenceSpacing(text: string): string {
  return text.replace(/([a-zא-ת])([.!?])(?=[A-ZА-Яא-ת])/g, "$1$2 ");
}

export function displayText(content: string): string {
  const i = content.indexOf("<<");
  return fixSentenceSpacing((i === -1 ? content : content.slice(0, i)).trimEnd());
}

export function blockRaw(content: string, tag: string): string | null {
  const open = new RegExp(`<<\\s*${tag}\\s*>>`, "i").exec(content);
  if (!open) return null;
  const rest = content.slice(open.index + open[0].length);
  const end = /<<\s*END\s*>>/i.exec(rest);
  if (!end) return null;
  return rest.slice(0, end.index).trim();
}

/**
 * Split an assistant message into its display text and any quick-reply options.
 * Options are returned only when a complete, valid block parses; any failure
 * degrades to plain text. The display text never contains raw block markup.
 */
export function splitOptions(content: string): {
  text: string;
  options: string[] | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "OPTIONS");
  if (raw === null) return { text, options: null };
  try {
    const parsed = JSON.parse(raw) as { options?: unknown };
    if (!Array.isArray(parsed.options)) return { text, options: null };
    const options = parsed.options
      .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      .slice(0, 4);
    return { text, options: options.length ? options : null };
  } catch {
    return { text, options: null };
  }
}

/**
 * Mirror of splitOptions for the <<FLIGHTS>> block. Accepts `{ lang, mock,
 * offers }` or a bare offers array. `lang` defaults to "en" unless exactly "he".
 * Any failure degrades to plain text; the display text never shows raw markup.
 */
export function splitFlights(content: string): {
  text: string;
  flights: FlightsPayload | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "FLIGHTS");
  if (raw === null) return { text, flights: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    let mock = true;
    let lang: Lang = "en";
    let offersRaw: unknown;
    if (Array.isArray(parsed)) {
      offersRaw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as { mock?: unknown; lang?: unknown; offers?: unknown };
      offersRaw = obj.offers;
      mock = obj.mock !== false; // label unless explicitly false
      lang = obj.lang === "he" ? "he" : "en"; // default en unless exactly "he"
    }
    if (!Array.isArray(offersRaw)) return { text, flights: null };
    const offers = offersRaw.filter((o): o is FlightOfferView => {
      const x = o as Partial<FlightOfferView>;
      return (
        !!x &&
        typeof x.airlineName === "string" &&
        Array.isArray(x.segments) &&
        x.segments.length > 0 &&
        typeof x.price === "number"
      );
    });
    if (!offers.length) return { text, flights: null };
    return { text, flights: { mock, lang, offers: offers.slice(0, 8) } };
  } catch {
    return { text, flights: null };
  }
}

/**
 * Mirror of splitFlights for the <<STAYS>> block. `lang` defaults to "en" unless
 * exactly "he". Any failure degrades to plain text; the display text never shows
 * raw markup.
 */
export function splitStays(content: string): {
  text: string;
  stays: StaysPayload | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "STAYS");
  if (raw === null) return { text, stays: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    let mock = true;
    let lang: Lang = "en";
    let offersRaw: unknown;
    let recommendedRaw: unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as { mock?: unknown; lang?: unknown; offers?: unknown; recommendedId?: unknown };
      offersRaw = obj.offers;
      mock = obj.mock !== false; // label unless explicitly false
      lang = obj.lang === "he" ? "he" : "en"; // default en unless exactly "he"
      recommendedRaw = obj.recommendedId;
    } else if (Array.isArray(parsed)) {
      offersRaw = parsed;
    }
    if (!Array.isArray(offersRaw)) return { text, stays: null };
    const offers = offersRaw.filter((o): o is StayOfferView => {
      const x = o as Partial<StayOfferView>;
      return (
        !!x &&
        typeof x.name === "string" &&
        typeof x.type === "string" &&
        typeof x.pricePerNight === "number"
      );
    });
    if (!offers.length) return { text, stays: null };
    const shown = offers.slice(0, 8);
    // A recommendation only counts when it names a SHOWN offer — anything
    // else (typo, dropped offer) degrades to no badge, never a wrong badge.
    const recommendedId =
      typeof recommendedRaw === "string" &&
      shown.some((o) => o.id === recommendedRaw)
        ? recommendedRaw
        : undefined;
    return { text, stays: { mock, lang, offers: shown, ...(recommendedId ? { recommendedId } : {}) } };
  } catch {
    return { text, stays: null };
  }
}

/**
 * Mirror of splitOptions for the <<DATES>> block. Any valid JSON object yields
 * a calendar (mode defaults to "range", lang to "en"; DateCalendar itself
 * clamps min/max to the future). Any failure degrades to plain text.
 */
export function splitDates(content: string): {
  text: string;
  dates: DatesPayload | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "DATES");
  if (raw === null) return { text, dates: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { text, dates: null };
    }
    const obj = parsed as { lang?: unknown; mode?: unknown; min?: unknown; max?: unknown };
    return {
      text,
      dates: {
        lang: obj.lang === "he" ? "he" : "en", // default en unless exactly "he"
        mode: obj.mode === "single" ? "single" : "range",
        min: typeof obj.min === "string" ? obj.min : undefined,
        max: typeof obj.max === "string" ? obj.max : undefined,
      },
    };
  } catch {
    return { text, dates: null };
  }
}

export type ParsedAssistantMessage = {
  text: string;
  flights: FlightsPayload | null;
  stays: StaysPayload | null;
  options: string[] | null;
  dates: DatesPayload | null;
};

/**
 * The mutually-exclusive block decision (one block per message). CARDS WIN
 * TIES: offers are checked before options, so if a message ever carries both
 * an offers block and an OPTIONS block, the cards render and the pills are
 * dropped — never the reverse.
 */
export function parseAssistantMessage(content: string): ParsedAssistantMessage {
  const fl = splitFlights(content);
  if (fl.flights) {
    return { text: fl.text, flights: fl.flights, stays: null, options: null, dates: null };
  }
  const st = splitStays(content);
  if (st.stays) {
    return { text: st.text, flights: null, stays: st.stays, options: null, dates: null };
  }
  const opt = splitOptions(content);
  if (opt.options) {
    return { text: opt.text, flights: null, stays: null, options: opt.options, dates: null };
  }
  const dt = splitDates(content);
  return { text: dt.text, flights: null, stays: null, options: null, dates: dt.dates };
}
