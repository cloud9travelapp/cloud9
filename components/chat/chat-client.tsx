"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CloudMark,
  CloudBubble,
  UserBubble,
  LoadingDots,
  QuickReplyPills,
  FlightCard,
  StayCard,
  DateCalendar,
  type FlightOfferView,
  type FlightsPayload,
  type StayOfferView,
  type StaysPayload,
  type DatesPayload,
  type Lang,
} from "./message-parts";
import HeroDithering from "@/components/landing/hero-dithering";

// Starter prompts shown on the empty state (interface language: English).
const INSPIRATION = [
  "Romantic weekend in Europe",
  "Family trip to Japan",
  "A week in the Greek islands",
  "Surprise me ✨",
];

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

function formatTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Assistant messages may carry ONE trailing special block (<<OPTIONS>>,
// <<FLIGHTS>>, <<STAYS>> … <<END>>).
//
// For DISPLAY we strip everything from the first "<<" onward — bulletproof
// against a complete marker, a partial marker still streaming in (e.g.
// "<<FLIGH"), or a slightly-malformed one, so raw block content is NEVER shown.
// For PARSING we match markers tolerantly (case- and inner-whitespace-
// insensitive), so cards still render even if the model formats a marker oddly.
function displayText(content: string): string {
  const i = content.indexOf("<<");
  return (i === -1 ? content : content.slice(0, i)).trimEnd();
}

function blockRaw(content: string, tag: string): string | null {
  const open = new RegExp(`<<\\s*${tag}\\s*>>`, "i").exec(content);
  if (!open) return null;
  const rest = content.slice(open.index + open[0].length);
  const end = /<<\s*END\s*>>/i.exec(rest);
  if (!end) return null;
  return rest.slice(0, end.index).trim();
}

/**
 * Split an assistant message into its display text and any quick-reply options.
 * Options are returned only when a complete, valid block parses; any failure
 * degrades to plain text. The display text never contains raw block markup.
 */
function splitOptions(content: string): {
  text: string;
  options: string[] | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "OPTIONS");
  if (raw === null) return { text, options: null };
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

/**
 * Mirror of splitOptions for the <<FLIGHTS>> block. Accepts `{ lang, mock,
 * offers }` or a bare offers array. `lang` defaults to "en" unless exactly "he".
 * Any failure degrades to plain text; the display text never shows raw markup.
 */
function splitFlights(content: string): {
  text: string;
  flights: FlightsPayload | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "FLIGHTS");
  if (raw === null) return { text, flights: null };
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

/**
 * Mirror of splitFlights for the <<STAYS>> block. `lang` defaults to "en" unless
 * exactly "he". Any failure degrades to plain text; the display text never shows
 * raw markup.
 */
function splitStays(content: string): {
  text: string;
  stays: StaysPayload | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "STAYS");
  if (raw === null) return { text, stays: null };
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
    if (!Array.isArray(offersRaw)) return { text, stays: null };
    const offers = offersRaw.filter((o): o is StayOfferView => {
      const x = o as Partial<StayOfferView>;
      return (
        !!x &&
        typeof x.name === "string" &&
        typeof x.type === "string" &&
        typeof x.pricePerNight === "number"
      );
    });
    if (!offers.length) return { text, stays: null };
    return { text, stays: { mock, lang, offers: offers.slice(0, 8) } };
  } catch {
    return { text, stays: null };
  }
}

/**
 * Mirror of splitOptions for the <<DATES>> block. Any valid JSON object yields
 * a calendar (mode defaults to "range", lang to "en"; DateCalendar itself
 * clamps min/max to the future). Any failure degrades to plain text.
 */
function splitDates(content: string): {
  text: string;
  dates: DatesPayload | null;
} {
  const text = displayText(content);
  const raw = blockRaw(content, "DATES");
  if (raw === null) return { text, dates: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { text, dates: null };
    }
    const obj = parsed as { lang?: unknown; mode?: unknown; min?: unknown; max?: unknown };
    return {
      text,
      dates: {
        lang: obj.lang === "he" ? "he" : "en", // default en unless exactly "he"
        mode: obj.mode === "single" ? "single" : "range",
        min: typeof obj.min === "string" ? obj.min : undefined,
        max: typeof obj.max === "string" ? obj.max : undefined,
      },
    };
  } catch {
    return { text, dates: null };
  }
}

/**
 * Purely-visual smooth reveal for the streaming assistant message. The network
 * text is the target; the shown slice catches up a few characters per frame,
 * draining any backlog with a ~300ms time constant so it never trails the
 * stream noticeably — and the parent snaps to the plain full text the moment
 * the stream ends. Honors prefers-reduced-motion (shows text as it arrives).
 */
export function StreamedText({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  const targetRef = useRef(text);
  targetRef.current = text;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(Number.MAX_SAFE_INTEGER);
      return;
    }
    let raf = 0;
    const tick = () => {
      setShown((s) => {
        const t = targetRef.current.length;
        return s >= t ? s : Math.min(t, s + Math.max(1, Math.ceil((t - s) / 18)));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  let cut = Math.min(shown, text.length);
  // Never split a surrogate pair (emoji) at the reveal edge.
  if (cut > 0 && cut < text.length) {
    const c = text.charCodeAt(cut - 1);
    if (c >= 0xd800 && c <= 0xdbff) cut -= 1;
  }
  return <span className="whitespace-pre-wrap">{text.slice(0, cut)}</span>;
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

      {/* Messages — the app-wide sky (SkyClouds + phase gradient) shows through.
         On the empty state the living Dithering mist is present too, like the
         landing hero. */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 py-6">
        {isEmpty ? <HeroDithering /> : null}
        <div className="relative z-[1] mx-auto flex max-w-2xl flex-col gap-5">
          {isEmpty ? (
            <div className="mt-24 flex flex-col items-center text-center">
              <CloudMark size="h-16 w-16" />
              <h1
                dir="auto"
                className="font-display mt-5 text-3xl font-extrabold tracking-tight text-c-ink"
              >
                Where to next, <bdi>{firstName}</bdi>?
              </h1>
              <p className="mt-2 max-w-sm text-c-muted">
                Tell the Concierge what you&apos;re dreaming of. We&apos;ll take
                it from a spark to a plan.
              </p>
              <QuickReplyPills
                options={INSPIRATION}
                onSelect={(t) => void send(t)}
                className="mt-6 justify-center"
              />
            </div>
          ) : (
            messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div key={i} className="msg-enter flex flex-col items-end">
                    <UserBubble content={m.content} />
                    <span className="mt-1.5 px-1 text-[11px] text-c-muted">
                      {formatTime(m.created_at)}
                    </span>
                  </div>
                );
              }

              // Strip any special block from the display text, then decide
              // whether to show flight cards, stay cards, quick-reply pills, or
              // a date calendar below (mutually exclusive: one block per
              // message). CARDS WIN TIES: offers are checked before options, so
              // if a message ever carries both an offers block and an OPTIONS
              // block, the cards render and the pills are dropped — never the
              // reverse.
              let options: string[] | null = null;
              let flights: FlightsPayload | null = null;
              let stays: StaysPayload | null = null;
              let dates: DatesPayload | null = null;
              let text: string;
              const fl = splitFlights(m.content);
              if (fl.flights) {
                text = fl.text;
                flights = fl.flights;
              } else {
                const st = splitStays(m.content);
                if (st.stays) {
                  text = st.text;
                  stays = st.stays;
                } else {
                  const opt = splitOptions(m.content);
                  if (opt.options) {
                    text = opt.text;
                    options = opt.options;
                  } else {
                    const dt = splitDates(m.content);
                    text = dt.text;
                    dates = dt.dates;
                  }
                }
              }
              const isLast = i === messages.length - 1;
              // A message that is ONLY a block (no lead-in text) renders just
              // its block — no empty bubble stuck on the thinking indicator.
              const hasBlock = !!(options || flights || stays || dates);
              return (
                <div key={i} className="msg-enter flex flex-col items-start pt-2">
                  {text || !hasBlock ? (
                    <>
                      <CloudBubble>
                        {text ? (
                          isLast && isStreaming ? (
                            <StreamedText text={text} />
                          ) : (
                            <span className="whitespace-pre-wrap">{text}</span>
                          )
                        ) : (
                          <LoadingDots />
                        )}
                      </CloudBubble>
                      <span className="mt-1.5 px-1 text-[11px] text-c-muted">
                        {formatTime(m.created_at)}
                      </span>
                    </>
                  ) : null}
                  {options && isLast && !isStreaming ? (
                    <QuickReplyPills
                      options={options}
                      onSelect={(o) => void send(o)}
                    />
                  ) : null}
                  {flights ? (
                    <div className="mt-2 flex w-full max-w-[82%] flex-col gap-2">
                      {flights.offers.map((offer) => (
                        <FlightCard
                          key={offer.id}
                          offer={offer}
                          mock={flights.mock}
                          lang={flights.lang}
                          onSelect={(s) => void send(s)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {stays ? (
                    <div className="mt-2 flex w-full max-w-[82%] flex-col gap-2">
                      {stays.offers.map((offer) => (
                        <StayCard
                          key={offer.id}
                          offer={offer}
                          mock={stays.mock}
                          lang={stays.lang}
                          onSelect={(s) => void send(s)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {/* Like the pills, the calendar is only actionable on the
                      latest message — stale calendars don't linger in history. */}
                  {dates && isLast && !isStreaming ? (
                    <div className="mt-2 w-full max-w-[82%]">
                      <DateCalendar
                        mode={dates.mode}
                        lang={dates.lang}
                        min={dates.min}
                        max={dates.max}
                        onSelect={(s) => void send(s)}
                      />
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
