import type { Metadata } from "next";
import { Suez_One, Heebo } from "next/font/google";
import "./globals.css";
import TimeOfDay from "@/components/theme/time-of-day";
import SkyClouds from "@/components/theme/sky-background";

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

export const metadata: Metadata = {
  title: "Cloud9 — AI Travel Concierge",
  description:
    "Plan less, wander more. Cloud9 is your AI travel concierge for trips that plan themselves.",
};

// Set the sky phase from the user's local time BEFORE first paint, so the
// palette is correct on load with no flash and no layout shift.
const PHASE_SCRIPT = `(function(){try{var h=new Date().getHours();var p=h>=5&&h<8?'sunrise':h<11?'morning':h<16?'midday':h<19?'sunset':'night';document.documentElement.dataset.phase=p;}catch(e){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: PHASE_SCRIPT }} />
        <TimeOfDay />
        <SkyClouds />
        {children}
      </body>
    </html>
  );
}
