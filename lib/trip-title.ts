/**
 * Deterministic guard over the trip-titler's model output. Returns the clean
 * title, or null when nothing should change (KEEP / empty / overlong).
 *
 * Format law: a comma is legal ONLY in the exact "A, B & more" shape; any
 * other comma form is the "City, Country" bug and gets clipped to its first
 * segment ("Budva, Montenegro" → "Budva"). Even if the naming model slips,
 * the stored title can't carry the format.
 */
export function sanitizeTripTitle(raw: string): string | null {
  let title = raw
    .trim()
    .replace(/^["'«]+|["'»]+$/g, "")
    .trim();
  if (!title || title.toUpperCase() === "KEEP") return null;
  if (title.includes(",") && !/^[^,]+, [^,]+ & more$/.test(title)) {
    title = title.split(",")[0].trim();
  }
  if (!title || title.length > 48) return null;
  return title;
}
