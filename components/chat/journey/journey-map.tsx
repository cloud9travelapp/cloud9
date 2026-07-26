"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { TimelineItem } from "@/lib/timeline/types";
import { groupTimeline } from "@/lib/timeline/present";

// The map is a VIEW of the timeline, not a separate tab. Mapbox bills per map
// LOAD — one billed unit each time a Map object is constructed, with unlimited
// interaction after — so this component creates exactly one Map and keeps it
// alive: the list/map toggle hides it with CSS instead of unmounting, and
// item changes update sources and markers rather than re-initializing.

/** Inlined at BUILD time by Next (that's what NEXT_PUBLIC_ means), so it must
 *  be referenced statically like this — a dynamic lookup would not be
 *  replaced and would read as undefined in the browser. */
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Day colors for pins, matching the accent family. Cycles for long trips. */
const DAY_COLORS = [
  "#0369a1",
  "#bd502c",
  "#2f74d0",
  "#7c6f9f",
  "#3f7d58",
  "#b3803a",
];

/** setRTLTextPlugin throws if called twice, and Hebrew labels render mangled
 *  without it. Served from our own origin rather than unpkg. */
let rtlRequested = false;

type Placed = { item: TimelineItem; lat: number; lng: number; dayIndex: number };

export function JourneyMap({
  items,
  className = "",
  active,
}: {
  items: TimelineItem[];
  className?: string;
  /** True when the map view is showing — drives the one-time init and the
   *  resize a hidden container always needs. */
  active: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Placed items in itinerary order; everything else is listed honestly below.
  const grouped = groupTimeline(items);
  const placed: Placed[] = [];
  grouped.days.forEach((day, dayIndex) => {
    for (const it of day.items) {
      if (typeof it.lat === "number" && typeof it.lng === "number") {
        placed.push({ item: it, lat: it.lat, lng: it.lng, dayIndex });
      }
    }
  });
  const unplaced = items.filter(
    (i) => typeof i.lat !== "number" || typeof i.lng !== "number",
  );

  // ── One-time init ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || mapRef.current || !containerRef.current) return;
    if (!TOKEN) {
      setFailed("missing-token");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("mapbox-gl");
        const mapboxgl = mod.default;
        if (cancelled || !containerRef.current) return;

        if (!rtlRequested) {
          rtlRequested = true;
          try {
            // (url, callback, lazy) — lazy so the 37KB plugin loads on the
            // first RTL label rather than blocking every map.
            mapboxgl.setRTLTextPlugin(
              "/mapbox-gl-rtl-text.js",
              (err?: unknown) => {
                // Silent failure here means mangled Hebrew labels, so say so.
                if (err) console.error("RTL text plugin failed:", err);
              },
              true,
            );
          } catch {
            /* already set by another instance — harmless */
          }
        }

        mapboxgl.accessToken = TOKEN;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/standard",
          center: placed.length ? [placed[0].lng, placed[0].lat] : [0, 20],
          zoom: placed.length ? 12 : 1,
          attributionControl: true,
        });
        mapRef.current = map;

        map.on("style.load", () => {
          // Light the map to match the app's time-of-day phase. Wrapped
          // because config keys are style-version specific — a future style
          // must not be able to break the map itself.
          try {
            const phase =
              document.documentElement.dataset.phase ?? "midday";
            const preset =
              phase === "sunrise"
                ? "dawn"
                : phase === "sunset"
                  ? "dusk"
                  : phase === "night"
                    ? "night"
                    : "day";
            map.setConfigProperty("basemap", "lightPreset", preset);
          } catch {
            /* style without configurable lighting — fine */
          }
          setReady(true);
        });

        map.on("error", (e: unknown) => {
          const msg =
            (e as { error?: { message?: string } })?.error?.message ?? "";
          // A bad/unauthorized token is worth reporting honestly; transient
          // tile errors are not.
          if (/access token|unauthorized|401|403/i.test(msg)) {
            setFailed("bad-token");
          }
        });
      } catch (err) {
        console.error("Map init failed:", err);
        if (!cancelled) setFailed("init");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, placed]);

  // Hidden containers measure zero, so a map shown after being hidden renders
  // blank until told to re-measure.
  useEffect(() => {
    if (active && mapRef.current) mapRef.current.resize();
  }, [active]);

  // ── Markers + route line, updated in place (never a re-init) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;

      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      for (const p of placed) {
        const el = document.createElement("div");
        el.style.cssText = `width:14px;height:14px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);background:${
          DAY_COLORS[p.dayIndex % DAY_COLORS.length]
        }`;
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 14, closeButton: false }).setText(
              p.item.title,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }

      const line = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: placed.map((p) => [p.lng, p.lat]),
        },
      };
      const src = map.getSource("journey-route") as
        | { setData: (d: unknown) => void }
        | undefined;
      if (src) {
        src.setData(line);
      } else if (placed.length > 1) {
        map.addSource("journey-route", { type: "geojson", data: line });
        map.addLayer({
          id: "journey-route",
          type: "line",
          source: "journey-route",
          paint: {
            "line-color": "#0369a1",
            "line-width": 2,
            "line-opacity": 0.5,
            "line-dasharray": [2, 2],
          },
        });
      }

      if (placed.length === 1) {
        map.setCenter([placed[0].lng, placed[0].lat]);
        map.setZoom(13);
      } else if (placed.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        for (const p of placed) bounds.extend([p.lng, p.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placed, ready]);

  return (
    <div className={className}>
      {failed ? (
        <div className="rounded-card border border-c-border bg-c-surface px-4 py-6 text-center text-sm text-c-muted">
          {failed === "missing-token" || failed === "bad-token"
            ? "המפה לא זמינה כרגע."
            : "לא הצלחנו לטעון את המפה."}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-[55vh] min-h-[280px] w-full overflow-hidden rounded-card border border-c-border"
        />
      )}

      {placed.length === 0 && !failed ? (
        <p className="mt-3 text-xs text-c-muted">
          עדיין אין פריטים עם מיקום להצגה על המפה.
        </p>
      ) : null}

      {unplaced.length > 0 ? (
        <section className="mt-4">
          {/* Never dropped and never guessed onto a pin. */}
          <h3 className="mb-2 text-xs font-semibold text-c-muted">
            ללא מיקום · {unplaced.length}
          </h3>
          <ul className="flex flex-col gap-1">
            {unplaced.map((i) => (
              <li
                key={i.id}
                dir="auto"
                className="truncate text-xs text-c-muted [unicode-bidi:plaintext]"
              >
                {i.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
