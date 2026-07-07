// Cloud-mark candidates for Cloud9. Each is a flat, single-colour SVG
// (fill: currentColor — colour comes from tokens), built from soft filled
// shapes so it stays legible at 16px and clean at 512px. One will be chosen;
// the rest deleted.

type MarkProps = { className?: string };

/** Option 1 — Classic: a refined rounded cloud with a soft flat base. */
export function CloudMark1({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="16" width="19" height="8" rx="4" />
      <circle cx="11" cy="16" r="5" />
      <circle cx="18" cy="12.5" r="6.5" />
      <circle cx="23.5" cy="16" r="4.5" />
    </svg>
  );
}

/** Option 2 — Lift: bumps ascend to the right, so the silhouette tilts upward
 *  — a hint of flight without a plane. */
export function CloudMark2({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <rect x="5" y="18" width="15" height="6.5" rx="3.25" />
      <rect x="16.5" y="12" width="10" height="8.5" rx="4.25" />
      <circle cx="9" cy="18" r="4.2" />
      <circle cx="14.5" cy="15" r="5.4" />
      <circle cx="20.5" cy="11.5" r="4.8" />
    </svg>
  );
}

/** Option 3 — Cloud-9: a stylised "9" (ring with a counter + tail) topped with
 *  two cloud puffs — the name fused into the mark. */
export function CloudMark3({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8 13a8 8 0 1 1 16 0 8 8 0 1 1 -16 0 Z M16 9.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0 -6.8 Z"
      />
      <path d="M23 14C23.6 18.5 22 22.6 18 25.6c-.8.6-1.9.4-2.5-.4-.6-.8-.4-1.9.4-2.5C18.8 20.5 20 18 20 14Z" />
      <circle cx="11.5" cy="7.5" r="2.5" />
      <circle cx="20.5" cy="7.5" r="2.3" />
    </svg>
  );
}

/** Option 4 — Minimal: three overlapping soft circles, an abstract puff cloud. */
export function CloudMark4({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="10.5" cy="17.5" r="5.5" />
      <circle cx="17" cy="13.5" r="7" />
      <circle cx="22.5" cy="17.5" r="5" />
    </svg>
  );
}

export const CLOUD_MARKS = [
  { id: 1, name: "Classic", Mark: CloudMark1, note: "Refined rounded cloud, soft flat base" },
  { id: 2, name: "Lift", Mark: CloudMark2, note: "Ascending bumps — a hint of flight" },
  { id: 3, name: "Cloud-9", Mark: CloudMark3, note: "Stylised 9 with cloud puffs" },
  { id: 4, name: "Minimal", Mark: CloudMark4, note: "Three soft overlapping circles" },
] as const;
