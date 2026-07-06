/**
 * Ambient sky clouds that sit behind all app content (fixed, -z-10). They're
 * tinted by the active phase via the --c-cloud token, drift slowly, and are
 * pointer-inert + aria-hidden so they add atmosphere without ever competing
 * with text. Motion is gated by prefers-reduced-motion in globals.css.
 */
export default function SkyClouds() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <span
        className="sky-cloud cloud-drift"
        style={{ top: "6%", insetInlineStart: "-10%", width: "44rem", height: "18rem" }}
      />
      <span
        className="sky-cloud cloud-drift-slow"
        style={{ top: "38%", insetInlineEnd: "-12%", width: "52rem", height: "20rem" }}
      />
      <span
        className="sky-cloud cloud-drift"
        style={{ top: "68%", insetInlineStart: "16%", width: "34rem", height: "15rem" }}
      />
    </div>
  );
}
