// Cloud9 mark — Classic chosen; this is the signature-refinement round.
// All flat, single-colour (fill: currentColor), no gradients. The signature
// detail is designed to survive at 16px or degrade gracefully.

type MarkProps = { className?: string };

/** The chosen base: a refined rounded cloud with a soft flat base. */
export function CloudMarkClassic({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="16" width="19" height="8" rx="4" />
      <circle cx="11" cy="16" r="5" />
      <circle cx="18" cy="12.5" r="6.5" />
      <circle cx="23.5" cy="16" r="4.5" />
    </svg>
  );
}

/** A — "9 tail": the lower-right edge curls down like a 9's descender.
 *  Reads as a cloud first; the 9 reveals itself on a second look. */
export function CloudMarkTail({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="16" width="19" height="8" rx="4" />
      <circle cx="11" cy="16" r="5" />
      <circle cx="18" cy="12.5" r="6.5" />
      <circle cx="23.5" cy="16" r="4.5" />
      <path d="M25 21c1 3 .3 6-2.5 7.4c-.7.35-1.6.1-1.95-.6c-.33-.66-.08-1.5.6-1.85C22.8 24.9 23.2 23.3 23 21Z" />
    </svg>
  );
}

/** B — "9 bite": a small round negative-space notch scooped from the base
 *  (FedEx-arrow style hidden detail). Single concave path, no mask. */
export function CloudMarkBite({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 16 H21 A4 4 0 0 1 25 20 A4 4 0 0 1 21 24 H19.5 A2.5 2.5 0 0 0 14.5 24 H10 A4 4 0 0 1 6 20 A4 4 0 0 1 10 16 Z" />
      <circle cx="11" cy="16" r="5" />
      <circle cx="18" cy="12.5" r="6.5" />
      <circle cx="23.5" cy="16" r="4.5" />
    </svg>
  );
}

/** C — "Floating puff": the smallest bump detaches, floating free up-right —
 *  lightness, a cloud-nine feeling. */
export function CloudMarkPuff({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <rect x="5.5" y="16" width="15" height="8" rx="4" />
      <circle cx="10.5" cy="16" r="5" />
      <circle cx="16" cy="12.5" r="6" />
      <circle cx="25" cy="9" r="2.8" />
    </svg>
  );
}

export const REFINED_MARKS = [
  { id: "classic", name: "Classic (original)", Mark: CloudMarkClassic, note: "No signature — the baseline" },
  { id: "tail", name: "A · 9 tail", Mark: CloudMarkTail, note: "Lower-right curls into a 9's tail" },
  { id: "bite", name: "B · 9 bite", Mark: CloudMarkBite, note: "Round negative-space notch in the base" },
  { id: "puff", name: "C · Floating puff", Mark: CloudMarkPuff, note: "Smallest bump floats free" },
] as const;
