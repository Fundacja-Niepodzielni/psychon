import { NextRequest, NextResponse } from "next/server";
import { OAUTH_COOKIE, SESSION_COOKIE } from "@/lib/auth/config";
import { decode, encode } from "@/lib/auth/cookie-codec";
import { decodeAccessTokenClaims, exchangeCode } from "@/lib/auth/oidc";

interface OAuthCookiePayload {
  verifier: string;
  state: string;
  redirectUri: string;
  callbackUrl: string;
}

interface SessionCookiePayload {
  sub: string;
  roles: string[];
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
}

/** The callback path the realm's `psychon-web` client renders. Exchanges the
 * authorization code for tokens and opens a local session — no ID-token or
 * refresh handling beyond what is needed to answer API calls. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const idpError = request.nextUrl.searchParams.get("error");
  const transient = decode<OAuthCookiePayload>(request.cookies.get(OAUTH_COOKIE)?.value);

  function fail(reason: string): NextResponse {
    const url = new URL("/logowanie/konta", origin);
    url.searchParams.set("error", reason);
    const response = NextResponse.redirect(url);
    response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return response;
  }

  if (idpError) return fail(idpError);
  if (!code || !state || !transient) return fail("missing_state");
  if (state !== transient.state) return fail("state_mismatch");

  let tokens;
  try {
    tokens = await exchangeCode({
      code,
      verifier: transient.verifier,
      redirectUri: transient.redirectUri,
    });
  } catch {
    return fail("token_exchange_failed");
  }

  const claims = decodeAccessTokenClaims(tokens.access_token);
  if (!claims.sub) return fail("no_subject");

  const session: SessionCookiePayload = {
    sub: claims.sub,
    roles: claims.roles,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token,
  };

  const target = new URL(transient.callbackUrl, origin);
  const response = NextResponse.redirect(target);
  response.cookies.set(SESSION_COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    // Upper bound on cookie lifetime; the session route also checks
    // `accessTokenExpiresAt`, which is the value that actually matters.
    maxAge: 60 * 60 * 12,
  });
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return response;
}
