// The Cloud9 mark — a refined rounded cloud, flat and single-colour
// (fill: currentColor, no gradients, so colour comes from tokens). The viewBox
// is cropped tight to the cloud (its bbox is x6–28, y6–24) so the mark fills its
// frame — no dead padding — for balanced lockups and crisp favicons.

type MarkProps = { className?: string; style?: React.CSSProperties };

export function CloudMarkClassic({ className, style }: MarkProps) {
  return (
    <svg viewBox="5 3 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <rect x="6" y="16" width="19" height="8" rx="4" />
      <circle cx="11" cy="16" r="5" />
      <circle cx="18" cy="12.5" r="6.5" />
      <circle cx="23.5" cy="16" r="4.5" />
    </svg>
  );
}
