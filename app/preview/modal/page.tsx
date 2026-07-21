"use client";

// TEMPORARY specimen sheet for the modal design round — delete after picks.
// Every variant is visible at once, labeled, with live hover states; the
// previous version auto-opened the modal, whose scrim hid the switchers
// (the "only one variant" failure). Open the full modal per combination
// from any specimen.

import { useRef, useState } from "react";
import type { StayDetail } from "@/lib/stays/types";
import { mockStayDetail } from "@/lib/stays/mock-detail";
import {
  ModalCloseButton,
  StayDetailModal,
  type CloseVariant,
  type GalleryNav,
} from "@/components/chat/stay-detail-modal";
import type { Lang } from "@/components/chat/message-parts";
import { useEffect } from "react";

const PHASES = ["midday", "sunrise", "sunset", "night"] as const;
const PREVIEW_IMAGES = Array.from(
  { length: 5 },
  (_, i) => `https://picsum.photos/seed/cloud9-${i}/640/440`,
);

const CLOSE_SPECIMENS: { v: CloseVariant; label: string }[] = [
  { v: "circle", label: "(a) עיגול רך — soft circle" },
  { v: "cloud", label: "(b) ענן עדין — subtle cloud" },
  { v: "halo", label: "(c) X חשוף + הילה — bare X, hover halo" },
];
const NAV_SPECIMENS: { v: GalleryNav; label: string }[] = [
  { v: "fade", label: "(1) דהיית קצוות — edge fades" },
  { v: "dotsBelow", label: "(2) נקודות מתחת — dots below" },
  { v: "dotsOverlay", label: "(3) נקודות על התמונה — dots on photo" },
];

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === active ? "w-4 bg-c-accent" : "w-1.5 bg-c-border"
          }`}
        />
      ))}
    </>
  );
}

function MiniGallery({ nav }: { nav: GalleryNav }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (el) setActive(Math.min(4, Math.round(Math.abs(el.scrollLeft) / 184)));
        }}
        className="scroll-hide flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      >
        {PREVIEW_IMAGES.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" loading="lazy"
            className="h-28 w-44 flex-none snap-center rounded-xl object-cover" />
        ))}
      </div>
      {nav === "fade" ? (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-6"
            style={{ background: "linear-gradient(to right, var(--c-surface), transparent)" }} />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6"
            style={{ background: "linear-gradient(to left, var(--c-surface), transparent)" }} />
        </>
      ) : nav === "dotsOverlay" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-c-surface/75 px-2.5 py-1.5 backdrop-blur-sm">
            <Dots count={5} active={active} />
          </div>
        </div>
      ) : (
        <div className="mt-2 flex justify-center gap-1.5">
          <Dots count={5} active={active} />
        </div>
      )}
    </div>
  );
}

export default function ModalPreviewPage() {
  const [detail, setDetail] = useState<StayDetail | null>(null);
  const [lang, setLang] = useState<Lang>("he");
  const [phase, setPhase] = useState<(typeof PHASES)[number]>("midday");
  const [closeVariant, setCloseVariant] = useState<CloseVariant>("circle");
  const [galleryNav, setGalleryNav] = useState<GalleryNav>("fade");
  const [open, setOpen] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);

  useEffect(() => {
    void mockStayDetail("mock-preview-1").then((d) =>
      setDetail({ ...d, images: PREVIEW_IMAGES }),
    );
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-phase", phase);
  }, [phase]);

  const chip = (selected: boolean) =>
    `rounded-full border border-c-border px-3 py-1 text-xs transition-colors ${
      selected ? "bg-c-accent text-c-on-accent" : "bg-c-surface text-c-ink"
    }`;

  return (
    <main className="min-h-screen bg-c-bg-1 p-5 pb-16 sm:p-8">
      <h1 className="font-display text-xl font-bold text-c-ink">
        Modal design picks
      </h1>
      <div className="mt-3 flex flex-wrap gap-2">
        {PHASES.map((p) => (
          <button key={p} type="button" onClick={() => setPhase(p)} className={chip(p === phase)}>
            {p}
          </button>
        ))}
        <button type="button" onClick={() => setLang(lang === "he" ? "en" : "he")} className={chip(false)}>
          lang: {lang}
        </button>
      </div>

      {/* ── Decision 1: close button ─────────────────────────────── */}
      <h2 className="font-display mt-8 text-base font-bold text-c-ink">
        1 · כפתור הסגירה (עומדים על הכוונה: X עדין, מיכל בגוון השעה, ריחוף מרכך)
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {CLOSE_SPECIMENS.map(({ v, label }) => (
          <div key={v} data-specimen={`close-${v}`}
            className={`rounded-2xl border bg-c-surface p-4 ${closeVariant === v ? "border-c-accent" : "border-c-border"}`}>
            <p dir="auto" className="text-xs font-semibold text-c-muted">{label}</p>
            <div className="mt-3 flex h-16 items-center justify-center rounded-xl border border-c-border/60">
              <ModalCloseButton variant={v} label="סגירה" onClose={() => {}} />
            </div>
            <button type="button"
              onClick={() => { setCloseVariant(v); setOpen(true); setPosted(null); }}
              className="mt-3 w-full rounded-full bg-c-accent px-3 py-1.5 text-xs font-semibold text-c-on-accent">
              פתח מודל עם זה
            </button>
          </div>
        ))}
      </div>

      {/* ── Decision 2: gallery nav ──────────────────────────────── */}
      <h2 className="font-display mt-8 text-base font-bold text-c-ink">
        2 · ניווט הגלריה (גללו את הגלריות — הנקודות חיות)
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {NAV_SPECIMENS.map(({ v, label }) => (
          <div key={v} data-specimen={`nav-${v}`}
            className={`rounded-2xl border bg-c-surface p-4 ${galleryNav === v ? "border-c-accent" : "border-c-border"}`}>
            <div className="flex items-center justify-between gap-3">
              <p dir="auto" className="text-xs font-semibold text-c-muted">{label}</p>
              <button type="button"
                onClick={() => { setGalleryNav(v); setOpen(true); setPosted(null); }}
                className="rounded-full bg-c-accent px-3 py-1.5 text-xs font-semibold text-c-on-accent">
                פתח מודל עם זה
              </button>
            </div>
            <div className="mt-3">
              <MiniGallery nav={v} />
            </div>
          </div>
        ))}
      </div>

      <p dir="auto" className="mt-6 text-xs text-c-muted">
        המודל המלא נפתח עם השילוב האחרון שנבחר ({closeVariant} × {galleryNav}) — סגרו אותו כדי לחזור לדף הזה.
      </p>
      {posted ? (
        <p data-testid="posted" dir="auto" className="mt-2 text-sm text-c-ink">{posted}</p>
      ) : null}

      {open && detail ? (
        <StayDetailModal
          hotelId="mock-preview-1"
          hotelName={lang === "he" ? "מלון הדוגמה" : "Sample Hotel"}
          lang={lang}
          preload={detail}
          closeVariant={closeVariant}
          galleryNav={galleryNav}
          onClose={() => setOpen(false)}
          onSelectRoom={(s) => { setPosted(s); setOpen(false); }}
        />
      ) : null}
    </main>
  );
}
