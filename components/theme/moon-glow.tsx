/**
 * One very soft, heavily blurred warm radial glow in an upper corner — quiet
 * moonlight over the soft night base. Fixed, pointer-inert, behind content.
 * (Used by the night V2 comparison; kept only if V2 is chosen.)
 */
export default function MoonGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -right-32 -top-32 h-[42rem] w-[42rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,224,178,0.20), rgba(255,224,178,0.06) 55%, transparent 72%)",
          filter: "blur(48px)",
        }}
      />
    </div>
  );
}
