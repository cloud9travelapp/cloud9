"use client";

import { useEffect } from "react";

/** Map a 0–23 hour to the sky phase. Each band is fully bounded so the small
 *  hours (00:00–04:59) fall through to night — the earlier open-ended
 *  `hour < 11 → morning` wrongly painted 1 AM as daytime. Night = 19:00–04:59.
 *  Mirrored in the pre-paint inline script in app/layout.tsx — keep in sync. */
export function phaseForHour(hour: number): string {
  if (hour >= 5 && hour < 8) return "sunrise";
  if (hour >= 8 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "midday";
  if (hour >= 16 && hour < 19) return "sunset";
  return "night";
}

/**
 * Keeps `<html data-phase>` in sync with the user's local time so the palette
 * follows the clock. The initial value is set by an inline script in the layout
 * (before paint, so there's no flash); this just re-checks as time passes and
 * lets the CSS transition handle the smooth shift.
 */
export default function TimeOfDay() {
  useEffect(() => {
    const apply = () => {
      const phase = phaseForHour(new Date().getHours());
      if (document.documentElement.dataset.phase !== phase) {
        document.documentElement.dataset.phase = phase;
      }
    };
    apply();
    const id = window.setInterval(apply, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
