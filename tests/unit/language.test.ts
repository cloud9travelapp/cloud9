import { describe, expect, it } from "vitest";
import { detectReplyLanguage } from "@/lib/language";

const heConvo = [
  { role: "user" as const, content: "אני רוצה לטוס ליוון" },
  {
    role: "assistant" as const,
    content:
      'בהחלט. מתי תרצה לצאת?\n<<OPTIONS>>\n{"question":"מתי?","options":["קיץ","סתיו"]}\n<<END>>',
  },
];
const enConvo = [
  { role: "user" as const, content: "I want a holiday in Greece" },
  {
    role: "assistant" as const,
    content:
      'Of course. When would you like to travel?\n<<OPTIONS>>\n{"question":"When?","options":["Summer","Fall"]}\n<<END>>',
  },
];

describe("detectReplyLanguage (approved policy)", () => {
  it("pure Hebrew → he; pure English → other", () => {
    expect(detectReplyLanguage("תמצא לי טיסה לפריז במאי", [])).toBe("he");
    expect(detectReplyLanguage("find me a flight to Paris in May", [])).toBe("other");
  });

  it("honors a genuine full switch in both directions", () => {
    expect(detectReplyLanguage("בעצם משהו אחר - תמצא לי מלון ברומא לשבוע", enConvo)).toBe("he");
    expect(detectReplyLanguage("actually let's plan something in England instead", heConvo)).toBe("other");
  });

  it("a lone place/brand name doesn't flip the language", () => {
    expect(detectReplyLanguage("תמצא לי טיסה ישירה ל-Rome בבקשה", heConvo)).toBe("he");
    expect(detectReplyLanguage("מה עדיף, British Airways או Lufthansa?", heConvo)).toBe("he");
    expect(detectReplyLanguage("find me a nice hotel in אילת please", enConvo)).toBe("other");
  });

  it("one-word pill labels are decisive (100% dominance)", () => {
    expect(detectReplyLanguage("Flight", heConvo)).toBe("other");
    expect(detectReplyLanguage("טיסה", enConvo)).toBe("he");
  });

  it("ambiguous input falls back to the conversation's established language", () => {
    expect(detectReplyLanguage("10-15?", heConvo)).toBe("he");
    expect(detectReplyLanguage("10-15?", enConvo)).toBe("other");
    expect(detectReplyLanguage("👍", heConvo)).toBe("he");
  });

  it("structured card-select posts stay in the conversation language", () => {
    expect(detectReplyLanguage("בחרתי תאריכים: 15-07-2026 עד 22-07-2026", heConvo)).toBe("he");
    expect(detectReplyLanguage("בחרתי: El Al, TLV→JFK, עצירה אחת, $530", heConvo)).toBe("he");
    expect(detectReplyLanguage("Selected: El Al, TLV→JFK, 1 stop, $530", enConvo)).toBe("other");
  });

  it("long Latin hotel names can't flip a select post — the Milano bug", () => {
    // 7 Latin vs 3 Hebrew tokens = exactly 0.70 Latin share; the select
    // prefix must win before dominance counting even runs.
    expect(
      detectReplyLanguage(
        "בחרתי: Idea Hotel Milano San Siro, Milan, 4 כוכבים, EUR 44 ללילה",
        heConvo,
      ),
    ).toBe("he");
    expect(
      detectReplyLanguage(
        "Selected: מלון דן תל אביב, Tel Aviv, 5 stars, ILS 900 per night",
        enConvo,
      ),
    ).toBe("other");
  });

  it("assistant block JSON never skews the history fallback", () => {
    const convo = [
      { role: "user" as const, content: "טיסה לרומא באוגוסט" },
      {
        role: "assistant" as const,
        content:
          'הכי זול זה Israir ב-$480.\n<<FLIGHTS>>\n{"lang":"he","mock":true,"offers":[{"airlineName":"El Al Israel Airlines","price":530,"stops":0,"segments":[{"origin":"TLV","destination":"FCO"}]}]}\n<<END>>',
      },
    ];
    expect(detectReplyLanguage("?", convo)).toBe("he");
  });

  it("brand-new ambiguous conversation defaults to Hebrew (onboarding seam)", () => {
    expect(detectReplyLanguage("ok", [])).toBe("he");
  });
});
