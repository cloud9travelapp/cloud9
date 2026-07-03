"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 15.9" />
    </svg>
  );
}

/** Deep-sky circle with a white cloud — the Concierge mark. */
function CloudMark({ size = "h-9 w-9" }: { size?: string }) {
  return (
    <span
      className={`flex ${size} flex-none items-center justify-center rounded-full bg-sky-deep text-white`}
    >
      <CloudIcon className="h-1/2 w-1/2" />
    </span>
  );
}

/**
 * A real cloud bubble: a rounded body plus overlapping "puff" lobes rising off
 * the top, all the same cloud-white. The single drop-shadow on the wrapper
 * traces the whole silhouette, so it reads as one soft cloud — not a blob.
 */
function CloudBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-fit max-w-[82%]"
      style={{ filter: "drop-shadow(0 10px 16px rgba(3,105,161,0.18))" }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -top-2.5 left-4 h-7 w-7 rounded-full bg-cloud"
        />
        <span
          aria-hidden="true"
          className="absolute -top-4 left-9 h-11 w-11 rounded-full bg-cloud"
        />
        <span
          aria-hidden="true"
          className="absolute -top-2 right-5 h-8 w-8 rounded-full bg-cloud"
        />
        <div
          className="relative z-[1] bg-cloud px-4 py-2.5 text-[15px] leading-relaxed text-ink"
          style={{ borderRadius: "26px 24px 28px 22px / 22px 28px 24px 26px" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function formatTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatClient({
  initialMessages,
  firstName,
  tripId,
  onMenuClick,
}: {
  initialMessages: Message[];
  firstName: string;
  tripId: string | null;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [currentTripId, setCurrentTripId] = useState<string | null>(tripId);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const now = new Date().toISOString();
    const wasNewTrip = currentTripId === null;
    let resolvedTripId = currentTripId;
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, created_at: now },
      { role: "assistant", content: "", created_at: now },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, tripId: currentTripId }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const headerTripId = res.headers.get("X-Trip-Id");
      if (headerTripId) {
        resolvedTripId = headerTripId;
        setCurrentTripId(headerTripId);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          content:
            "The sky's a little cloudy right now — I couldn't reach you. Try again in a moment.",
        };
        return next;
      });
    } finally {
      setIsStreaming(false);
      // Reflect the trip in the URL + sidebar. A brand-new trip navigates to its
      // own URL; an existing one just refreshes the sidebar (name/order).
      if (wasNewTrip && resolvedTripId) {
        router.push(`/chat?trip=${resolvedTripId}`);
      } else {
        router.refresh();
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background:
          "linear-gradient(to bottom, #c9e8fb 0%, #dff1fd 38%, #f0f9ff 100%)",
      }}
    >
      {/* Header — floats over the sky */}
      <header className="flex items-center justify-between border-b border-white/50 bg-white/55 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open trips"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-white/70 md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          ) : null}
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-deep/40"
          >
            <CloudMark size="h-9 w-9" />
            <span className="leading-tight">
              <span className="block font-display text-sm font-bold text-ink">
                Cloud9 Concierge
              </span>
              <span className="flex items-center gap-1.5 text-xs text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                online
              </span>
            </span>
          </Link>
        </div>
        <span className="w-9" aria-hidden="true" />
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 py-6">
        {/* ambient sky clouds */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="cloud-drift absolute left-6 top-10 h-24 w-56 rounded-full bg-white/50 blur-2xl" />
          <div className="cloud-drift-slow absolute right-0 top-40 h-28 w-72 rounded-full bg-white/45 blur-2xl" />
          <div className="cloud-drift absolute left-1/4 top-80 h-24 w-64 rounded-full bg-white/40 blur-2xl" />
        </div>

        <div className="relative z-[1] mx-auto flex max-w-2xl flex-col gap-5">
          {isEmpty ? (
            <div className="mt-24 flex flex-col items-center text-center">
              <CloudMark size="h-16 w-16" />
              <h1 className="font-display mt-5 text-3xl font-extrabold tracking-tight text-ink">
                Where to next, {firstName}?
              </h1>
              <p className="mt-2 max-w-sm text-slate-warm">
                Tell the Concierge what you&apos;re dreaming of. We&apos;ll take
                it from a spark to a plan.
              </p>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex flex-col items-end">
                  <div className="w-fit max-w-[82%] rounded-2xl bg-teal-ink px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm">
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                  <span className="mt-1.5 px-1 text-[11px] text-slate-warm">
                    {formatTime(m.created_at)}
                  </span>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start pt-2">
                  <CloudBubble>
                    {m.content ? (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    ) : (
                      <span className="inline-flex gap-1 py-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-sky-deep/60 [animation-delay:-0.2s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-sky-deep/80 [animation-delay:-0.1s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-sky-deep" />
                      </span>
                    )}
                  </CloudBubble>
                  <span className="mt-1.5 px-1 text-[11px] text-slate-warm">
                    {formatTime(m.created_at)}
                  </span>
                </div>
              ),
            )
          )}
        </div>
      </div>

      {/* Composer — floats over the sky */}
      <div className="border-t border-white/50 bg-white/60 px-4 py-3 backdrop-blur sm:px-0">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message the Concierge…"
            className="max-h-40 flex-1 resize-none rounded-3xl border border-slate-warm/20 bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-slate-warm/70 focus:border-sky-deep focus:ring-2 focus:ring-sky-deep/20"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={isStreaming || !input.trim()}
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-sky-deep text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
