import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { decode } from "@/lib/auth/cookie-codec";

interface SessionCookiePayload {
  sub: string;
  roles: string[];
  accessToken: string;
  accessTokenExpiresAt: number;
}

/**
 * Same-origin endpoint the browser reads its session from. The cookie
 * itself is HttpOnly (no script on the page can read it); this route reads
 * it server-side and hands the client only what it needs: the access token
 * to attach to API calls, and the identity/roles for display. Nothing here
 * is written back to `localStorage` — the caller keeps it in memory only.
 */
export async function GET(request: NextRequest) {
  const session = decode<SessionCookiePayload>(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session || session.accessTokenExpiresAt <= Date.now()) {
    return NextResponse.json({ user: null, accessToken: null, expiresAt: null });
  }
  return NextResponse.json({
    user: { sub: session.sub, roles: session.roles },
    accessToken: session.accessToken,
    expiresAt: session.accessTokenExpiresAt,
  });
}
