/**
 * Configuration for the account-system sign-in (OpenID Connect, authorization
 * code + PKCE). No secret and no issuer/host value is hardcoded here — both
 * come from the environment, because the account system is a separate,
 * independently deployed service and its address changes between a local
 * throwaway instance and a real one.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Public address of the account system realm (what the browser sees, and
 * the only value ever compared against a token's `iss`). */
export function issuer(): string {
  return required("AUTH_KEYCLOAK_ISSUER").replace(/\/+$/, "");
}

/** Key used to sign/encrypt the short-lived cookies this flow sets. */
export function sessionSecret(): string {
  return required("AUTH_SECRET");
}

/**
 * The public browser client registered in the account-system realm. This is
 * a frozen contract value, not a secret and not a host — the client is
 * public (no client secret), PKCE-only. Reading it from the environment
 * would let a misconfigured deployment silently sign users in against the
 * wrong client, so it stays a literal, the same way the API's own accepted
 * audience is a literal in its config rather than an environment value.
 */
export const CLIENT_ID = "psychon-web";

/** The callback path the realm renders for `psychon-web` — frozen, see
 * above; changing it is a realm change, not a front-end one. */
export const CALLBACK_PATH = "/api/auth/callback/keycloak";

/** Cookie holding the transient PKCE state between the sign-in redirect and
 * the callback. Never sent outside `/api/auth/*`, short-lived. */
export const OAUTH_COOKIE = "psychon_oauth";

/** Cookie holding the signed-in session (encrypted, HttpOnly, browser script
 * cannot read it — the whole point of moving off `localStorage`). */
export const SESSION_COOKIE = "psychon_session";
