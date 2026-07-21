/**
 * Warm-premium hero atmosphere — replaces the WebGL dither "fog".
 * Pure CSS/SVG (no shader dependency), phase-token driven, reduced-motion safe.
 * A soft 3-stop radial mesh + a gentle "sun through cloud" bloom, dressed with
 * a fine grain film. All colour comes from the active phase tokens, so it lives
 * with the clock. See globals.css `.atmo-hero` / `.grain`.
 */
export default function HeroAtmosphere() {
  return (
    <div aria-hidden="true" className="atmo grain atmo-hero">
      <span className="bloom" />
    </div>
  );
}
