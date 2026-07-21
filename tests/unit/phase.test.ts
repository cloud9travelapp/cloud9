import { describe, it, expect } from "vitest";
import { phaseForHour } from "@/components/theme/time-of-day";

describe("phaseForHour", () => {
  it("maps the small hours (00:00–04:59) to night", () => {
    // Regression: the old open-ended `hour < 11 → morning` painted 1 AM as a
    // daytime phase. Every hour before sunrise must be night.
    for (const h of [0, 1, 2, 3, 4]) {
      expect(phaseForHour(h)).toBe("night");
    }
  });

  it("maps each daytime band to its phase", () => {
    expect(phaseForHour(5)).toBe("sunrise");
    expect(phaseForHour(7)).toBe("sunrise");
    expect(phaseForHour(8)).toBe("morning");
    expect(phaseForHour(10)).toBe("morning");
    expect(phaseForHour(11)).toBe("midday");
    expect(phaseForHour(15)).toBe("midday");
    expect(phaseForHour(16)).toBe("sunset");
    expect(phaseForHour(18)).toBe("sunset");
  });

  it("maps the evening (19:00–23:59) to night", () => {
    for (const h of [19, 21, 23]) {
      expect(phaseForHour(h)).toBe("night");
    }
  });
});
