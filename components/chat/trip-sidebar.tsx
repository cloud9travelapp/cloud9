"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudMarkClassic } from "@/components/brand/cloud-marks";
import {
  groupFavorites,
  type FavoriteItemType,
  type TripFavorite,
} from "@/lib/favorites";
import { HeartButton } from "./message-parts";

export type Trip = { id: string; name: string; created_at: string };

// Favorites drawer section labels (product wording — Hebrew-first, per Max).
const FAVORITE_GROUP_LABELS: Record<FavoriteItemType, string> = {
  stay: "מלונות שאהבתי",
  flight: "טיסות שאהבתי",
  attraction: "אטרקציות שאהבתי",
  restaurant: "מסעדות שאהבתי",
};

/** One favorites row, type-aware: stays show name · ★ · price/night and tap
 *  opens the detail modal; flights show airline · route · price (no detail
 *  surface yet, so no tap target). The filled heart unhearts. */
function FavoriteRow({
  favorite,
  onOpen,
  onUnheart,
}: {
  favorite: TripFavorite;
  /** Absent = the row has no detail surface (e.g. flights) — not clickable. */
  onOpen?: () => void;
  onUnheart: () => void;
}) {
  const item = favorite.item as {
    name?: string;
    stars?: number;
    pricePerNight?: number;
    price?: number;
    currency?: string;
    id?: string;
    airlineName?: string;
    segments?: Array<{ origin?: string; destination?: string }>;
  };
  const isFlight = favorite.itemType === "flight";
  const title = isFlight
    ? (item.airlineName ?? favorite.itemCode)
    : (item.name ?? favorite.itemCode);
  const amount = isFlight ? item.price : item.pricePerNight;
  const price =
    typeof amount === "number"
      ? item.currency === "USD"
        ? `$${amount}`
        : item.currency === "EUR"
          ? `€${amount}`
          : `${amount} ${item.currency ?? ""}`.trim()
      : null;
  const route =
    isFlight && item.segments?.length
      ? `${item.segments[0].origin ?? ""}→${item.segments[item.segments.length - 1].destination ?? ""}`
      : null;
  const mock = (item.id ?? "").startsWith("mock-");
  const body = (
    <>
      <span dir="auto" className="block truncate text-sm font-semibold text-c-ink">
        {title}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-c-muted">
        {route ? <span dir="ltr">{route}</span> : null}
        {!isFlight && item.stars ? (
          <span className="text-c-accent">{"★".repeat(item.stars)}</span>
        ) : null}
        {price ? <span dir="ltr" className="tabular-nums">{price}</span> : null}
        {mock ? <span>נתוני דמה</span> : null}
      </span>
    </>
  );
  return (
    <div className="group flex items-center gap-2 rounded-card px-2 py-1.5 transition-colors hover:bg-c-accent-soft/60">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1 text-start">{body}</div>
      )}
      <HeartButton active label="הסר מהמועדפים" onToggle={onUnheart} />
    </div>
  );
}

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
  favorites = [],
  onOpenFavorite,
  onUnheart,
  className = "",
  style,
  onNavigate,
}: {
  trips: Trip[];
  activeTripId: string | null;
  favorites?: TripFavorite[];
  onOpenFavorite?: (f: TripFavorite) => void;
  onUnheart?: (f: TripFavorite) => void;
  className?: string;
  style?: React.CSSProperties;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const favoriteGroups = groupFavorites(favorites);
  // Deleting cascades to the conversation, the hearts and the timeline, so the
  // confirmation states the real blast radius rather than a generic warning.
  const [deleting, setDeleting] = useState<{
    trip: Trip;
    counts: { messages: number; favorites: number; timelineItems: number } | null;
    busy: boolean;
  } | null>(null);

  async function openDeleteConfirm(trip: Trip) {
    setDeleting({ trip, counts: null, busy: false });
    try {
      const res = await fetch(`/api/trips/${trip.id}`);
      if (!res.ok) return;
      const counts = (await res.json()) as {
        messages: number;
        favorites: number;
        timelineItems: number;
      };
      setDeleting((d) => (d && d.trip.id === trip.id ? { ...d, counts } : d));
    } catch {
      /* the confirmation still works, just without the counts */
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { trip } = deleting;
    setDeleting({ ...deleting, busy: true });
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleting(null);
      // Leaving the trip you just deleted must land somewhere valid — /chat
      // renders the zero-trip state correctly when it was the last one.
      if (trip.id === activeTripId) router.push("/chat");
      router.refresh();
    } catch (err) {
      console.error("Trip delete failed:", err);
      setDeleting((d) => (d ? { ...d, busy: false } : d));
    }
  }

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
    <>
      {deleting ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{
            background:
              "color-mix(in srgb, var(--c-bg-1) 60%, rgba(2,8,23,0.35))",
          }}
          onClick={() => !deleting.busy && setDeleting(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-panel border border-c-border bg-c-surface p-5 shadow-float"
          >
            <h2 className="font-display text-lg font-bold text-c-ink">
              למחוק את הטיול?
            </h2>
            <p
              dir="auto"
              className="mt-1 truncate text-sm font-semibold text-c-accent [unicode-bidi:plaintext]"
            >
              {deleting.trip.name}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-c-muted">
              {deleting.counts
                ? `יימחקו גם השיחה, ${deleting.counts.favorites} מועדפים ו-${deleting.counts.timelineItems} פריטים במסע. אי אפשר לשחזר.`
                : "יימחקו גם השיחה, המועדפים והפריטים במסע. אי אפשר לשחזר."}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                disabled={deleting.busy}
                onClick={() => void confirmDelete()}
                className="rounded-full bg-c-accent px-5 py-2.5 text-sm font-semibold text-c-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting.busy ? "מוחק…" : "מחיקה"}
              </button>
              <button
                type="button"
                disabled={deleting.busy}
                onClick={() => setDeleting(null)}
                className="px-3 py-2.5 text-sm text-c-muted transition-opacity hover:opacity-70"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}

    <aside
      style={style}
      className={`w-72 shrink-0 flex-col border-e border-c-border bg-c-surface/80 backdrop-blur ${className}`}
    >
      {/* New trip */}
      <div className="p-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-full bg-c-accent px-4 py-3 text-sm font-semibold text-c-on-accent shadow-rest transition-opacity hover:opacity-90"
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
                    <div className="flex items-center gap-2.5 rounded-card bg-c-accent-soft px-3 py-2.5 ring-1 ring-inset ring-c-accent/25">
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
                    className={`group flex items-center gap-2.5 rounded-card px-3 py-2.5 transition-colors ${
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
                    {/* Rename + delete on EVERY row, not just the active one.
                        The pencil used to render only for the active trip and
                        sat inside the link, so a mistitled trip you weren't
                        currently in could not be fixed at all. Always mounted
                        (opacity only) so it works on touch, where there is no
                        hover. */}
                    <span className="flex flex-none items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`שינוי שם: ${t.name}`}
                        title="שינוי שם"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraft(t.name);
                          setRenamingId(t.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-c-muted transition-colors hover:bg-c-surface hover:text-c-accent"
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
                      <button
                        type="button"
                        aria-label={`מחיקת הטיול: ${t.name}`}
                        title="מחיקה"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void openDeleteConfirm(t);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-c-muted transition-colors hover:bg-c-surface hover:text-c-accent"
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
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Favorites drawer — the trip's hearted items, grouped by type.
          Hidden entirely until something is hearted; survives card
          replacement and reloads (persisted server-side). */}
      {activeTripId && favorites.length > 0 ? (
        <div className="border-t border-c-border px-2 py-2">
          <button
            type="button"
            aria-expanded={favoritesOpen}
            onClick={() => setFavoritesOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-card px-2 py-1.5 transition-colors hover:bg-c-accent-soft/60"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 flex-none text-c-accent"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            <span className="flex-1 text-start font-display text-sm font-semibold text-c-ink">
              מועדפים · {favorites.length}
            </span>
            <svg
              viewBox="0 0 24 24"
              className={`h-3.5 w-3.5 flex-none text-c-muted transition-transform ${favoritesOpen ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {favoritesOpen ? (
            <div className="scroll-soft mt-1 flex max-h-56 flex-col gap-2 overflow-y-auto">
              {(Object.keys(favoriteGroups) as FavoriteItemType[]).map((type) => (
                <div key={type}>
                  <div className="px-2 pb-0.5 text-[11px] font-semibold text-c-muted">
                    {FAVORITE_GROUP_LABELS[type]}
                  </div>
                  {favoriteGroups[type]!.map((f) => (
                    <FavoriteRow
                      key={`${f.itemType}|${f.itemCode}`}
                      favorite={f}
                      onOpen={
                        f.itemType === "stay" && onOpenFavorite
                          ? () => onOpenFavorite(f)
                          : undefined
                      }
                      onUnheart={() => onUnheart?.(f)}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
    </>
  );
}
