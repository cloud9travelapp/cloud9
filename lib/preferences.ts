/**
 * Lightweight keyword detection for travel preferences. When the user mentions
 * one of these themes, we remember it on their profile so the Concierge can
 * tailor future conversations.
 */
const PREFERENCE_KEYWORDS: Record<string, RegExp> = {
  hotel: /\bhotels?\b/i,
  budget: /\bbudget|cheap|affordable|low[- ]?cost\b/i,
  luxury: /\bluxur(y|ious)|five[- ]?star|5[- ]?star|premium\b/i,
  family: /\bfamil(y|ies)|kids?|children\b/i,
  adventure: /\badventure|hiking|trekking|outdoors?\b/i,
  romantic: /\bromantic|honeymoon|anniversary\b/i,
  beach: /\bbeach|coast|seaside|island\b/i,
  foodie: /\bfood(ie)?|cuisine|restaurants?|dining\b/i,
};

/** Return the set of preference tags detected in a message. */
export function detectPreferences(message: string): string[] {
  return Object.entries(PREFERENCE_KEYWORDS)
    .filter(([, pattern]) => pattern.test(message))
    .map(([tag]) => tag);
}

/** Merge newly detected tags into an existing list, keeping it unique. */
export function mergePreferences(existing: string[], detected: string[]): string[] {
  return Array.from(new Set([...existing, ...detected]));
}
