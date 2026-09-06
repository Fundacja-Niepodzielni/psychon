import { NextRequest, NextResponse } from "next/server";
import { CALLBACK_PATH, CLIENT_ID, OAUTH_COOKIE } from "@/lib/auth/config";
import { encode } from "@/lib/auth/cookie-codec";
import { discover } from "@/lib/auth/oidc";
import { challengeFromVerifier, generateState, generateVerifier } from "@/lib/auth/pkce";

interface OAuthCookiePayload {
  verifier: string;
  state: string;
  redirectUri: string;
  callbackUrl: string;
}

/** Starts the account-system sign-in: redirects the browser to the realm's
 * own authorization endpoint with a fresh PKCE challenge and state, both
 * remembered in a short-lived cookie for the callback to check. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}${CALLBACK_PATH}`;

  const requested = request.nextUrl.searchParams.get("callbackUrl") ?? "/konto";
  // Never follow an absolute/external URL supplied by the query string.
  const callbackUrl = requested.startsWith("/") ? requested : "/konto";

  const verifier = generateVerifier();
  const state = generateState();

  const doc = await discover();
  const authorizeUrl = new URL(doc.authorization_endpoint);
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challengeFromVerifier(verifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const payload: OAuthCookiePayload = { verifier, state, redirectUri, callbackUrl };
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/api/auth",
    maxAge: 300,
  });
  return response;
}
