import type { Metadata } from "next";
import Script from "next/script";
import { Suez_One, Heebo } from "next/font/google";
import "./globals.css";
import TimeOfDay from "@/components/theme/time-of-day";
import SkyClouds from "@/components/theme/sky-background";
import NightStars from "@/components/theme/night-stars";

// Suez One — display only (big moments). Heebo — body & UI. Both cover
// Hebrew + Latin so the bilingual type looks intentional in either language.
const displayFace = Suez_One({
  variable: "--font-suez",
  subsets: ["latin", "hebrew"],
  weight: ["400"],
  display: "swap",
});

const bodyFace = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const SITE_DESCRIPTION =
  "Plan less, wander more. Cloud9 is your AI travel concierge for trips that plan themselves.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: "Cloud9 — AI Travel Concierge",
  description: SITE_DESCRIPTION,
  // og:image / twitter:image are supplied automatically by app/opengraph-image.tsx
  openGraph: {
    title: "Cloud9 — AI Travel Concierge",
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: "Cloud9",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cloud9 — AI Travel Concierge",
    description: SITE_DESCRIPTION,
  },
};

// Set the sky phase from the user's local time BEFORE first paint, so the
// palette is correct on load with no flash and no layout shift.
// Keep this mapping in sync with phaseForHour() in components/theme/time-of-day.tsx.
// Bands are fully bounded so 00:00–04:59 falls through to night (the old
// open-ended `h<11` painted the small hours as daytime "morning").
const PHASE_SCRIPT = `(function(){try{var h=new Date().getHours();var p=h>=5&&h<8?'sunrise':h>=8&&h<11?'morning':h>=11&&h<16?'midday':h>=16&&h<19?'sunset':'night';document.documentElement.dataset.phase=p;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFace.variable} ${bodyFace.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="phase-init" strategy="beforeInteractive">
          {PHASE_SCRIPT}
        </Script>
        <TimeOfDay />
        <SkyClouds />
        <NightStars />
        {children}
      </body>
    </html>
  );
}
