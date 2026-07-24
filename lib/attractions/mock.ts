import type {
  AttractionCategory,
  AttractionOffer,
  AttractionQuery,
  PriceLevel,
} from "./types";

// Deterministic-but-varied fake data: the same query always yields the same
// offers, while different queries look meaningfully different. Mirrors the
// stays/flight mocks' seeded approach so the whole flow is demoable + testable
// without keys. NOTE: no `rating` is set — Hotelbeds Activities carries no
// review field, so the mock stays honest to what production will show.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRICE_MULTIPLIER: Record<PriceLevel, number> = {
  budget: 0.6,
  mid: 1,
  premium: 1.8,
};

type Seed = { name: string; category: AttractionCategory; mins: number; area: string };

// A few known destinations get believable, recognisable things-to-do; anything
// else falls back to generic-but-plausible activities built from the category.
const KNOWN: Record<string, { tier: number; items: Seed[] }> = {
  rome: {
    tier: 1.15,
    items: [
      { name: "Colosseum & Roman Forum Skip-the-Line Tour", category: "tours", mins: 180, area: "Centro Storico" },
      { name: "Vatican Museums & Sistine Chapel Entry", category: "museums", mins: 210, area: "Vatican" },
      { name: "Trastevere Twilight Food Tour", category: "food", mins: 180, area: "Trastevere" },
      { name: "Borghese Gallery Guided Visit", category: "culture", mins: 120, area: "Villa Borghese" },
      { name: "Pasta-Making Class in Monti", category: "food", mins: 150, area: "Monti" },
      { name: "Catacombs & Appian Way E-Bike", category: "adventure", mins: 240, area: "Appia Antica" },
      { name: "Sunset Tiber River Cruise", category: "water", mins: 75, area: "Centro Storico" },
      { name: "Ostia Antica Half-Day Trip", category: "outdoors", mins: 300, area: "Ostia" },
      { name: "Roman Ghost Evening Walk", category: "nightlife", mins: 120, area: "Centro Storico" },
      { name: "Gladiator School Family Workshop", category: "family", mins: 120, area: "Appia Antica" },
    ],
  },
  paris: {
    tier: 1.35,
    items: [
      { name: "Louvre Highlights Guided Tour", category: "museums", mins: 150, area: "1er" },
      { name: "Eiffel Tower Summit Access", category: "tours", mins: 120, area: "Champ de Mars" },
      { name: "Seine River Dinner Cruise", category: "water", mins: 150, area: "Rive Gauche" },
      { name: "Montmartre & Sacré-Cœur Walk", category: "culture", mins: 120, area: "Montmartre" },
      { name: "Marais Wine & Cheese Tasting", category: "food", mins: 120, area: "Le Marais" },
      { name: "Versailles Palace Day Trip", category: "outdoors", mins: 420, area: "Versailles" },
      { name: "Moulin Rouge Show Evening", category: "nightlife", mins: 120, area: "Pigalle" },
      { name: "Latin Quarter Macaron Workshop", category: "family", mins: 90, area: "Latin Quarter" },
      { name: "Catacombs of Paris Entry", category: "adventure", mins: 90, area: "Montparnasse" },
      { name: "Musée d'Orsay Impressionists Tour", category: "museums", mins: 120, area: "Rive Gauche" },
    ],
  },
  barcelona: {
    tier: 1.05,
    items: [
      { name: "Sagrada Família Fast-Track Tour", category: "tours", mins: 120, area: "Eixample" },
      { name: "Park Güell Guided Entry", category: "outdoors", mins: 90, area: "Gràcia" },
      { name: "Tapas & Vermouth Crawl", category: "food", mins: 180, area: "El Born" },
      { name: "Gothic Quarter History Walk", category: "culture", mins: 120, area: "Gothic Quarter" },
      { name: "Montserrat Mountain Day Trip", category: "outdoors", mins: 360, area: "Montserrat" },
      { name: "Sunset Catamaran Sail", category: "water", mins: 120, area: "Barceloneta" },
      { name: "Picasso Museum Skip-the-Line", category: "museums", mins: 90, area: "El Born" },
      { name: "Flamenco Night at Tablao", category: "nightlife", mins: 90, area: "Gothic Quarter" },
      { name: "Paella Cooking Class", category: "food", mins: 180, area: "Barceloneta" },
      { name: "Camp Nou Stadium Family Tour", category: "family", mins: 120, area: "Les Corts" },
    ],
  },
  athens: {
    tier: 0.85,
    items: [
      { name: "Acropolis & Parthenon Guided Tour", category: "tours", mins: 150, area: "Acropolis" },
      { name: "Acropolis Museum Entry", category: "museums", mins: 120, area: "Makrigianni" },
      { name: "Plaka & Anafiotika Food Walk", category: "food", mins: 180, area: "Plaka" },
      { name: "Cape Sounion Sunset Trip", category: "outdoors", mins: 300, area: "Sounion" },
      { name: "Athens Riviera Sailing", category: "water", mins: 240, area: "Vouliagmeni" },
      { name: "Ancient Agora Self-Guided Entry", category: "culture", mins: 90, area: "Monastiraki" },
      { name: "Greek Cooking Class", category: "food", mins: 180, area: "Koukaki" },
      { name: "Rooftop Bar Night Tour", category: "nightlife", mins: 120, area: "Monastiraki" },
      { name: "Delphi Full-Day Excursion", category: "adventure", mins: 600, area: "Delphi" },
      { name: "Mythology Family Treasure Hunt", category: "family", mins: 120, area: "Plaka" },
    ],
  },
  lisbon: {
    tier: 0.9,
    items: [
      { name: "Alfama Fado & Tapas Evening", category: "food", mins: 180, area: "Alfama" },
      { name: "Belém Tower & Monastery Tour", category: "tours", mins: 180, area: "Belém" },
      { name: "Sintra Palaces Day Trip", category: "outdoors", mins: 420, area: "Sintra" },
      { name: "Tram 28 & Old Town Walk", category: "culture", mins: 120, area: "Graça" },
      { name: "Tagus River Sunset Sail", category: "water", mins: 120, area: "Cais do Sodré" },
      { name: "Pastel de Nata Baking Class", category: "family", mins: 90, area: "Baixa" },
      { name: "LX Factory Street-Art Tour", category: "culture", mins: 120, area: "Alcântara" },
      { name: "Bairro Alto Bar Crawl", category: "nightlife", mins: 150, area: "Bairro Alto" },
      { name: "Cascais Coast E-Bike Ride", category: "adventure", mins: 240, area: "Cascais" },
      { name: "Time Out Market Food Tasting", category: "food", mins: 120, area: "Cais do Sodré" },
    ],
  },
};

const CATEGORIES: AttractionCategory[] = [
  "tours",
  "museums",
  "outdoors",
  "food",
  "nightlife",
  "family",
  "water",
  "culture",
  "adventure",
  "wellness",
];
const GENERIC_AREAS = ["Old Town", "City Center", "Waterfront", "Downtown"];

const SUMMARY_BY_CATEGORY: Record<AttractionCategory, string> = {
  tours: "A guided highlights tour with a local expert.",
  museums: "Skip-the-line entry to a landmark collection.",
  outdoors: "A day out in nature just beyond the city.",
  food: "Taste the city with a small-group food experience.",
  nightlife: "An evening out, local-style.",
  family: "Hands-on fun the whole family will enjoy.",
  water: "Time on the water with city views.",
  culture: "A walk through the stories that shaped the place.",
  adventure: "An active outing for a bit more of a thrill.",
  wellness: "Slow down and reset.",
};

function genericName(dest: string, category: AttractionCategory, i: number): string {
  const city = dest || "City";
  const noun: Record<AttractionCategory, string> = {
    tours: `${city} Highlights Walking Tour`,
    museums: `${city} City Museum Entry`,
    outdoors: `${city} Countryside Day Trip`,
    food: `${city} Street-Food Tasting`,
    nightlife: `${city} Night Bar Crawl`,
    family: `${city} Family Discovery Trail`,
    water: `${city} Sunset Boat Cruise`,
    culture: `${city} Old Town History Walk`,
    adventure: `${city} E-Bike Adventure`,
    wellness: `${city} Spa & Hammam Session`,
  };
  return `${noun[category]}${i >= 10 ? ` (${Math.floor(i / 10) + 1})` : ""}`;
}

export async function mockSearchAttractions(
  query: AttractionQuery,
): Promise<AttractionOffer[]> {
  // Simulate a real API call so the loading UX is exercised.
  await new Promise((r) => setTimeout(r, 800));

  const dest = (query.destination || "").trim();
  const key = dest.toLowerCase();
  const known = KNOWN[key];
  const tier = known?.tier ?? 1;
  const level = query.priceLevel ?? "mid";
  const priceMult = PRICE_MULTIPLIER[level] ?? 1;

  const seed = hashString(`${key}-${level}-${query.category ?? "all"}-${query.keyword ?? ""}`);
  const rand = makeRng(seed);

  const count = 9 + Math.floor(rand() * 5); // 9–13 activities (fuels show-more)
  const basePrice = 38 * tier; // per-person "from"

  const offers: AttractionOffer[] = [];
  for (let i = 0; i < count; i++) {
    const seedItem = known?.items[i % known.items.length];
    const category: AttractionCategory =
      query.category ??
      seedItem?.category ??
      CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const name = seedItem
      ? seedItem.name
      : genericName(dest, category, i);
    const area = seedItem?.area ?? GENERIC_AREAS[Math.floor(rand() * GENERIC_AREAS.length)];
    const durationMinutes = seedItem?.mins ?? [90, 120, 150, 180, 240, 300][Math.floor(rand() * 6)];

    const jitter = 0.7 + rand() * 0.7; // 0.70–1.40
    const fromPrice = Math.max(
      12,
      Math.round((basePrice * priceMult * jitter) / 5) * 5,
    );
    const distanceKm = Math.round((0.3 + rand() * 9) * 10) / 10; // 0.3–9.3 km

    offers.push({
      id: `mock-${seed.toString(36)}-${i}`,
      name,
      category,
      area,
      durationMinutes,
      fromPrice,
      currency: "EUR",
      distanceKm,
      summary: SUMMARY_BY_CATEGORY[category],
    });
  }

  // cheapest first (mock offers are always priced; ?? keeps the type honest)
  offers.sort((a, b) => (a.fromPrice ?? 0) - (b.fromPrice ?? 0));
  return offers;
}
