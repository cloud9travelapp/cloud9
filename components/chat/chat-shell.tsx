"use client";

import { useEffect, useState } from "react";
import ChatClient from "./chat-client";
import TripSidebar, { type Trip } from "./trip-sidebar";
import type { Lang, StayOfferView } from "./message-parts";
import { providerFromOfferId, type TripFavorite } from "@/lib/favorites";

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

  /** Optimistic heart toggle. tripId comes from the CHAT's live state (a
   *  brand-new trip has an id from X-Trip-Id before the sidebar knows it). */
  async function toggleFavorite(
    tripId: string | null,
    offer: StayOfferView,
    lang: Lang,
  ) {
    if (!tripId) return;
    const hearted = favorites.some((f) => f.itemCode === offer.id);
    const fav: TripFavorite = {
      itemType: "stay",
      itemProvider: providerFromOfferId(offer.id),
      itemCode: offer.id,
      item: { ...offer, lang },
      createdAt: new Date().toISOString(),
    };
    setFavorites((prev) =>
      hearted ? prev.filter((f) => f.itemCode !== offer.id) : [fav, ...prev],
    );
    try {
      const res = hearted
        ? await fetch(
            `/api/trips/${tripId}/favorites?type=stay&code=${encodeURIComponent(offer.id)}`,
            { method: "DELETE" },
          )
        : await fetch(`/api/trips/${tripId}/favorites`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemType: "stay", item: { ...offer, lang } }),
          });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("Favorite toggle failed:", err);
      setFavorites((prev) =>
        hearted ? [fav, ...prev] : prev.filter((f) => f.itemCode !== offer.id),
      );
    }
  }

  const sidebarProps = {
    trips,
    activeTripId,
    favorites,
    onOpenFavorite: (f: TripFavorite) => {
      setFavoriteDetail(f);
      setDrawerOpen(false);
    },
    onUnheart: (f: TripFavorite) =>
      void toggleFavorite(
        activeTripId,
        f.item as unknown as StayOfferView,
        (f.item as { lang?: string }).lang === "en" ? "en" : "he",
      ),
  };

  return (
    <div dir="rtl" className="flex h-[100dvh] overflow-hidden">
      {/* Desktop sidebar */}
      <TripSidebar {...sidebarProps} className="hidden md:flex" />

      {/* Mobile drawer + scrim */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <TripSidebar
        {...sidebarProps}
        onNavigate={() => setDrawerOpen(false)}
        className="fixed inset-y-0 start-0 z-50 flex shadow-xl md:hidden"
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
