// Date helpers for the chat UI (calendar block + posted messages), extracted
// so the unit tests exercise the real code.

/** Local calendar date as YYYY-MM-DD (NOT toISOString, which is UTC and can
 *  shift the day across midnight in some timezones). */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** User-facing date: DD-MM-YYYY, day first. Internal values stay ISO. */
export function dmy(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Whole nights between two ISO days (UTC-anchored so DST can't skew it). */
export function nightsBetween(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86400000);
}
