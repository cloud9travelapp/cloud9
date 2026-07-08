"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudMarkClassic } from "@/components/brand/cloud-marks";

export type Trip = { id: string; name: string; created_at: string };

// Dates follow the interface language (English), not the browser/OS locale, so
// the sidebar never mixes English trip names with e.g. Hebrew dates.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function TripSidebar({
  trips,
  activeTripId,
  className = "",
  style,
  onNavigate,
}: {
  trips: Trip[];
  activeTripId: string | null;
  className?: string;
  style?: React.CSSProperties;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function saveRename(tripId: string) {
    const name = draft.trim();
    setRenamingId(null);
    const current = trips.find((t) => t.id === tripId)?.name;
    if (!name || name.length > 60 || name === current) return;
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) console.error(`Rename failed: HTTP ${res.status}`);
    } catch (err) {
      console.error("Rename failed:", err);
    }
    router.refresh();
  }

  return (
    <aside
      style={style}
      className={`w-72 shrink-0 flex-col border-e border-c-border bg-c-surface/80 backdrop-blur ${className}`}
    >
      {/* New trip */}
      <div className="p-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-2xl bg-c-accent px-4 py-3 text-sm font-semibold text-c-on-accent shadow-sm transition-opacity hover:opacity-90"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Trip
        </Link>
      </div>

      {/* Trip list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {trips.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-c-muted">
            No trips yet.
            <br />
            Start one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {trips.map((t) => {
              const active = t.id === activeTripId;
              const renaming = t.id === renamingId;
              if (renaming) {
                // Editing state: a plain row (no Link, so typing can't navigate)
                // with an inline input. Enter/blur saves, Escape cancels.
                return (
                  <li key={t.id}>
                    <div className="flex items-center gap-2.5 rounded-xl bg-c-accent-soft px-3 py-2.5 ring-1 ring-inset ring-c-accent/25">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-c-accent text-c-on-accent"
                      >
                        <CloudMarkClassic className="h-4 w-4" />
                      </span>
                      <input
                        autoFocus
                        dir="auto"
                        value={draft}
                        maxLength={60}
                        aria-label="Trip name"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void saveRename(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveRename(t.id);
                          } else if (e.key === "Escape") {
                            setRenamingId(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-c-accent/40 bg-c-surface px-2 py-1 font-display text-sm font-semibold text-c-ink outline-none focus:ring-2 focus:ring-c-accent/25"
                      />
                    </div>
                  </li>
                );
              }
              return (
                <li key={t.id}>
                  <Link
                    href={`/chat?trip=${t.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors ${
                      active
                        ? "bg-c-accent-soft ring-1 ring-inset ring-c-accent/25"
                        : "hover:bg-c-accent-soft/60"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                        active
                          ? "bg-c-accent text-c-on-accent"
                          : "bg-c-accent-soft text-c-accent"
                      }`}
                    >
                      <CloudMarkClassic className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        dir="auto"
                        className={`block truncate font-display text-sm font-semibold ${
                          active ? "text-c-accent" : "text-c-ink"
                        }`}
                      >
                        {t.name}
                      </span>
                      <span className="block text-xs text-c-muted">
                        {formatDate(t.created_at)}
                      </span>
                    </span>
                    {active ? (
                      <button
                        type="button"
                        aria-label="Rename trip"
                        title="Rename"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraft(t.name);
                          setRenamingId(t.id);
                        }}
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-c-muted transition-colors hover:bg-c-surface hover:text-c-accent"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-c-border p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-c-muted transition-colors hover:text-c-ink"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-c-accent text-c-on-accent">
            <CloudMarkClassic className="h-3.5 w-3.5" />
          </span>
          Cloud9
        </Link>
      </div>
    </aside>
  );
}
