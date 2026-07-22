import { describe, it, expect } from "vitest";
import { cleanLocationPart } from "@/lib/stays/detail";

describe("cleanLocationPart", () => {
  it("drops a dangling junk tail (the '…Beach, no' bug)", () => {
    expect(cleanLocationPart("Aghios Georgios Beach, no")).toBe(
      "Aghios Georgios Beach",
    );
    expect(cleanLocationPart("Playa del Carmen, s/n")).toBe("Playa del Carmen");
    expect(cleanLocationPart("Main St, N/A")).toBe("Main St");
  });

  it("keeps real multi-part addresses and single names", () => {
    expect(cleanLocationPart("Via Roma, 12")).toBe("Via Roma, 12");
    expect(cleanLocationPart("Trastevere")).toBe("Trastevere");
    // a real word ending in the junk letters must NOT be stripped
    expect(cleanLocationPart("Verona")).toBe("Verona");
    expect(cleanLocationPart("Plaza Mayor, 5")).toBe("Plaza Mayor, 5");
  });

  it("collapses to undefined when nothing real remains, and passes through empty", () => {
    expect(cleanLocationPart("no")).toBeUndefined();
    expect(cleanLocationPart(", s/n")).toBeUndefined();
    expect(cleanLocationPart(undefined)).toBeUndefined();
  });
});
