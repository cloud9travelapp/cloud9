import type { AttractionDetail } from "./types";

// Deterministic mock attraction detail, seeded by the offer id — same id, same
// detail. UNLIKE the stays mock (which keeps images empty to exercise the
// no-gallery state), attractions DO carry seeded placeholder images so the
// whole flow is genuinely demoable without keys — the "נתוני דמה" label keeps
// it honest. Real photos/description come from the provider's Content path.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A self-contained gradient placeholder "photo" (no network / CSP concerns). */
function mockImage(seed: number, i: number): string {
  const h1 = (seed * 47 + i * 67) % 360;
  const h2 = (h1 + 35) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${h1},52%,58%)'/>` +
    `<stop offset='1' stop-color='hsl(${h2},48%,42%)'/></linearGradient></defs>` +
    `<rect width='100%' height='100%' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const DESCRIPTIONS = [
  "Led by a friendly local guide who knows the stories behind the sights, at an unhurried pace with time to take it all in.",
  "A small-group experience that skips the crowds and gets you straight to the good part — with a few moments to wander on your own.",
  "A well-run half-day out: easy logistics, memorable spots, and a relaxed rhythm that leaves room to enjoy it.",
];

const INCLUDED_POOL = [
  "Local guide",
  "Skip-the-line entry",
  "Small group",
  "Hotel pickup",
  "Tastings included",
  "All equipment",
  "Entrance fees",
  "Photos",
];

export async function mockAttractionDetail(
  attractionId: string,
): Promise<AttractionDetail> {
  const seed = hashString(attractionId);
  const imageCount = 3 + (seed % 3); // 3–5 photos
  const images = Array.from({ length: imageCount }, (_, i) => mockImage(seed, i));

  const included: string[] = [];
  for (let i = 0; included.length < 3 + (seed % 2); i++) {
    const item = INCLUDED_POOL[(seed + i * 3) % INCLUDED_POOL.length];
    if (!included.includes(item)) included.push(item);
  }

  return {
    mock: true,
    provider: "mock",
    code: attractionId,
    description: DESCRIPTIONS[seed % DESCRIPTIONS.length],
    images,
    included,
  };
}
