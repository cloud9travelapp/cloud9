import { describe, expect, it } from "vitest";
import { displayFirstName } from "@/lib/display-name";

describe("displayFirstName", () => {
  it("lifts an all-lowercase name", () => {
    expect(displayFirstName("max")).toBe("Max");
    expect(displayFirstName("max levi")).toBe("Max");
  });

  it("leaves a properly cased name exactly as the provider gave it", () => {
    expect(displayFirstName("Max")).toBe("Max");
    expect(displayFirstName("McDonald Smith")).toBe("McDonald");
  });

  it("leaves caseless scripts untouched", () => {
    expect(displayFirstName("אורי כהן")).toBe("אורי");
  });

  it("falls back when there is no name", () => {
    expect(displayFirstName(null)).toBe("traveler");
    expect(displayFirstName("   ")).toBe("traveler");
  });
});
