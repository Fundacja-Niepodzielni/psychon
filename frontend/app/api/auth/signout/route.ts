import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";

/**
 * Clears the local session cookie. This is the front-channel, local-only
 * sign-out this slice builds — it does not call the realm's own end-session
 * endpoint and does not revoke the access token at the identity provider
 * (a bearer token stays valid until it expires by design; back-channel
 * logout is a later slice). After this call the browser simply has no
 * session left to read a token from, which is what the next API call proves.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
