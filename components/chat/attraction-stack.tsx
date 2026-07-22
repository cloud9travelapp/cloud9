"use client";

import { useRef, useState } from "react";
import {
  AttractionCard,
  AttractionSortChips,
  ShowMoreButton,
  type AttractionOfferView,
  type AttractionSortMode,
  type AttractionsPayload,
} from "./message-parts";
import { sortAttractionOffers } from "@/lib/chat/blocks";

/**
 * The attractions card stack: sort chips (when there's something to sort) +
 * staggered cards + "show more". Mirrors StayStack: default "fit" = the
 * delivered order with the recommended card first; re-sort is pure client
 * state; "show more" REPLACES the stack from the cached pool (screen stays
 * light) with session-wide exclusion, resetting to "fit". State dies with the
 * next message (cards only render on the latest message).
 */
export function AttractionStack({
  attractions,
  moreKey,
  sessionSeenIds,
  isHearted,
  onToggleHeart,
  onSelect,
  onOpenDetail,
}: {
  attractions: AttractionsPayload;
  moreKey: string | null;
  sessionSeenIds: string[];
  isHearted: (offerId: string) => boolean;
  onToggleHeart: (offer: AttractionOfferView) => void;
  onSelect: (choice: string) => void;
  onOpenDetail: (offer: AttractionOfferView) => void;
}) {
  const [sort, setSort] = useState<AttractionSortMode>("fit");
  const [offers, setOffers] = useState(attractions.offers);
  const [mock, setMock] = useState(attractions.mock);
  const [recommendedId, setRecommendedId] = useState(attractions.recommendedId);
  const [moreState, setMoreState] = useState<"idle" | "loading" | "exhausted" | "stale">("idle");
  const seenRef = useRef<string[]>([
    ...new Set([...sessionSeenIds, ...attractions.offers.map((o) => o.id)]),
  ]);

  async function showMore() {
    if (!moreKey) return;
    setMoreState("loading");
    try {
      const res = await fetch("/api/attractions/more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: moreKey, excludeIds: seenRef.current }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as {
        offers: AttractionOfferView[];
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
      console.error("Attraction show more failed:", err);
      setMoreState("idle");
    }
  }

  const sorted = sortAttractionOffers(offers, sort, recommendedId);
  return (
    <div className="mt-2 flex w-full max-w-full flex-col gap-2 md:max-w-[82%]">
      {offers.length > 1 ? (
        <AttractionSortChips lang={attractions.lang} active={sort} onChange={setSort} />
      ) : null}
      {sorted.map((offer, ci) => (
        <div
          key={offer.id}
          className="stagger-in"
          style={{ animationDelay: `calc(${ci} * var(--duration-stagger))` }}
        >
          <AttractionCard
            offer={offer}
            mock={mock}
            lang={attractions.lang}
            recommended={offer.id === recommendedId}
            hearted={isHearted(offer.id)}
            onToggleHeart={() => onToggleHeart(offer)}
            onSelect={onSelect}
            onOpenDetail={() => onOpenDetail(offer)}
          />
        </div>
      ))}
      {moreKey ? (
        <ShowMoreButton lang={attractions.lang} state={moreState} onClick={() => void showMore()} />
      ) : null}
    </div>
  );
}
