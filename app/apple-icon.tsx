import { ImageResponse } from "next/og";

// Apple touch icon (home-screen). Full-bleed brand-blue square + white cloud
// (iOS applies its own rounded mask). Generated as PNG.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const CLOUD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 3 24 24" fill="#ffffff"><rect x="6" y="16" width="19" height="8" rx="4"/><circle cx="11" cy="16" r="5"/><circle cx="18" cy="12.5" r="6.5"/><circle cx="23.5" cy="16" r="4.5"/></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0369a1",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={120}
          height={120}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(CLOUD)}`}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
