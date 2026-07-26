"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  bookingProgress,
  emptyStateKind,
  groupTimeline,
  localDateString,
  stayCoverageByDate,
  type StayCoverage,
  type TimelineDay,
} from "@/lib/timeline/present";
import {
  TIMELINE_CATEGORIES,
  type TimelineCategory,
  type TimelineItem,
} from "@/lib/timeline/types";

/** When the timeline shipped. A trip created before this has no items through
 *  no fault of its own — selections back then were prose only, with the
 *  structured offer already discarded. The empty state says so instead of
 *  looking broken. */
export const TIMELINE_SINCE = "2026-07-26T16:00:00.000Z";

/** mapbox-gl is ~250KB gz plus its CSS — loaded only when the traveler first
 *  opens the map, never in the chat bundle. Once loaded it stays MOUNTED
 *  (hidden), so toggling back to the list costs no further map loads. */
const JourneyMap = dynamic(
  () => import("./journey-map").then((m) => m.JourneyMap),
  { ssr: false },
);

const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  shopping: "קניות",
  beach: "ים",
  nature: "טבע",
  food: "אוכל",
  culture: "תרבות",
  rest: "מנוחה",
  lodging: "לינה",
  transport: "תחבורה",
  other: "אחר",
};

const dayFormat = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d)));
}

export type TimelineFailure = {
  clientRef: string;
  title: string;
};

type Props = {
  items: TimelineItem[];
  loading: boolean;
  tripCreatedAt: string | null;
  /** A selection whose timeline write didn't land. Surfaced, never silent. */
  failure: TimelineFailure | null;
  onRetryFailure: () => void;
  onAdd: (draft: {
    title: string;
    date: string | null;
    startTime: string | null;
    category: TimelineCategory;
    notes: string | null;
  }) => void | Promise<void>;
  onUpdate: (id: string, patch: Record<string, unknown>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  className?: string;
};

export function JourneyPane({
  items,
  loading,
  tripCreatedAt,
  failure,
  onRetryFailure,
  onAdd,
  onUpdate,
  onDelete,
  className = "",
}: Props) {
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  // Once the map has been opened it stays mounted for the session, so the
  // toggle can never trigger a second billed map load.
  const [mapOpened, setMapOpened] = useState(false);
  const grouped = useMemo(() => groupTimeline(items), [items]);
  const coverage = useMemo(() => stayCoverageByDate(items), [items]);
  const progress = useMemo(() => bookingProgress(items), [items]);
  const today = useMemo(() => localDateString(new Date()), []);
  const todayRef = useRef<HTMLDivElement>(null);
  const scrolledToToday = useRef(false);

  // Open on TODAY when the trip is under way — the difference between a
  // planning artifact and something you actually open while travelling.
  // Once per mount, so it can't fight the traveler's own scrolling.
  useEffect(() => {
    if (scrolledToToday.current || loading || !todayRef.current) return;
    scrolledToToday.current = true;
    todayRef.current.scrollIntoView({ block: "start" });
  }, [loading, items.length]);
  const overlapIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of grouped.overlaps) {
      s.add(o.aId);
      s.add(o.bId);
    }
    return s;
  }, [grouped.overlaps]);

  const isEmpty = items.length === 0;

  return (
    <div className={`scroll-soft flex-1 overflow-y-auto px-4 py-6 ${className}`}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {failure ? (
          <div
            dir="auto"
            className="rounded-card border border-c-accent/30 bg-c-accent-soft/50 px-4 py-3 text-sm text-c-ink [unicode-bidi:plaintext]"
          >
            <p className="font-semibold">״{failure.title}״ לא נשמר במסע</p>
            <p className="mt-0.5 text-c-muted">
              הבחירה נרשמה בשיחה, אבל השמירה במסע נכשלה.
            </p>
            <button
              type="button"
              onClick={onRetryFailure}
              className="mt-2 rounded-full bg-c-accent px-4 py-1.5 text-xs font-semibold text-c-on-accent transition-opacity hover:opacity-90"
            >
              נסה שוב
            </button>
          </div>
        ) : null}

        {/* רשימה | מפה — a VIEW of the timeline, not a third tab. Only worth
            offering once there's something to look at. */}
        {!loading && !isEmpty ? (
          <div className="flex items-center gap-1">
            {(
              [
                ["list", "רשימה"],
                ["map", "מפה"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setView(key);
                  if (key === "map") setMapOpened(true);
                }}
                aria-current={view === key ? "true" : undefined}
                className={`min-h-[28px] rounded-full px-3 text-xs font-semibold transition-opacity ${
                  view === key
                    ? "bg-c-accent text-c-on-accent"
                    : "border border-c-border text-c-muted hover:opacity-80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {mapOpened ? (
          <JourneyMap
            items={items}
            active={view === "map"}
            className={view === "map" ? "" : "hidden"}
          />
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-card bg-c-accent-soft/30"
              />
            ))}
          </div>
        ) : view === "map" ? null : isEmpty && !adding ? (
          <EmptyState
            kind={
              tripCreatedAt
                ? emptyStateKind(tripCreatedAt, TIMELINE_SINCE)
                : "new"
            }
            onAdd={() => setAdding(true)}
          />
        ) : (
          <>
            {progress.total > 0 ? (
              // The "not closed yet" signal WITHOUT declaring the whole
              // document a draft: most planning happens before anything is
              // booked, and a blanket "none of this is real" would undercut
              // exactly the phase this tab exists to serve.
              <p className="text-xs font-semibold text-c-muted">
                {progress.booked} מתוך {progress.total} רכיבים מוזמנים
              </p>
            ) : null}

            {grouped.days.map((day) => (
              <DayBlock
                key={day.date}
                day={day}
                coverage={coverage.get(day.date) ?? []}
                isToday={day.date === today}
                dayRef={day.date === today ? todayRef : undefined}
                overlapIds={overlapIds}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}

            {grouped.unscheduled.length > 0 ? (
              <section className="mt-2">
                <h3 className="mb-2 text-xs font-semibold text-c-muted">
                  עוד לא משובץ ליום
                </h3>
                <div className="flex flex-col gap-2">
                  {grouped.unscheduled.map((item) => (
                    <TimelineRow
                      key={item.id}
                      item={item}
                      conflicting={false}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        {adding ? (
          <AddItemForm
            onCancel={() => setAdding(false)}
            onSubmit={async (draft) => {
              await onAdd(draft);
              setAdding(false);
            }}
          />
        ) : !loading && !isEmpty ? (
          // The empty state has its own CTA — two add buttons would be noise.
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 w-fit rounded-full border border-c-border bg-c-surface px-4 py-2 text-sm font-semibold text-c-ink transition-opacity hover:opacity-80"
          >
            + הוספה למסע
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  kind,
  onAdd,
}: {
  kind: "new" | "predates-feature";
  onAdd: () => void;
}) {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-c-ink">
        {kind === "predates-feature" ? "המסע מתחיל מכאן" : "המסע שלך עדיין ריק"}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-c-muted">
        {kind === "predates-feature"
          ? "הטיול הזה נפתח לפני שהמסע היה קיים, ולכן בחירות קודמות לא מופיעות כאן. מעכשיו כל בחירה בשיחה תיווסף אוטומטית — ואפשר גם להוסיף פריטים ידנית."
          : "כל מה שתבחרו בשיחה — טיסה, מלון, אטרקציה — יופיע כאן אוטומטית. אפשר גם להוסיף משהו משלכם."}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-6 rounded-full bg-c-accent px-7 py-3.5 text-base font-semibold text-c-on-accent shadow-rest transition-opacity hover:opacity-90"
      >
        הוספה למסע
      </button>
    </div>
  );
}

/** Band tints alternate per stay so two adjacent stays never read as one
 *  continuous block. The STRIP names the hotel — that's what disambiguates;
 *  the band only carries continuity. */
/** Small text controls still need a real touch target. Measured at 390px, the
 *  bare "הסרה" link was 25×18 — under the 24px minimum, on a destructive
 *  action. The height is padding, so it costs nothing visually. */
const TAP = "inline-flex min-h-[28px] items-center";

const BAND = [
  { fill: "bg-c-accent-soft/30", rule: "bg-c-accent/40" },
  // --c-mist is a raw phase token with no Tailwind color mapping (only nine
  // --c-* roles are exposed in @theme), so it has to be mixed explicitly —
  // "bg-c-mist/…" would silently compile to nothing, which is exactly how the
  // second band went invisible the first time.
  {
    fill: "bg-[color-mix(in_srgb,var(--c-mist)_22%,transparent)]",
    rule: "bg-[color-mix(in_srgb,var(--c-mist)_60%,transparent)]",
  },
];

function DayBlock({
  day,
  coverage,
  isToday,
  dayRef,
  overlapIds,
  onUpdate,
  onDelete,
}: {
  day: TimelineDay;
  coverage: StayCoverage[];
  isToday: boolean;
  dayRef?: React.RefObject<HTMLDivElement | null>;
  overlapIds: Set<string>;
  onUpdate: Props["onUpdate"];
  onDelete: Props["onDelete"];
}) {
  const night = coverage.find((c) => !c.isCheckOut);
  const checkOuts = coverage.filter((c) => c.isCheckOut);
  const band = night ? BAND[night.stayIndex % BAND.length] : null;
  // A stay item renders as its band + strips, never also as a row — one hotel
  // must not appear twice on its check-in day.
  const spanned = new Set(coverage.map((c) => c.item.id));
  const rows = day.items.filter((i) => !spanned.has(i.id));

  return (
    <section ref={dayRef} className="relative">
      {band ? (
        <>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${band.fill} ${
              night?.isFirstNight ? "rounded-t-card" : ""
            } ${night?.isLastNight ? "rounded-b-card" : ""}`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 start-0 w-0.5 ${band.rule}`}
          />
        </>
      ) : null}

      <div className={`relative ${band ? "px-3 py-2" : ""}`}>
        <h3 className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-bold text-c-ink">
            יום {day.dayNumber}
          </span>
          <span dir="ltr" className="text-xs text-c-muted tabular-nums">
            {formatDay(day.date)}
          </span>
          {isToday ? (
            <span className="rounded-full bg-c-accent px-2 py-0.5 text-[10px] font-semibold text-c-on-accent">
              היום
            </span>
          ) : null}
        </h3>

        {/* Stay strips: recessed on purpose — background, not foreground, so
            they never compete with actual timed events. */}
        {checkOuts.map((c) => (
          <p
            key={`out-${c.item.id}`}
            dir="auto"
            className="mb-1.5 text-[11px] text-c-muted [unicode-bidi:plaintext]"
          >
            צ׳ק-אאוט · {c.item.title}
          </p>
        ))}
        {night ? (
          <StayStrip
            coverage={night}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ) : null}

        {rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-c-border px-4 py-3 text-xs text-c-muted">
            {night
              ? "אין תוכניות ליום הזה"
              : "יום פנוי — עדיין לא תכננתם כלום"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((item) => (
              <TimelineRow
                key={item.id}
                item={item}
                conflicting={overlapIds.has(item.id)}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** The per-day "where you're sleeping" line. On the first night it also
 *  carries the controls; repeating them on every night would be noise. */
function StayStrip({
  coverage,
  onUpdate,
  onDelete,
}: {
  coverage: StayCoverage;
  onUpdate: Props["onUpdate"];
  onDelete: Props["onDelete"];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { item, nightIndex, nights, isFirstNight } = coverage;
  const booked = item.state === "booked";

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-c-muted">
      <span dir="auto" className="font-semibold [unicode-bidi:plaintext]">
        {isFirstNight ? `צ׳ק-אין · ${item.title}` : item.title}
      </span>
      <span className="tabular-nums">
        לילה {nightIndex} מתוך {nights}
      </span>
      {isFirstNight ? (
        <>
          <button
            type="button"
            onClick={() =>
              void onUpdate(item.id, { state: booked ? "planned" : "booked" })
            }
            className={`${TAP} rounded-full px-2.5 font-semibold transition-opacity hover:opacity-80 ${
              booked
                ? "bg-c-accent text-c-on-accent"
                : "border border-c-border text-c-muted"
            }`}
          >
            {booked ? "✓ הוזמן" : "טרם הוזמן"}
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                className={`${TAP} px-1 font-semibold text-c-accent`}
              >
                כן, מחק
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={`${TAP} px-1 text-c-muted`}
              >
                ביטול
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={`${TAP} px-1 transition-opacity hover:opacity-70`}
            >
              הסרה
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}

function TimelineRow({
  item,
  conflicting,
  onUpdate,
  onDelete,
}: {
  item: TimelineItem;
  conflicting: boolean;
  onUpdate: Props["onUpdate"];
  onDelete: Props["onDelete"];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const booked = item.state === "booked";

  return (
    <div
      className={`rounded-card border bg-c-surface px-4 py-3 shadow-rest ${
        booked ? "border-c-accent/40" : "border-c-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {item.startTime ? (
              <span
                dir="ltr"
                className="text-xs font-semibold text-c-accent tabular-nums"
              >
                {item.startTime}
              </span>
            ) : null}
            <span
              dir="auto"
              className="truncate text-sm font-semibold text-c-ink [unicode-bidi:plaintext]"
            >
              {item.title}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-c-muted">
            <span>{CATEGORY_LABEL[item.category]}</span>
            {item.durationMin ? <span>· {item.durationMin} דק׳</span> : null}
            {item.lat == null ? <span>· ללא מיקום</span> : null}
          </div>
          {item.notes ? (
            <p
              dir="auto"
              className="mt-1 truncate text-xs text-c-muted [unicode-bidi:plaintext]"
            >
              {item.notes}
            </p>
          ) : null}
          {conflicting ? (
            <p className="mt-1.5 text-[11px] font-semibold text-c-accent">
              חופף לפריט אחר באותו זמן
            </p>
          ) : null}
        </div>

        {/* planned is NOT a reservation — the label says so outright. */}
        <button
          type="button"
          onClick={() =>
            void onUpdate(item.id, { state: booked ? "planned" : "booked" })
          }
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80 ${
            booked
              ? "bg-c-accent text-c-on-accent"
              : "border border-c-border text-c-muted"
          }`}
        >
          {booked ? "✓ הוזמן" : "טרם הוזמן"}
        </button>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[11px]">
        {confirmDelete ? (
          <>
            <span className="text-c-muted">למחוק?</span>
            <button
              type="button"
              onClick={() => void onDelete(item.id)}
              className={`${TAP} px-1 font-semibold text-c-accent`}
            >
              כן, מחק
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={`${TAP} px-1 text-c-muted`}
            >
              ביטול
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={`${TAP} px-1 text-c-muted transition-opacity hover:opacity-70`}
          >
            הסרה
          </button>
        )}
      </div>
    </div>
  );
}

function AddItemForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (draft: {
    title: string;
    date: string | null;
    startTime: string | null;
    category: TimelineCategory;
    notes: string | null;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [category, setCategory] = useState<TimelineCategory>("other");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = title.trim().length > 0 && !busy;

  return (
    <form
      className="rounded-card border border-c-border bg-c-surface px-4 py-4 shadow-rest"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        await onSubmit({
          title: title.trim(),
          date: date || null,
          // A time with no day has nothing to sit on; the server rejects it too.
          startTime: date && startTime ? startTime : null,
          category,
          notes: notes.trim() || null,
        });
        setBusy(false);
      }}
    >
      <input
        dir="auto"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="מה מוסיפים?"
        maxLength={200}
        autoFocus
        className="w-full rounded-inset border border-c-border bg-c-bg-2 px-3 py-2 text-sm text-c-ink outline-none focus:border-c-accent"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-inset border border-c-border bg-c-bg-2 px-3 py-2 text-sm text-c-ink outline-none focus:border-c-accent"
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          disabled={!date}
          title={date ? undefined : "בחרו יום כדי לקבוע שעה"}
          className="rounded-inset border border-c-border bg-c-bg-2 px-3 py-2 text-sm text-c-ink outline-none focus:border-c-accent disabled:opacity-40"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TimelineCategory)}
          className="rounded-inset border border-c-border bg-c-bg-2 px-3 py-2 text-sm text-c-ink outline-none focus:border-c-accent"
        >
          {TIMELINE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <input
        dir="auto"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="הערה (אופציונלי)"
        maxLength={2000}
        className="mt-2 w-full rounded-inset border border-c-border bg-c-bg-2 px-3 py-2 text-sm text-c-ink outline-none focus:border-c-accent"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-c-accent px-4 py-2 text-sm font-semibold text-c-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          הוספה
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-2 text-sm text-c-muted transition-opacity hover:opacity-70"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
