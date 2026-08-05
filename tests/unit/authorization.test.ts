import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * AUTHORIZATION REGRESSION TESTS — the NEGATIVE case.
 *
 * The question is never "can a user reach their own data" (that fails loudly the
 * moment it breaks). It is "can they reach someone ELSE'S by passing an id" —
 * which fails silently, looks correct in review, and is the single most common
 * defect class in AI-generated code, because "and nobody else's" lives in the
 * asker's head rather than the prompt.
 *
 * This file exists because that class cannot be caught by looking. It has to be
 * caught by running.
 */

// ── Fake Supabase: a chainable builder that records every .eq() it was given ──
type Recorded = { table: string; filters: Array<[string, unknown]> };

function makeAdmin(rows: Record<string, unknown | null>) {
  const calls: Recorded[] = [];
  const from = (table: string) => {
    const rec: Recorded = { table, filters: [] };
    calls.push(rec);
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: rows[table] ?? null }),
      maybeSingle: async () => ({ data: rows[table] ?? null }),
    };
    return builder;
  };
  return { admin: { from }, calls };
}

const OWNER = { id: "user-1" };

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { googleId: "google-abc" } })),
}));

const supabaseMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => supabaseMock.current,
}));

import { ownedTrip } from "@/lib/api/owned-trip";
import { auth } from "@/auth";

describe("ownedTrip — the gate every trip-scoped route depends on", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({
      user: { googleId: "google-abc" },
    } as never);
  });

  it("REJECTS a trip belonging to someone else", async () => {
    // The trips lookup finds nothing, because it is filtered by user_id too.
    const { admin } = makeAdmin({ users: OWNER, trips: null });
    supabaseMock.current = admin;

    const result = await ownedTrip(Promise.resolve({ id: "someone-elses-trip" }));
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(404);
  });

  it("returns 404, NOT 403 — a foreign id must be indistinguishable from a missing one", async () => {
    // 403 would confirm the trip exists, turning the endpoint into an oracle for
    // enumerating other people's trip ids.
    const { admin } = makeAdmin({ users: OWNER, trips: null });
    supabaseMock.current = admin;

    const result = await ownedTrip(Promise.resolve({ id: "does-not-matter" }));
    if ("error" in result) {
      expect(result.error.status).toBe(404);
      expect(result.error.status).not.toBe(403);
    }
  });

  it("filters the trips lookup by BOTH id AND user_id — never fetch-then-compare", async () => {
    // This is the actual guarantee. A fetch-then-compare version would pass the
    // tests above while loading the row first; only the filter shape proves it.
    const { admin, calls } = makeAdmin({ users: OWNER, trips: { id: "trip-1" } });
    supabaseMock.current = admin;

    await ownedTrip(Promise.resolve({ id: "trip-1" }));
    const tripQuery = calls.find((c) => c.table === "trips");
    expect(tripQuery).toBeDefined();
    const cols = tripQuery!.filters.map(([c]) => c);
    expect(cols).toContain("id");
    expect(cols).toContain("user_id");
  });

  it("resolves the user from the SESSION, never from a client-supplied id", async () => {
    const { admin, calls } = makeAdmin({ users: OWNER, trips: { id: "trip-1" } });
    supabaseMock.current = admin;

    await ownedTrip(Promise.resolve({ id: "trip-1" }));
    const userQuery = calls.find((c) => c.table === "users");
    expect(userQuery!.filters).toEqual([["google_id", "google-abc"]]);
  });

  it("REJECTS an unauthenticated caller before touching the database", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { admin, calls } = makeAdmin({ users: OWNER, trips: { id: "trip-1" } });
    supabaseMock.current = admin;

    const result = await ownedTrip(Promise.resolve({ id: "trip-1" }));
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

/**
 * STRUCTURAL GUARD. The mocked tests above prove the gate works; this proves
 * every trip-scoped route actually USES it. A new route added under
 * app/api/trips/[id]/ without ownedTrip() is the exact way this protection gets
 * lost — not by breaking the helper, but by quietly not calling it.
 */
describe("every trip-scoped route goes through ownedTrip()", () => {
  const ROOT = join(process.cwd(), "app", "api", "trips");

  function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...routeFiles(full));
      else if (entry === "route.ts") out.push(full);
    }
    return out;
  }

  const files = routeFiles(ROOT);

  it("finds the trip routes at all (guards against a silent empty sweep)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [f.replace(process.cwd(), ""), f]))(
    "%s calls ownedTrip()",
    (_label, file) => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("ownedTrip");
      // Every exported handler must be gated. Counting is cruder than parsing,
      // but it catches the realistic failure: a handler added beside existing
      // ones without the guard.
      const handlers = (src.match(/export async function (GET|POST|PATCH|DELETE|PUT)/g) ?? [])
        .length;
      const gates = (src.match(/ownedTrip\(/g) ?? []).length;
      expect(gates).toBeGreaterThanOrEqual(handlers);
    },
  );
});
