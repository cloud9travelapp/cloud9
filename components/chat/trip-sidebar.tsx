"use client";

import Link from "next/link";

export type Trip = { id: string; name: string; created_at: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
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
  return (
    <aside
      style={style}
      className={`w-72 shrink-0 flex-col border-r border-slate-warm/15 bg-white/85 backdrop-blur ${className}`}
    >
      {/* New trip */}
      <div className="p-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-2xl bg-sky-deep px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#075985]"
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
          <p className="px-3 py-8 text-center text-sm text-slate-warm">
            No trips yet.
            <br />
            Start one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {trips.map((t) => {
              const active = t.id === activeTripId;
              return (
                <li key={t.id}>
                  <Link
                    href={`/chat?trip=${t.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors ${
                      active
                        ? "bg-sky-deep/10 ring-1 ring-inset ring-sky-deep/20"
                        : "hover:bg-cloud"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                        active ? "bg-sky-deep text-white" : "bg-cloud text-sky-deep"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.9" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate font-display text-sm font-semibold ${
                          active ? "text-sky-deep" : "text-ink"
                        }`}
                      >
                        {t.name}
                      </span>
                      <span className="block text-xs text-slate-warm">
                        {formatDate(t.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-warm/15 p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-warm transition-colors hover:text-ink"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-deep text-white">
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
              <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.9" />
            </svg>
          </span>
          Cloud9
        </Link>
      </div>
    </aside>
  );
}
