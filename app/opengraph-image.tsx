import { ImageResponse } from "next/og";

// Social share image (og + twitter). Fixed SUNSET palette — warm, inviting,
// travel-feeling — since og images can't be dynamic. The lockup (stacked) over
// the sky with the hero line.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cloud9 — Plan less. Wander more.";

const CLOUD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 3 24 24" fill="#ffffff"><rect x="6" y="16" width="19" height="8" rx="4"/><circle cx="11" cy="16" r="5"/><circle cx="18" cy="12.5" r="6.5"/><circle cx="23.5" cy="16" r="4.5"/></svg>`;

// Fetch Suez One as TTF. Google Fonts serves TTF to the default (no-UA) fetch;
// a browser UA would return woff2, which Satori can't use.
async function suezOne(): Promise<ArrayBuffer> {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=Suez+One",
  ).then((r) => r.text());
  const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("Suez One font URL not found");
  return fetch(url).then((r) => r.arrayBuffer());
}

export default async function OpengraphImage() {
  const font = await suezOne();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Suez One",
          background:
            "linear-gradient(155deg, #ffedd8 0%, #ffd0a8 52%, #ffb98a 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            width={168}
            height={168}
            src={`data:image/svg+xml;utf8,${encodeURIComponent(CLOUD)}`}
            alt=""
          />
          <div style={{ fontSize: 104, color: "#3d2416", lineHeight: 1 }}>
            Cloud9
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            display: "flex",
            gap: 18,
            fontSize: 62,
            color: "#3d2416",
          }}
        >
          <span>Plan less.</span>
          <span style={{ color: "#c44d1d" }}>Wander more.</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Suez One", data: font, style: "normal", weight: 400 }],
    },
  );
}
