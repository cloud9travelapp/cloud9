@AGENTS.md

# Project handoff — Cloud9

AI travel-planning web app. Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · NextAuth v5 (Google → Supabase) · Anthropic SDK (claude-sonnet-5 concierge, claude-haiku-4-5 namer). Repo `cloud9travelapp/cloud9`, deploys to Vercel from `main`. Mock providers need no env vars.

## Architecture (key patterns)
- **Chat**: streaming route `app/api/chat/route.ts`. The system prompt IS the concierge's behavior spec. Tool round-trip loop supports multiple tools; auth-gated; saves to Supabase.
- **Reply language is computed, never model-inferred**: `lib/language.ts` decides each turn's language (word-dominance of the latest user message; place/brand names don't flip it; ambiguous → conversation's established language; new+ambiguous → Hebrew, the onboarding-preference seam) and the route injects it as a hard per-turn directive covering pre-tool notes, tool summaries, and block strings. Don't add prompt language rules that re-infer from "the user's message" — that was the root cause of the mixed-language bugs.
- **Provider-agnostic search** (real provider = one-file swap): `lib/flights/*` (`search_flights`) and `lib/stays/*` (`search_stays`). Each = types + a `searchX` switch on `X_PROVIDER` env (default `"mock"`, exports `IS_MOCK_*`) + a seeded mock. Don't change existing provider signatures.
- **Delimiter blocks**: the model appends ONE `<<OPTIONS>> | <<FLIGHTS>> | <<STAYS>> … <<END>>` block per message. Frontend `components/chat/chat-client.tsx` parses via `displayText` (strips from the first `<<`, so raw blocks never leak) + tolerant `blockRaw`. Card views live in `components/chat/message-parts.tsx` (shared by the real chat AND the landing demo, so they can't drift). Shared `CardSelect` action posts a structured choice as the user's message.
- **Design system**: time-of-day phase tokens (`--c-*`) under `[data-phase]` in `app/globals.css`; 5 phases (sunrise/morning/midday/sunset/night) set from local time (flash-free via a `next/script` inline init). Suez One (display) + Heebo (body). Chat is RTL-first with per-message `dir="auto"` + `unicode-bidi: plaintext`; times/codes/prices stay LTR. Every animation is gated under `prefers-reduced-motion`.
- **Brand**: `components/brand/` (cloud mark + `Lockup`); favicon `app/icon.svg` + `app/apple-icon.tsx`; social image `app/opengraph-image.tsx` (fixed sunset palette).

## Recently shipped
- **Language & behavior round (2026-07-08)** — deterministic reply language (see Architecture); calendar sends with a non-question lead-in (block-only messages render without an empty bubble); user-facing dates are DD-MM-YYYY day-first (tools stay ISO); pills for real choices carry the actual alternatives (never Yes/No); a decline redirects instead of closing the conversation.
- **Date-picker block** — `<<DATES>>` block (`{"lang","mode":"single"|"range","min"?,"max"?}`) → `DateCalendar` in `message-parts.tsx`: phase-tokened month calendar, he/en via `Intl`, RTL-aware, past dates unselectable (min clamped to today client-side), Confirm posts `בחרתי תאריכים: X עד Y` / `Selected dates: X to Y`. Only actionable on the latest message (like pills). Prompt: calendar for concrete dates, OPTIONS pills for vague timing.
- **Stay agent** — hotel search mirroring flights (mock provider, `StayCard`, he/en localized via neutral keys).
- **Card actions** — shared `CardSelect` (Select → structured user message); expandable flight details (connecting flights only; direct flights render flat).
- **Behavior tuning** — professional concierge tone (no slang/emoji, both languages); one question per turn but NEVER decides material choices (offer them as options); offers always re-sent as card blocks (never text lists); confirm carried-over context on a destination switch (Yes/Change pills); guided narrowing for undecided users; fixes for raw-block leak, mixed-language leak, and past-date invention.
- **Brand system** — mark, lockups (horizontal for header, stacked for og), living float (accent-bound), favicon + og image.

## Open TODOs (details in `memory/`)
- RTL/LTR by user language preference (build with onboarding).
- Room selection within a stay (needs the real stay provider).
- Automated tests for critical flows (pre-launch, deliberate task).
- Pre-launch: footer legal links; connect the cloud9app.io domain.
- External: Duffel reply — decision Thu 2026-07-09 (else follow-up + Amadeus test account).

## Working process
- Non-trivial features: short plan → **WAIT for approval** → implement.
- Verify locally: type-check + `npm run build` + preview DOM/computed-style checks. NOTE: the harness preview can't render animations, WebGL, or screenshots — flag those for the user's live review.
- Small focused commits; push to `main`. Temp preview/verification routes are deleted before their commit.
- Do not touch without asking: auth, DB, API-route logic internals, provider-layer signatures.
