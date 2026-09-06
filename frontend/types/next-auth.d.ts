import type { DefaultSession } from "next-auth";

/**
 * Extra fields this app's two sign-in providers attach to the session — the
 * identity and roles read from whichever door authenticated the user, and
 * the bearer token `lib/api.ts` attaches to every backend call.
 */
declare module "next-auth" {
  interface User {
    role?: string;
    roles?: string[];
    accessToken?: string;
  }

  interface Session extends DefaultSession {
    accessToken: string | null;
    expiresAt: number | null;
    /** Set when the account-system token could not be rotated (refresh
     * failed or was rejected) — `lib/api.ts` reads this to end the browser
     * session outright instead of pretending it is still alive. */
    error?: "RefreshAccessTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Which door authenticated this session — `keycloak` is the only one
     * with an expiry and a refresh token to rotate. */
    provider?: "keycloak" | "credentials";
    accessToken?: string | null;
    accessTokenExpiresAt?: number | null;
    /** Account-system refresh token; never set for the local Credentials
     * door (its Sanctum token carries no exposed expiry to rotate against). */
    refreshToken?: string | null;
    /** Account-system ID token — read server-side only, to build the IdP's
     * own end-session URL (`id_token_hint`); never sent to the browser. */
    idToken?: string | null;
    roles?: string[];
    error?: "RefreshAccessTokenError";
  }
}
