// TEMPORARY debug endpoint — reports whether each server env var is PRESENT.
// It never exposes any value, only "present" / "MISSING". Remove this route
// once the production environment variables are confirmed.

export const dynamic = "force-dynamic"; // evaluate per-request, not at build

function presence(value?: string): "present" | "MISSING" {
  return value && value.trim().length > 0 ? "present" : "MISSING";
}

export function GET() {
  return Response.json({
    note: "presence only — values are never exposed. Delete this endpoint after debugging.",
    auth: {
      AUTH_SECRET: presence(process.env.AUTH_SECRET),
      AUTH_URL: presence(process.env.AUTH_URL),
      AUTH_GOOGLE_ID: presence(process.env.AUTH_GOOGLE_ID),
      AUTH_GOOGLE_SECRET: presence(process.env.AUTH_GOOGLE_SECRET),
    },
    supabase: {
      NEXT_PUBLIC_SUPABASE_URL: presence(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: presence(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    anthropic: {
      ANTHROPIC_API_KEY: presence(process.env.ANTHROPIC_API_KEY),
    },
  });
}
