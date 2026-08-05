import type { NextConfig } from "next";

/**
 * Security response headers.
 *
 * Measured on production 2026-08-05 BEFORE adding these: Vercel sent
 * Strict-Transport-Security and nothing else, plus an `X-Powered-By: Next.js`
 * that advertises the framework for free.
 *
 * NO Content-Security-Policy here, deliberately — see the CSP round in
 * CLAUDE.md. A wrong CSP is worse than none, because the first thing it breaks
 * gets "fixed" with unsafe-inline and then the policy means nothing.
 */
const SECURITY_HEADERS = [
  // Clickjacking: nothing in this app is meant to be framed.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers second-guessing Content-Type (an image that sniffs as script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full URL same-origin, only the origin cross-origin, nothing to
  // HTTP. Trip URLs carry ids we would rather not hand to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We use none of these. Denying them means an injected script cannot either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Vercel already sends max-age=63072000; this REPLACES it to add
  // includeSubDomains. NOT `preload` — that is a one-way door, baked into
  // browsers and slow to undo, and it would break any future non-HTTPS
  // subdomain. Two years of HSTS without preload is the reversible choice.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Drop `X-Powered-By: Next.js`. Free to remove; no reason to name the stack.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
