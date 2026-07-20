"use client";

// TEMPORARY preview route for the hotel detail modal — review only.
// Renders the modal on deterministic mock data (no auth, no API), Hebrew and
// English, plus a phase switcher. Delete after Max's review.

import { useEffect, useState } from "react";
import type { StayDetail } from "@/lib/stays/types";
import { mockStayDetail } from "@/lib/stays/mock-detail";
import {
  StayDetailModal,
  type CloseVariant,
  type GalleryNav,
} from "@/components/chat/stay-detail-modal";
import type { Lang } from "@/components/chat/message-parts";

const PHASES = ["midday", "sunrise", "sunset", "night"] as const;
const CLOSE_VARIANTS: CloseVariant[] = ["circle", "puff", "ghost"];
const GALLERY_NAVS: GalleryNav[] = ["fade", "dots"];
// Stable placeholder photos so the gallery variants are reviewable.
const PREVIEW_IMAGES = Array.from(
  { length: 5 },
  (_, i) => `https://picsum.photos/seed/cloud9-${i}/640/440`,
);

export default function ModalPreviewPage() {
  const [detail, setDetail] = useState<StayDetail | null>(null);
  const [lang, setLang] = useState<Lang>("he");
  const [phase, setPhase] = useState<(typeof PHASES)[number]>("midday");
  const [closeVariant, setCloseVariant] = useState<CloseVariant>("circle");
  const [galleryNav, setGalleryNav] = useState<GalleryNav>("fade");
  const [open, setOpen] = useState(true);
  const [posted, setPosted] = useState<string | null>(null);

  useEffect(() => {
    void mockStayDetail("mock-preview-1").then((d) =>
      setDetail({ ...d, images: PREVIEW_IMAGES }),
    );
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-phase", phase);
  }, [phase]);

  return (
    <main className="min-h-screen bg-c-bg-1 p-6">
      <div className="flex flex-wrap gap-2">
        {PHASES.map((p) => (
          <button key={p} type="button" onClick={() => setPhase(p)}
            className={`rounded-full border border-c-border px-3 py-1 text-xs ${p === phase ? "bg-c-accent text-c-on-accent" : "bg-c-surface text-c-ink"}`}>
            {p}
          </button>
        ))}
        <button type="button" onClick={() => setLang(lang === "he" ? "en" : "he")}
          className="rounded-full border border-c-border bg-c-surface px-3 py-1 text-xs text-c-ink">
          lang: {lang}
        </button>
        {CLOSE_VARIANTS.map((v) => (
          <button key={v} type="button" onClick={() => setCloseVariant(v)}
            className={`rounded-full border border-c-border px-3 py-1 text-xs ${v === closeVariant ? "bg-c-accent text-c-on-accent" : "bg-c-surface text-c-ink"}`}>
            close: {v}
          </button>
        ))}
        {GALLERY_NAVS.map((v) => (
          <button key={v} type="button" onClick={() => setGalleryNav(v)}
            className={`rounded-full border border-c-border px-3 py-1 text-xs ${v === galleryNav ? "bg-c-accent text-c-on-accent" : "bg-c-surface text-c-ink"}`}>
            gallery: {v}
          </button>
        ))}
        <button type="button" onClick={() => { setOpen(true); setPosted(null); }}
          className="rounded-full bg-c-accent px-3 py-1 text-xs text-c-on-accent">
          open modal
        </button>
      </div>
      {posted ? (
        <p data-testid="posted" dir="auto" className="mt-4 text-sm text-c-ink">
          {posted}
        </p>
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
          onSelectRoom={(s) => {
            setPosted(s);
            setOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}
