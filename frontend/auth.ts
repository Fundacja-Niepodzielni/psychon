import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Keycloak from "next-auth/providers/keycloak";

/**
 * The public browser client registered in the account-system realm. Frozen
 * contract value, not a secret and not a host — the client is public (no
 * client secret), PKCE-only. Reading it from the environment would let a
 * misconfigured deployment silently sign users in against the wrong client,
 * so it stays a literal, the same way the API's own accepted audience is a
 * literal in its config rather than an environment value. Exported: the
 * end-session route needs the same value to build the IdP's logout URL.
 */
export const ACCOUNT_SYSTEM_CLIENT_ID = "psychon-web";

function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

/**
 * Reads `sub` and `realm_access.roles` out of an access token payload
 * without verifying its signature. That is deliberate, not a shortcut: this
 * token was obtained a moment ago directly from the realm's own token
 * endpoint over TLS — the trust decision already happened on that call. The
 * signature verification that actually gates access happens server-side, on
 * every API call, independently of anything read here.
 */
function decodeAccessTokenClaims(token: string): { sub: string | null; roles: string[] } {
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

/**
 * Thrown from the Credentials `authorize` callback so the local `/logowanie`
 * screen can show exactly what the backend answered — the same 429
 * rate-limit wait and 422 per-field errors the pre-Auth.js screen showed.
 * `signIn()` with `redirect: false` only ever returns a `type`, never a
 * response body; `CredentialsSignin.code` is the one field Auth.js carries
 * back to the client unredacted (via the `code` query param), so the whole
 * backend error envelope travels there as JSON.
 */
class CredentialsLoginError extends CredentialsSignin {
  constructor(payload: LoginErrorPayload) {
    super();
    this.code = JSON.stringify(payload);
  }
}

export interface LoginErrorPayload {
  status: number;
  code: string;
  message: string;
  errors?: Record<string, string[]>;
}

/**
 * Exchanges a refresh token for a new access token at the realm's token
 * endpoint. Public client, PKCE-only — no client secret, same as the
 * authorization-code exchange Auth.js already performs for this provider.
 */
async function refreshKeycloakAccessToken(
  refreshToken: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string | null; expiresAt: number; roles: string[] }
  | { ok: false }
> {
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  if (!issuer) return { ok: false };

  try {
    const res = await fetch(`${issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: ACCOUNT_SYSTEM_CLIENT_ID,
      }),
    });
    if (!res.ok) return { ok: false };

    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!body.access_token || !body.expires_in) return { ok: false };

    const claims = decodeAccessTokenClaims(body.access_token);
    return {
      ok: true,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: Date.now() + body.expires_in * 1000,
      roles: claims.roles,
    };
  } catch {
    return { ok: false };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/logowanie/konta", error: "/logowanie/konta" },
  providers: [
    Keycloak({
      clientId: ACCOUNT_SYSTEM_CLIENT_ID,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
      // Public client, no secret: the realm never issues one for it, and
      // authentication at the token endpoint relies on PKCE instead.
      client: { token_endpoint_auth_method: "none" },
      checks: ["pkce", "state"],
      authorization: { params: { scope: "openid" } },
      // Roles come from the access token's own `realm_access.roles`, never
      // from the ID token or a userinfo call — the account system mints the
      // audience mapper on the access token only.
      profile(profile, tokens) {
        const claims = decodeAccessTokenClaims(tokens.access_token ?? "");
        return {
          id: claims.sub ?? String(profile.sub ?? ""),
          roles: claims.roles,
        };
      },
    }),
    Credentials({
      id: "credentials",
      name: "Hasło",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : null;
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password) {
          throw new CredentialsLoginError({
            status: 422,
            code: "validation_error",
            message: "Podaj adres e-mail i hasło.",
          });
        }

        let res: Response;
        try {
          res = await fetch(`${apiBaseUrl()}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ email, password }),
          });
        } catch {
          throw new CredentialsLoginError({
            status: 0,
            code: "network_error",
            message: "Nie udało się połączyć z serwerem. Sprawdź, czy backend działa.",
          });
        }

        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          // brak JSON-a w odpowiedzi — obsłużone niżej przez samą treść statusu
        }

        if (!res.ok) {
          const err = (json as { error?: Partial<LoginErrorPayload> } | null)?.error;
          throw new CredentialsLoginError({
            status: err?.status ?? res.status,
            code: err?.code ?? "unknown_error",
            message: err?.message ?? "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
            errors: err?.errors,
          });
        }

        const body = json as { data?: { token?: string; user?: { id: number; role: string } } } | null;
        const token = body?.data?.token;
        const user = body?.data?.user;
        if (!token || !user) {
          throw new CredentialsLoginError({
            status: 401,
            code: "invalid_credentials",
            message: "Nieprawidłowy e-mail lub hasło.",
          });
        }

        return { id: String(user.id), role: user.role, accessToken: token };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "keycloak") {
        token.provider = "keycloak";
        token.sub = (account.providerAccountId as string | undefined) ?? token.sub;
        token.accessToken = (account.access_token as string | undefined) ?? null;
        token.refreshToken = (account.refresh_token as string | undefined) ?? null;
        token.idToken = (account.id_token as string | undefined) ?? null;
        token.accessTokenExpiresAt = account.expires_at
          ? Number(account.expires_at) * 1000
          : null;
        token.roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
        delete token.error;
        return token;
      }
      if (account?.provider === "credentials" && user) {
        const local = user as { id: string; role?: string; accessToken?: string };
        token.provider = "credentials";
        token.sub = local.id;
        token.accessToken = local.accessToken ?? null;
        token.refreshToken = null;
        token.idToken = null;
        // A Sanctum token carries no exposed expiry claim — the session's
        // upper bound is the JWT cookie's own lifetime, not this field.
        token.accessTokenExpiresAt = null;
        token.roles = local.role ? [local.role] : [];
        delete token.error;
        return token;
      }

      // No `account`/`user` on this call: an existing session being read
      // again, not a fresh sign-in. Only the account-system door carries an
      // expiry and a refresh token — the local door's Sanctum token has
      // neither, so there is nothing to rotate there — the backend never
      // exposes an expiry for it.
      if (
        token.provider === "keycloak" &&
        typeof token.accessTokenExpiresAt === "number" &&
        Date.now() >= token.accessTokenExpiresAt
      ) {
        const refreshToken = token.refreshToken as string | null | undefined;
        const refreshed = refreshToken ? await refreshKeycloakAccessToken(refreshToken) : null;
        if (refreshed?.ok) {
          token.accessToken = refreshed.accessToken;
          token.refreshToken = refreshed.refreshToken ?? refreshToken;
          token.accessTokenExpiresAt = refreshed.expiresAt;
          token.roles = refreshed.roles;
          delete token.error;
        } else {
          // Rotation failed (refresh token expired/revoked, or the realm is
          // unreachable): drop the session instead of keeping a dead one —
          // `session()` below turns this into no accessToken and no roles,
          // and `lib/api.ts` reads the `error` flag to end the browser
          // session outright rather than let the app keep saying "signed in".
          token.accessToken = null;
          token.accessTokenExpiresAt = 0;
          token.error = "RefreshAccessTokenError";
        }
      }

      return token;
    },
    async session({ session, token }) {
      const failed = token.error === "RefreshAccessTokenError";
      session.accessToken = failed ? null : ((token.accessToken as string | null | undefined) ?? null);
      session.expiresAt = failed ? null : ((token.accessTokenExpiresAt as number | null | undefined) ?? null);
      session.error = failed ? "RefreshAccessTokenError" : undefined;
      session.user = {
        ...session.user,
        id: (token.sub as string | undefined) ?? "",
        roles: failed ? [] : ((token.roles as string[] | undefined) ?? []),
      };
      return session;
    },
  },
});
