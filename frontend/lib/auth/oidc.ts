import { CLIENT_ID, issuer } from "./config";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

let cached: { value: Discovery; fetchedAt: number } | null = null;
const DISCOVERY_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches `/.well-known/openid-configuration` and asserts its own `issuer`
 * matches the configured one before trusting anything else in it — the same
 * check the API applies on its side of the identity contract, so a realm
 * pointed at the wrong address fails loudly instead of quietly accepting
 * endpoints nobody asked for.
 */
export async function discover(): Promise<Discovery> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < DISCOVERY_TTL_MS) {
    return cached.value;
  }

  const base = issuer();
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
  }
  const doc = (await res.json()) as Discovery;
  if (doc.issuer.replace(/\/+$/, "") !== base) {
    throw new Error(
      `OIDC discovery issuer mismatch: got "${doc.issuer}", expected "${base}"`,
    );
  }
  cached = { value: doc, fetchedAt: now };
  return doc;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

/** Authorization-code + PKCE exchange. `psychon-web` is public: no client
 * secret is sent, and none exists for it (frozen realm contract). */
export async function exchangeCode(params: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const doc = await discover();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  });
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: HTTP ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface AccessTokenClaims {
  sub: string | null;
  roles: string[];
}

/**
 * Reads `sub` and `realm_access.roles` out of the access token payload
 * without verifying its signature. That is deliberate, not a shortcut: this
 * token was obtained a moment ago directly from the realm's own token
 * endpoint over TLS — the trust decision already happened on that call. The
 * signature verification that actually gates access happens server-side, on
 * every API call, independently of anything read here.
 */
export function decodeAccessTokenClaims(token: string): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length < 2) return { sub: null, roles: [] };
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  try {
    const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as {
      sub?: string;
      realm_access?: { roles?: string[] };
    };
    return { sub: claims.sub ?? null, roles: claims.realm_access?.roles ?? [] };
  } catch {
    return { sub: null, roles: [] };
  }
}
