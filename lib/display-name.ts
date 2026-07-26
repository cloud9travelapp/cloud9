/**
 * The traveler's first name, presentable.
 *
 * Google profile names arrive exactly as the person typed them at signup, so
 * "max" is common — and "Where to next, max?" reads sloppy in a premium
 * product. A name the provider already cased (McDonald, van Gogh, אורי) is
 * left completely alone; only an uncased first letter is lifted.
 */
export function displayFirstName(
  fullName: string | null | undefined,
  fallback = "traveler",
): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return fallback;
  const head = first[0];
  // Already uppercase → the provider (or the person) cased it deliberately.
  if (head !== head.toLocaleLowerCase()) return first;
  // Caseless scripts (Hebrew, Arabic, CJK) pass through untouched.
  return head.toLocaleUpperCase() + first.slice(1);
}
