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
        />
      </div>
    </div>
  );
}
