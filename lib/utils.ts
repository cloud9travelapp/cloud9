/**
 * Join class names, dropping any falsy values.
 *
 * A dependency-free helper for conditionally composing Tailwind class
 * strings, e.g. `cn("p-4", isActive && "bg-blue-500")`.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
