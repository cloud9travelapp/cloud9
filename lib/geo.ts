/**
 * Deterministic point roughly `km` away from an anchor, in a bearing drawn
 * from a caller-supplied seeded RNG so mock data stays reproducible.
 *
 * Returns {} when there is no anchor — a mock may fabricate a plausible
 * position around a KNOWN city center, but it must never invent a location
 * out of nothing: a pin on the wrong continent is worse than no pin.
 */
export function scatterAround(
  lat: number | undefined,
  lng: number | undefined,
  km: number,
  rand: () => number,
): { latitude?: number; longitude?: number } {
  // Drawn BEFORE the anchor check on purpose: the RNG sequence must not depend
  // on whether coordinates were supplied, or the same mock query would return
  // different hotels with and without a searched point.
  const bearing = rand() * Math.PI * 2;
  if (typeof lat !== "number" || typeof lng !== "number") return {};
  const dLat = (km / 111) * Math.cos(bearing);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Near the poles the longitude scale collapses; don't divide by ~0.
  const dLng =
    Math.abs(cosLat) < 1e-6 ? 0 : (km / (111 * cosLat)) * Math.sin(bearing);
  return {
    latitude: Math.round((lat + dLat) * 1e5) / 1e5,
    longitude: Math.round((lng + dLng) * 1e5) / 1e5,
  };
}
