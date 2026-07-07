"use client";

// TEMPORARY preview route for the <<DATES>> calendar block — review only.
// Shows every mode × language combination under a day and a night phase.
// Delete this file when the calendar is wired into the chat.

import { useState } from "react";
import {
  DateCalendar,
  UserBubble,
  type DateMode,
  type Lang,
} from "@/components/chat/message-parts";

function Demo({
  lang,
  mode,
  caption,
}: {
  lang: Lang;
  mode: DateMode;
  caption: string;
}) {
  const [sent, setSent] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-c-muted">{caption}</span>
      <DateCalendar lang={lang} mode={mode} onSelect={setSent} />
      {sent ? (
        <div className="flex max-w-[340px] flex-col items-end gap-1">
          <UserBubble content={sent} />
          <span className="text-[10px] text-c-muted">
            ↑ this exact text is posted as the user&apos;s message
          </span>
        </div>
      ) : null}
    </div>
  );
}

const PHASES: { phase: string; title: string }[] = [
  { phase: "midday", title: "Day (midday)" },
  { phase: "night", title: "Night" },
];

export default function DatesPreviewPage() {
  return (
    <main className="min-h-screen">
      {PHASES.map(({ phase, title }) => (
        <section
          key={phase}
          data-phase={phase}
          className="px-4 py-8 sm:px-8"
          style={{
            background: "linear-gradient(180deg, var(--c-bg-1), var(--c-bg-2))",
          }}
        >
          <h2 className="font-display text-xl font-bold text-c-ink">{title}</h2>
          <div className="mt-4 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            <Demo lang="he" mode="range" caption="עברית · טווח תאריכים (range)" />
            <Demo lang="he" mode="single" caption="עברית · תאריך אחד (single)" />
            <Demo lang="en" mode="range" caption="English · range" />
            <Demo lang="en" mode="single" caption="English · single" />
          </div>
        </section>
      ))}
      <footer className="px-4 py-6 text-xs text-c-muted sm:px-8">
        Temporary preview — this route is deleted after review.
      </footer>
    </main>
  );
}
