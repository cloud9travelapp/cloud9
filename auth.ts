import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordLogin } from "@/lib/analytics";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Google is the only provider. Sessions are stateless JWTs. On sign-in, the
 * Google profile is upserted into the Supabase `users` table so that a row
 * exists after the user's first login.
 *
 * The Google provider reads `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` and the
 * top-level config reads `AUTH_SECRET` from the environment automatically.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;

      try {
        // .select("id") so the login can be logged against the user's uuid —
        // sessions are stateless JWTs, so this upsert is the ONLY moment a
        // sign-in touches the database and the only place that id is at hand.
        const { data, error } = await getSupabaseAdmin()
          .from("users")
          .upsert(
            {
              google_id: account.providerAccountId,
              email: user.email,
              name: user.name,
              image: user.image,
            },
            { onConflict: "google_id" },
          )
          .select("id")
          .single();

        if (error) {
          console.error("Failed to save user to Supabase:", error.message);
        } else if (data?.id) {
          // Best-effort and self-reporting; never blocks or fails sign-in.
          await recordLogin(data.id);
        }
      } catch (err) {
        // Never block sign-in on a persistence failure; log for reconciliation.
        console.error("Supabase upsert threw during sign-in:", err);
      }

      return true;
    },
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        token.googleId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.googleId === "string") {
        session.user.googleId = token.googleId;
      }
      return session;
    },
  },
});
