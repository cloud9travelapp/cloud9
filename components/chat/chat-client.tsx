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
      className={`flex ${size} flex-none items-center justify-center rounded-full bg-c-accent text-c-on-accent`}
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
      style={{ filter: "drop-shadow(0 8px 16px rgba(2,8,23,0.16))" }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -top-2.5 left-4 h-7 w-7 rounded-full bg-c-surface"
        />
        <span
          aria-hidden="true"
          className="absolute -top-4 left-9 h-11 w-11 rounded-full bg-c-surface"
        />
        <span
          aria-hidden="true"
          className="absolute -top-2 right-5 h-8 w-8 rounded-full bg-c-surface"
        />
        <div
          className="relative z-[1] bg-c-surface px-4 py-2.5 text-[15px] leading-relaxed text-c-ink"
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

const OPTIONS_START = "<<OPTIONS>>";
const OPTIONS_END = "<<END>>";

/**
 * Split an assistant message into its display text and any quick-reply options.
 * Everything from the <<OPTIONS>> marker onward is stripped from the text (so raw
 * markers/JSON never render, even mid-stream). Options are returned only when a
 * complete, valid block parses; any failure degrades to plain text.
 */
function splitOptions(content: string): {
  text: string;
  options: string[] | null;
} {
  const start = content.indexOf(OPTIONS_START);
  if (start === -1) return { text: content, options: null };
  const text = content.slice(0, start).trimEnd();
  const end = content.indexOf(OPTIONS_END, start);
  if (end === -1) return { text, options: null };
  const raw = content.slice(start + OPTIONS_START.length, end).trim();
  try {
    const parsed = JSON.parse(raw) as { options?: unknown };
    if (!Array.isArray(parsed.options)) return { text, options: null };
    const options = parsed.options
      .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      .slice(0, 4);
    return { text, options: options.length ? options : null };
  } catch {
    return { text, options: null };
  }
}

const FLIGHTS_START = "<<FLIGHTS>>";
const FLIGHTS_END = "<<END>>";

type FlightSegmentView = {
  origin: string;
  destination: string;
  departTime: string;
  arriveTime: string;
};
type FlightOfferView = {
  id: string;
  airlineName: string;
  segments: FlightSegmentView[];
  totalDurationMinutes: number;
  stops: number;
  price: number;
  currency: string;
};
type Lang = "he" | "en";
type FlightsPayload = { mock: boolean; lang: Lang; offers: FlightOfferView[] };

/**
 * Mirror of splitOptions for the <<FLIGHTS>> block. Strips from the marker so raw
 * JSON never shows; parses only a complete, valid block; any failure degrades to
 * plain text. Accepts `{ lang, mock, offers }` or a bare offers array. `lang`
 * defaults to "en" unless it is exactly "he".
 */
function splitFlights(content: string): {
  text: string;
  flights: FlightsPayload | null;
} {
  const start = content.indexOf(FLIGHTS_START);
  if (start === -1) return { text: content, flights: null };
  const text = content.slice(0, start).trimEnd();
  const end = content.indexOf(FLIGHTS_END, start);
  if (end === -1) return { text, flights: null };
  const raw = content.slice(start + FLIGHTS_START.length, end).trim();
  try {
    const parsed = JSON.parse(raw) as unknown;
    let mock = true;
    let lang: Lang = "en";
    let offersRaw: unknown;
    if (Array.isArray(parsed)) {
      offersRaw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as { mock?: unknown; lang?: unknown; offers?: unknown };
      offersRaw = obj.offers;
      mock = obj.mock !== false; // label unless explicitly false
      lang = obj.lang === "he" ? "he" : "en"; // default en unless exactly "he"
    }
    if (!Array.isArray(offersRaw)) return { text, flights: null };
    const offers = offersRaw.filter((o): o is FlightOfferView => {
      const x = o as Partial<FlightOfferView>;
      return (
        !!x &&
        typeof x.airlineName === "string" &&
        Array.isArray(x.segments) &&
        x.segments.length > 0 &&
        typeof x.price === "number"
      );
    });
    if (!offers.length) return { text, flights: null };
    return { text, flights: { mock, lang, offers: offers.slice(0, 8) } };
  } catch {
    return { text, flights: null };
  }
}

function isoTime(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2})/); // wall-clock time straight from the ISO
  return m ? m[1] : iso;
}
const LABELS: Record<
  Lang,
  {
    duration: (min: number) => string;
    stops: (n: number) => string;
    mock: string;
  }
> = {
  he: {
    duration: (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m === 0 ? `${h}ש` : `${h}ש ${m}ד`;
    },
    stops: (n) => (n <= 0 ? "ישיר" : n === 1 ? "עצירה אחת" : `${n} עצירות`),
    mock: "נתוני דמה",
  },
  en: {
    duration: (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    },
    stops: (n) => (n <= 0 ? "Direct" : n === 1 ? "1 stop" : `${n} stops`),
    mock: "Test data",
  },
};

function PlaneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-0.5 h-3.5 w-3.5 flex-none text-c-accent"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  );
}

function FlightCard({
  offer,
  mock,
  lang,
}: {
  offer: FlightOfferView;
  mock: boolean;
  lang: Lang;
}) {
  const L = LABELS[lang];
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const price =
    offer.currency === "USD"
      ? `$${offer.price}`
      : `${offer.price} ${offer.currency}`;
  const durationDir = lang === "he" ? "rtl" : "ltr";

  return (
    <div className="rounded-xl border border-c-border bg-c-surface px-3 py-2.5 shadow-sm">
      {/* airline (left) + price (right) */}
      <div dir="ltr" className="flex items-center justify-between gap-3">
        <span dir="auto" className="truncate text-sm font-semibold text-c-ink">
          {offer.airlineName}
        </span>
        <span className="flex-none text-lg font-bold text-c-accent tabular-nums">
          {price}
        </span>
      </div>

      {/* timeline — always LTR so departure stays on the left */}
      <div dir="ltr" className="mt-2 flex items-center gap-2">
        <div className="flex flex-col items-center">
          <span className="text-[15px] font-medium text-c-ink tabular-nums">
            {isoTime(first.departTime)}
          </span>
          <span className="text-xs text-c-muted">{first.origin}</span>
        </div>

        <div className="flex flex-1 flex-col items-center">
          <span dir={durationDir} className="text-[11px] text-c-muted tabular-nums">
            {L.duration(offer.totalDurationMinutes)}
          </span>
          <div className="my-1 flex w-full items-center">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-c-accent" />
            <span className="flex-1 border-t border-dashed border-c-accent/40" />
            <PlaneIcon />
            <span className="flex-1 border-t border-dashed border-c-accent/40" />
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-c-accent" />
          </div>
          <span dir={durationDir} className="text-[11px] text-c-muted">
            {L.stops(offer.stops)}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[15px] font-medium text-c-ink tabular-nums">
            {isoTime(last.arriveTime)}
          </span>
          <span className="text-xs text-c-muted">{last.destination}</span>
        </div>
      </div>

      {/* mock-data tag (per language, only while mock) */}
      {mock ? (
        <div dir="auto" className="mt-1.5 text-[10px] text-c-muted">
          {L.mock}
        </div>
      ) : null}
    </div>
  );
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

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || isStreaming) return;

    const now = new Date().toISOString();
    const wasNewTrip = currentTripId === null;
    let resolvedTripId = currentTripId;
    if (preset === undefined) setInput("");
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
        // Surface the server's actual reason (e.g. "Not authenticated",
        // "Server misconfigured...") so production failures are debuggable.
        let serverReason = "";
        try {
          serverReason = (await res.text()).slice(0, 500);
        } catch {
          /* body may be empty or already consumed */
        }
        console.error(
          `Chat request failed: HTTP ${res.status} ${res.statusText}`,
          serverReason,
        );
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
    <div className="flex h-full flex-col">
      {/* Header — frosted, floats over the sky */}
      <header className="flex items-center justify-between border-b border-c-border bg-c-surface/70 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open trips"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-c-ink transition-colors hover:bg-c-accent-soft md:hidden"
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
            className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-c-accent/40"
          >
            <CloudMark size="h-9 w-9" />
            <span className="leading-tight">
              <span className="block font-display text-sm font-bold text-c-ink">
                Cloud9 Concierge
              </span>
              <span className="flex items-center gap-1.5 text-xs text-c-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-c-accent" />
                online
              </span>
            </span>
          </Link>
        </div>
        <span className="w-9" aria-hidden="true" />
      </header>

      {/* Messages — the app-wide sky (SkyClouds + phase gradient) shows through */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 py-6">
        <div className="relative z-[1] mx-auto flex max-w-2xl flex-col gap-5">
          {isEmpty ? (
            <div className="mt-24 flex flex-col items-center text-center">
              <CloudMark size="h-16 w-16" />
              <h1 className="font-display mt-5 text-3xl font-extrabold tracking-tight text-c-ink">
                Where to next, {firstName}?
              </h1>
              <p className="mt-2 max-w-sm text-c-muted">
                Tell the Concierge what you&apos;re dreaming of. We&apos;ll take
                it from a spark to a plan.
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div key={i} className="flex flex-col items-end">
                    <div className="w-fit max-w-[82%] rounded-2xl bg-c-accent px-4 py-2.5 text-[15px] leading-relaxed text-c-on-accent shadow-sm">
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </div>
                    <span className="mt-1.5 px-1 text-[11px] text-c-muted">
                      {formatTime(m.created_at)}
                    </span>
                  </div>
                );
              }

              // Strip any special block from the display text, then decide
              // whether to show quick-reply pills or flight cards below.
              const opt = splitOptions(m.content);
              const options = opt.options;
              let text = opt.text;
              let flights: FlightsPayload | null = null;
              if (!options) {
                const fl = splitFlights(m.content);
                text = fl.text;
                flights = fl.flights;
              }
              const isLast = i === messages.length - 1;
              return (
                <div key={i} className="flex flex-col items-start pt-2">
                  <CloudBubble>
                    {text ? (
                      <span className="whitespace-pre-wrap">{text}</span>
                    ) : (
                      <span className="inline-flex gap-1 py-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-c-accent/50 [animation-delay:-0.2s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-c-accent/75 [animation-delay:-0.1s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-c-accent" />
                      </span>
                    )}
                  </CloudBubble>
                  <span className="mt-1.5 px-1 text-[11px] text-c-muted">
                    {formatTime(m.created_at)}
                  </span>
                  {options && isLast && !isStreaming ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {options.map((opt, oi) => (
                        <button
                          key={oi}
                          type="button"
                          dir="auto"
                          onClick={() => void send(opt)}
                          className="rounded-full border border-c-border bg-c-surface px-4 py-2 text-sm text-c-accent transition-colors hover:bg-c-accent-soft"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {flights ? (
                    <div className="mt-2 flex w-full max-w-[82%] flex-col gap-2">
                      {flights.offers.map((offer) => (
                        <FlightCard
                          key={offer.id}
                          offer={offer}
                          mock={flights.mock}
                          lang={flights.lang}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Composer — frosted, floats over the sky */}
      <div className="border-t border-c-border bg-c-surface/70 px-4 py-3 backdrop-blur sm:px-0">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message the Concierge…"
            className="max-h-40 flex-1 resize-none rounded-3xl border border-c-border bg-c-surface px-4 py-3 text-[15px] text-c-ink outline-none placeholder:text-c-muted focus:border-c-accent focus:ring-2 focus:ring-c-accent/25"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={isStreaming || !input.trim()}
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-c-accent text-c-on-accent shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
