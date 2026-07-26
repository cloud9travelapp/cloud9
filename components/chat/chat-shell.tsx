"use client";

import { useEffect, useState } from "react";
import ChatClient from "./chat-client";
import TripSidebar, { type Trip } from "./trip-sidebar";
import type { Lang } from "./message-parts";
import {
  providerFromOfferId,
  type FavoriteItemType,
  type TripFavorite,
} from "@/lib/favorites";
import type { TimelineFailure } from "./journey/journey-pane";
import type { TimelineCategory, TimelineItem } from "@/lib/timeline/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export default function ChatShell({
  trips,
  activeTripId,
  initialMessages,
  firstName,
}: {
  trips: Trip[];
  activeTripId: string | null;
  initialMessages: Message[];
  firstName: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Trip favorites (hearts) live HERE — above both the chat (cards/modal
  // hearts) and the sidebar (the "מלונות שאהבתי" drawer), so one optimistic
  // list drives every surface.
  const [favorites, setFavorites] = useState<TripFavorite[]>([]);
  // A favorite tapped in the sidebar → the chat opens its detail modal.
  const [favoriteDetail, setFavoriteDetail] = useState<TripFavorite | null>(null);
  // Timeline items live here for the same reason favorites do: ChatClient
  // remounts on every trip switch (key={activeTripId}), the shell doesn't.
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  // A selection whose timeline write didn't land — kept so the מסע tab can
  // show it and offer a retry. Silent divergence would read as a broken
  // product: the concierge confirms a hotel that never reached the timeline.
  const [timelineFailure, setTimelineFailure] = useState<
    (TimelineFailure & { draft: Record<string, unknown> }) | null
  >(null);

  useEffect(() => {
    let alive = true;
    if (!activeTripId) {
      setTimeline([]);
      return;
    }
    setTimelineLoading(true);
    fetch(`/api/trips/${activeTripId}/timeline`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((d: { items?: TimelineItem[] }) => {
        if (!alive) return;
        setTimeline(d.items ?? []);
        setTimelineLoading(false);
      })
      .catch(() => alive && setTimelineLoading(false));
    return () => {
      alive = false;
    };
  }, [activeTripId]);

  /** Re-read the timeline after a write that the server owns (a selection
   *  riding along with a chat message, where the server mints the row). */
  async function refreshTimeline(tripId: string | null) {
    if (!tripId) return;
    try {
      const res = await fetch(`/api/trips/${tripId}/timeline`);
      if (!res.ok) return;
      const d = (await res.json()) as { items?: TimelineItem[] };
      setTimeline(d.items ?? []);
    } catch {
      /* leave the current list in place */
    }
  }

  async function addTimelineItem(
    tripId: string | null,
    draft: {
      title: string;
      date: string | null;
      startTime: string | null;
      category: TimelineCategory;
      notes: string | null;
    },
  ) {
    if (!tripId) return;
    const body = {
      ...draft,
      itemType: "manual",
      source: "manual",
      state: "planned",
      clientRef: crypto.randomUUID(),
    };
    try {
      const res = await fetch(`/api/trips/${tripId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { item: TimelineItem };
      setTimeline((prev) => [...prev, d.item]);
    } catch (err) {
      console.error("Timeline add failed:", err);
      setTimelineFailure({ clientRef: body.clientRef, title: draft.title, draft: body });
    }
  }

  async function updateTimelineItem(
    tripId: string | null,
    id: string,
    patch: Record<string, unknown>,
  ) {
    if (!tripId) return;
    const before = timeline;
    // Optimistic: marking "booked" should feel instant.
    setTimeline((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...(patch as Partial<TimelineItem>) } : i)),
    );
    try {
      const res = await fetch(`/api/trips/${tripId}/timeline/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { item: TimelineItem };
      setTimeline((prev) => prev.map((i) => (i.id === id ? d.item : i)));
    } catch (err) {
      console.error("Timeline update failed:", err);
      setTimeline(before);
    }
  }

  async function deleteTimelineItem(tripId: string | null, id: string) {
    if (!tripId) return;
    const before = timeline;
    setTimeline((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/trips/${tripId}/timeline/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("Timeline delete failed:", err);
      setTimeline(before);
    }
  }

  /** Retry a selection's failed timeline write. Idempotent server-side on
   *  clientRef, so a retry can never duplicate the item. */
  async function retryTimelineFailure(tripId: string | null) {
    if (!tripId || !timelineFailure) return;
    try {
      const res = await fetch(`/api/trips/${tripId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timelineFailure.draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTimelineFailure(null);
      await refreshTimeline(tripId);
    } catch (err) {
      console.error("Timeline retry failed:", err);
    }
  }

  useEffect(() => {
    let alive = true;
    if (!activeTripId) {
      setFavorites([]);
      return;
    }
    fetch(`/api/trips/${activeTripId}/favorites`)
      .then((res) => (res.ok ? res.json() : { favorites: [] }))
      .then(
        (d: { favorites?: TripFavorite[] }) =>
          alive && setFavorites(d.favorites ?? []),
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [activeTripId]);

  /** Optimistic heart toggle — item-type generic (stays and flights today;
   *  future agents reuse it untouched). tripId comes from the CHAT's live
   *  state (a brand-new trip has an id from X-Trip-Id before the sidebar
   *  knows it). */
  async function toggleFavorite(
    tripId: string | null,
    itemType: FavoriteItemType,
    item: { id: string } & Record<string, unknown>,
    lang: Lang,
  ) {
    if (!tripId) return;
    const hearted = favorites.some(
      (f) => f.itemType === itemType && f.itemCode === item.id,
    );
    const fav: TripFavorite = {
      itemType,
      itemProvider: providerFromOfferId(item.id),
      itemCode: item.id,
      item: { ...item, lang },
      createdAt: new Date().toISOString(),
    };
    setFavorites((prev) =>
      hearted
        ? prev.filter((f) => !(f.itemType === itemType && f.itemCode === item.id))
        : [fav, ...prev],
    );
    try {
      const res = hearted
        ? await fetch(
            `/api/trips/${tripId}/favorites?type=${itemType}&code=${encodeURIComponent(item.id)}`,
            { method: "DELETE" },
          )
        : await fetch(`/api/trips/${tripId}/favorites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemType, item: { ...item, lang } }),
          });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("Favorite toggle failed:", err);
      setFavorites((prev) =>
        hearted
          ? [fav, ...prev]
          : prev.filter((f) => !(f.itemType === itemType && f.itemCode === item.id)),
      );
    }
  }

  const sidebarProps = {
    trips,
    activeTripId,
    favorites,
    // Stays open the detail modal; flights have no detail surface yet.
    onOpenFavorite: (f: TripFavorite) => {
      if (f.itemType !== "stay") return;
      setFavoriteDetail(f);
      setDrawerOpen(false);
    },
    onUnheart: (f: TripFavorite) =>
      void toggleFavorite(
        activeTripId,
        f.itemType,
        f.item as { id: string } & Record<string, unknown>,
        (f.item as { lang?: string }).lang === "en" ? "en" : "he",
      ),
  };

  return (
    <div dir="rtl" className="flex h-[100dvh] overflow-hidden">
      {/* Desktop sidebar */}
      <TripSidebar {...sidebarProps} className="hidden md:flex" />

      {/* Mobile drawer + scrim — the scrim matches the detail modal's
          phase-tinted treatment (one scrim language across the app). */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 backdrop-blur-sm transition-opacity md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          background: "color-mix(in srgb, var(--c-bg-1) 60%, rgba(2,8,23,0.35))",
        }}
      />
      <TripSidebar
        {...sidebarProps}
        onNavigate={() => setDrawerOpen(false)}
        className="fixed inset-y-0 start-0 z-50 flex shadow-float md:hidden"
        style={{ transform: drawerOpen ? "translateX(0)" : "translateX(100%)" }}
      />

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatClient
          key={activeTripId ?? "new"}
          tripId={activeTripId}
          initialMessages={initialMessages}
          firstName={firstName}
          onMenuClick={() => setDrawerOpen(true)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          openFavoriteDetail={favoriteDetail}
          onFavoriteDetailShown={() => setFavoriteDetail(null)}
          timeline={timeline}
          timelineLoading={timelineLoading}
          tripCreatedAt={
            trips.find((t) => t.id === activeTripId)?.created_at ?? null
          }
          timelineFailure={timelineFailure}
          onRetryTimeline={(tripId) => void retryTimelineFailure(tripId)}
          onTimelineWriteFailed={(f) => setTimelineFailure(f)}
          onTimelineWritten={(tripId) => void refreshTimeline(tripId)}
          onAddTimelineItem={(tripId, draft) => addTimelineItem(tripId, draft)}
          onUpdateTimelineItem={(tripId, id, patch) =>
            updateTimelineItem(tripId, id, patch)
          }
          onDeleteTimelineItem={(tripId, id) => deleteTimelineItem(tripId, id)}
        />
      </div>
    </div>
  );
}
