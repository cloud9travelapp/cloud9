"use client";

import { useState } from "react";
import ChatClient from "./chat-client";
import TripSidebar, { type Trip } from "./trip-sidebar";

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

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-cloud">
      {/* Desktop sidebar */}
      <TripSidebar
        trips={trips}
        activeTripId={activeTripId}
        className="hidden md:flex"
      />

      {/* Mobile drawer + scrim */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <TripSidebar
        trips={trips}
        activeTripId={activeTripId}
        onNavigate={() => setDrawerOpen(false)}
        className="fixed inset-y-0 left-0 z-50 flex shadow-xl md:hidden"
        style={{ transform: drawerOpen ? "translateX(0)" : "translateX(-100%)" }}
      />

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatClient
          key={activeTripId ?? "new"}
          tripId={activeTripId}
          initialMessages={initialMessages}
          firstName={firstName}
          onMenuClick={() => setDrawerOpen(true)}
        />
      </div>
    </div>
  );
}
