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
  StaySortChips,
  ShowMoreButton,
  DateCalendar,
  type Lang,
  type StayOfferView,
  type StaySortMode,
  type StaysPayload,
} from "./message-parts";
import { StayDetailModal } from "./stay-detail-modal";
import {
  collectShownStayIds,
  hasErrorMarker,
  parseAssistantMessage,
  sortStayOffers,
  splitMore,
} from "@/lib/chat/blocks";
import { isFavorite, type TripFavorite } from "@/lib/favorites";
import HeroAtmosphere from "@/components/landing/hero/hero-atmosphere";

// Starter prompts shown on the empty state (interface language: English).
const INSPIRATION = [
  "Romantic weekend in Europe",
  "Family trip to Japan",
  "A week in the Greek islands",
  "Surprise me",
];

type Message = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  /** Local-only: a connection-error bubble (never persisted) — renders with a
   *  retry affordance while it's the latest message. */
  error?: boolean;
};

// Connection-error bubble + retry label, localized by the FAILED message's
// language (the deterministic reply-language policy lives server-side; a
// request that never completed only has the user's own text to go by).
const ERROR_TEXT = {
  he: "השמיים קצת מעוננים כרגע — לא הצלחתי להתחבר. נסו שוב בעוד רגע.",
  en: "The sky's a little cloudy right now — I couldn't reach you. Try again in a moment.",
};
const RETRY_LABEL = { he: "לנסות שוב", en: "Try again" };

function langOf(text: string): Lang {
  return /[֐-׿]/.test(text) ? "he" : "en";
}

function formatTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

/**
 * The stays card stack: sort chips (when there's something to sort) + cards.
 * Default "fit" = the delivered smart order with the recommended card first;
 * re-sorting is pure client state — no API calls, resets with the next
 * message (cards only render on the latest message anyway).
 */
function StayStack({
  stays,
  moreKey,
  sessionSeenIds,
  isHearted,
  onToggleHeart,
  onSelect,
  onOpenDetail,
}: {
  stays: StaysPayload;
  /** The server's <<MORE>> ticket — renders the "show more" button. */
  moreKey: string | null;
  /** Every stay-offer id already shown ANYWHERE in this conversation — the
   *  exclusion seed, so batches never repeat across turns (live bug: a
   *  re-search's show-more re-served an earlier stack's hearted hotel). */
  sessionSeenIds: string[];
  isHearted: (offerId: string) => boolean;
  onToggleHeart: (offer: StayOfferView) => void;
  onSelect: (choice: string) => void;
  onOpenDetail: (offer: StayOfferView) => void;
}) {
  const [sort, setSort] = useState<StaySortMode>("fit");
  // "Show more" REPLACES the stack (screen stays light) — hearted hotels are
  // already safe in the persisted favorites, so nothing is ever lost.
  const [offers, setOffers] = useState(stays.offers);
  const [mock, setMock] = useState(stays.mock);
  const [recommendedId, setRecommendedId] = useState(stays.recommendedId);
  const [moreState, setMoreState] = useState<
    "idle" | "loading" | "exhausted" | "stale"
  >("idle");
  const seenRef = useRef<string[]>([
    ...new Set([...sessionSeenIds, ...stays.offers.map((o) => o.id)]),
  ]);

  async function showMore() {
    if (!moreKey) return;
    setMoreState("loading");
    try {
      const res = await fetch("/api/stays/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: moreKey, excludeIds: seenRef.current }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as {
        offers: StayOfferView[];
        remaining: number;
        mock?: boolean;
        expired?: boolean;
      };
      if (d.expired) return setMoreState("stale");
      if (!d.offers.length) return setMoreState("exhausted");
      seenRef.current = [...seenRef.current, ...d.offers.map((o) => o.id)];
      setOffers(d.offers);
      setMock(!!d.mock);
      setRecommendedId(undefined); // the badge belongs to the first batch
      setSort("fit");
      setMoreState(d.remaining > 0 ? "idle" : "exhausted");
    } catch (err) {
      console.error("Show more failed:", err);
      setMoreState("idle");
    }
  }

  const sorted = sortStayOffers(offers, sort, recommendedId);
  return (
    <div className="mt-2 flex w-full max-w-full md:max-w-[82%] flex-col gap-2">
      {offers.length > 1 ? (
        <StaySortChips lang={stays.lang} active={sort} onChange={setSort} />
      ) : null}
      {sorted.map((offer, ci) => (
        <div
          key={offer.id}
          className="stagger-in"
          style={{ animationDelay: `calc(${ci} * var(--duration-stagger))` }}
        >
          <StayCard
            offer={offer}
            mock={mock}
            lang={stays.lang}
            recommended={offer.id === recommendedId}
            hearted={isHearted(offer.id)}
            onToggleHeart={() => onToggleHeart(offer)}
            onSelect={onSelect}
            onOpenDetail={() => onOpenDetail(offer)}
          />
        </div>
      ))}
      {moreKey ? (
        <ShowMoreButton
          lang={stays.lang}
          state={moreState}
          onClick={() => void showMore()}
        />
      ) : null}
    </div>
  );
}

export default function ChatClient({
  initialMessages,
  firstName,
  tripId,
  onMenuClick,
  favorites,
  onToggleFavorite,
  openFavoriteDetail,
  onFavoriteDetailShown,
}: {
  initialMessages: Message[];
  firstName: string;
  tripId: string | null;
  onMenuClick?: () => void;
  favorites: TripFavorite[];
  onToggleFavorite: (
    tripId: string | null,
    itemType: "stay" | "flight",
    item: { id: string } & Record<string, unknown>,
    lang: Lang,
  ) => void;
  /** A favorite tapped in the sidebar drawer — open its detail modal. */
  openFavoriteDetail: TripFavorite | null;
  onFavoriteDetailShown: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [currentTripId, setCurrentTripId] = useState<string | null>(tripId);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [detailFor, setDetailFor] = useState<{
    offer: StayOfferView;
    lang: Lang;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openFavoriteDetail) return;
    setDetailFor({
      offer: openFavoriteDetail.item as unknown as StayOfferView,
      lang:
        (openFavoriteDetail.item as { lang?: string }).lang === "en"
          ? "en"
          : "he",
    });
    onFavoriteDetailShown();
  }, [openFavoriteDetail, onFavoriteDetailShown]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || isStreaming) return;

    const now = new Date().toISOString();
    const wasNewTrip = currentTripId === null;
    let resolvedTripId = currentTripId;
    // Set on ANY failure (network catch or the server's in-stream <<ERROR>>
    // marker). An errored turn never navigates away — the error bubble and
    // its retry pill must survive (the 2026-07-21 "vanishing bubble").
    let turnErrored = false;
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

      let received = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        received += chunk;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      }
      // The server's in-stream failure marker → the SAME branded bubble as a
      // network failure. One error UX, both failure classes.
      if (hasErrorMarker(received)) {
        turnErrored = true;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = {
            ...last,
            content: ERROR_TEXT[langOf(text)],
            error: true,
          };
          return next;
        });
      }
    } catch (err) {
      console.error(err);
      turnErrored = true;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          content: ERROR_TEXT[langOf(text)],
          error: true,
        };
        return next;
      });
    } finally {
      setIsStreaming(false);
      // Reflect the trip in the URL + sidebar. A brand-new trip navigates to
      // its own URL; an existing one just refreshes the sidebar (name/order).
      // NEVER on an errored turn: navigation would remount from server truth
      // and evaporate the (local-only) error bubble + retry. The trip id is
      // already in state, so a retry continues in the created trip.
      if (!turnErrored) {
        if (wasNewTrip && resolvedTripId) {
          router.push(`/chat?trip=${resolvedTripId}`);
        } else {
          router.refresh();
        }
        // The auto-title lands just AFTER the response closes (after() in the
        // route) — one delayed refresh picks it up without user action.
        setTimeout(() => router.refresh(), 2500);
      }
    }
  }

  /** Retry after a connection-error bubble: drop the failed user+error pair
   *  and resend the same text (send re-adds both). */
  function retry() {
    const failed = messages[messages.length - 2];
    if (isStreaming || failed?.role !== "user") return;
    setMessages((prev) => prev.slice(0, -2));
    void send(failed.content);
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
      {detailFor ? (
        <StayDetailModal
          hotelId={detailFor.offer.id}
          hotelName={detailFor.offer.name}
          lang={detailFor.lang}
          hearted={isFavorite(favorites, detailFor.offer.id)}
          onToggleHeart={() =>
            onToggleFavorite(currentTripId, "stay", detailFor.offer, detailFor.lang)
          }
          onClose={() => setDetailFor(null)}
          onSelectRoom={(choice) => {
            setDetailFor(null);
            void send(choice);
          }}
        />
      ) : null}
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
         On the empty state the warm hero atmosphere is present too (same CSS
         treatment as the landing hero), and the scroll chrome stays soft. */}
      <div
        ref={scrollRef}
        className="scroll-soft relative flex-1 overflow-y-auto px-4 py-6"
      >
        {isEmpty ? <HeroAtmosphere /> : null}
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
              // a date calendar below — the mutually-exclusive, cards-win-ties
              // decision lives in lib/chat/blocks (unit-tested).
              const { text, flights, stays, options, dates } =
                parseAssistantMessage(m.content);
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
                  {m.error && isLast && !isStreaming ? (
                    <QuickReplyPills
                      options={[RETRY_LABEL[langOf(m.content)]]}
                      onSelect={() => retry()}
                    />
                  ) : null}
                  {options && isLast && !isStreaming ? (
                    <QuickReplyPills
                      options={options}
                      onSelect={(o) => void send(o)}
                    />
                  ) : null}
                  {/* Like the pills and the calendar, offer cards live only on
                      the latest message: once the user picks (or says anything)
                      they're gone — history keeps the agent's summary line and
                      the user's selection message. "What did I see earlier?" is
                      a conversational re-search, and stale Select buttons can't
                      post outdated choices. */}
                  {flights && isLast && !isStreaming ? (
                    <div className="mt-2 flex w-full max-w-full md:max-w-[82%] flex-col gap-2">
                      {flights.offers.map((offer, ci) => (
                        <div
                          key={offer.id}
                          className="stagger-in"
                          style={{ animationDelay: `calc(${ci} * var(--duration-stagger))` }}
                        >
                          <FlightCard
                            offer={offer}
                            mock={flights.mock}
                            lang={flights.lang}
                            hearted={isFavorite(favorites, offer.id)}
                            onToggleHeart={() =>
                              onToggleFavorite(
                                currentTripId,
                                "flight",
                                offer,
                                flights.lang,
                              )
                            }
                            onSelect={(s) => void send(s)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {stays && isLast && !isStreaming ? (
                    <StayStack
                      stays={stays}
                      moreKey={splitMore(m.content)?.key ?? null}
                      sessionSeenIds={collectShownStayIds(
                        messages.map((msg) => msg.content),
                      )}
                      isHearted={(id) => isFavorite(favorites, id)}
                      onToggleHeart={(offer) =>
                        onToggleFavorite(currentTripId, "stay", offer, stays.lang)
                      }
                      onSelect={(s) => void send(s)}
                      onOpenDetail={(offer) =>
                        setDetailFor({ offer, lang: stays.lang })
                      }
                    />
                  ) : null}
                  {/* Like the pills, the calendar is only actionable on the
                      latest message — stale calendars don't linger in history. */}
                  {dates && isLast && !isStreaming ? (
                    <div className="mt-2 w-full max-w-full md:max-w-[82%]">
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
            className="max-h-40 flex-1 resize-none rounded-panel border border-c-border bg-c-surface px-4 py-3 text-[15px] text-c-ink outline-none placeholder:text-c-muted focus:border-c-accent focus:ring-2 focus:ring-c-accent/25"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={isStreaming || !input.trim()}
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-c-accent text-c-on-accent shadow-rest transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
