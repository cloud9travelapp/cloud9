import { CloudMarkClassic } from "./cloud-marks";
import { cn } from "@/lib/utils";

/**
 * The Cloud9 lockup: the Classic mark + "Cloud9" in Suez One.
 *
 * Proportion rules — everything scales from the wordmark's font-size (1em), so
 * a single `font-size`/`text-*` on the consumer sizes the whole lockup:
 *   • mark = accent token (--c-accent); wordmark = ink (--c-ink)
 *   • horizontal: mark 1.5em tall, gap 0.34em, vertically centered
 *   • stacked:    mark 1.85em tall, gap 0.22em, horizontally centered
 *   • wordmark: Suez One (font-display), extra-bold, tight tracking
 *   • keep clear space ≥ 0.5em around the lockup
 */
export function Lockup({
  orientation = "horizontal",
  className,
  style,
  markScale,
  float = false,
}: {
  orientation?: "horizontal" | "stacked";
  className?: string;
  style?: React.CSSProperties;
  /** Mark height in em, relative to the wordmark. Defaults: 1.8 horizontal,
   *  1.85 stacked. */
  markScale?: number;
  /** Living treatment (web only): the cloud drifts gently and its colour is the
   *  phase accent. Gated under prefers-reduced-motion. Leave off for exported
   *  assets (favicon/og). */
  float?: boolean;
}) {
  const horizontal = orientation === "horizontal";
  const scale = markScale ?? (horizontal ? 1.8 : 1.85);
  return (
    <span
      style={style}
      className={cn(
        "inline-flex font-display leading-none",
        horizontal
          ? "flex-row items-center gap-[0.34em]"
          : "flex-col items-center gap-[0.22em]",
        className,
      )}
    >
      <CloudMarkClassic
        className={cn("flex-none text-c-accent", float && "logo-float")}
        style={{ width: `${scale}em`, height: `${scale}em` }}
      />
      <span className="font-extrabold tracking-tight text-c-ink">Cloud9</span>
    </span>
  );
}
