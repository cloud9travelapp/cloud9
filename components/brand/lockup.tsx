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
}: {
  orientation?: "horizontal" | "stacked";
  className?: string;
  style?: React.CSSProperties;
}) {
  const horizontal = orientation === "horizontal";
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
        className={cn(
          "flex-none text-c-accent",
          horizontal ? "h-[1.5em] w-[1.5em]" : "h-[1.85em] w-[1.85em]",
        )}
      />
      <span className="font-extrabold tracking-tight text-c-ink">Cloud9</span>
    </span>
  );
}
