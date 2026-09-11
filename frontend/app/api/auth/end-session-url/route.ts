import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ACCOUNT_SYSTEM_CLIENT_ID } from "@/auth";

/**
 * Read-only helper for the account-system sign-out button. `signOut()` only
 * ever ends *this app's* cookie session — the realm's own SSO cookie in the
 * browser survives it, so a second click on "Zaloguj się przez Konta
 * Niepodzielni" used to land straight back on `/konto` with no password
 * asked. Ending that requires a full-page navigation to the
 * realm's `end_session_endpoint`, which this route builds while the app's
 * own session cookie is still readable — the caller then still has to call
 * `signOut()` itself and navigate to the URL returned here, in that order.
 *
 * Deliberately its own route rather than folded into `endSession()`'s
 * `signOut()` call: by the time that call resolves the cookie is already
 * gone, so the id token needed for `id_token_hint` would already be lost.
 */
export async function GET(request: NextRequest) {
  // Zwykla trasa Next, nie owinieta przez Auth.js — AUTH_URL samo z siebie jej
  // nie naprawia. Za odwrotnym proxy `request.url` to adres, jaki widzi
  // kontener (`https://localhost:3000`), wiec kiedy AUTH_URL jest ustawione,
  // bierzemy origin z niego; bez niego (testy, `next dev` bez proxy) zostaje
  // origin zadania jak dotad.
  const origin = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : new URL(request.url).origin;
  const fallback = new URL("/logowanie/konta", origin).toString();

  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  if (!issuer) {
    return NextResponse.json({ url: fallback });
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const idToken = token?.idToken;

  const endSessionUrl = new URL(`${issuer.replace(/\/+$/, "")}/protocol/openid-connect/logout`);
  endSessionUrl.searchParams.set("client_id", ACCOUNT_SYSTEM_CLIENT_ID);
  // The realm mirrors "Valid Post Logout Redirect URIs" onto the client's
  // sign-in redirect URI list (`post.logout.redirect.uris: "+"`), so this is
  // the one address Keycloak will actually accept here for the `psychon-web`
  // client — not a landing screen choice, measured against the realm itself.
  endSessionUrl.searchParams.set(
    "post_logout_redirect_uri",
    new URL("/api/auth/callback/keycloak", origin).toString(),
  );
  if (typeof idToken === "string" && idToken) {
    endSessionUrl.searchParams.set("id_token_hint", idToken);
  }

  return NextResponse.json({ url: endSessionUrl.toString() });
}
