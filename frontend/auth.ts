import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Keycloak from "next-auth/providers/keycloak";

/**
 * The public browser client registered in the account-system realm. Frozen
 * contract value, not a secret and not a host — the client is public (no
 * client secret), PKCE-only. Reading it from the environment would let a
 * misconfigured deployment silently sign users in against the wrong client,
 * so it stays a literal, the same way the API's own accepted audience is a
 * literal in its config rather than an environment value.
 */
const ACCOUNT_SYSTEM_CLIENT_ID = "psychon-web";

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
        if (!email || !password) return null;

        let res: Response;
        try {
          res = await fetch(`${apiBaseUrl()}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ email, password }),
          });
        } catch {
          return null;
        }
        if (!res.ok) return null;

        const json = (await res.json()) as {
          data?: { token?: string; user?: { id: number; role: string } };
        };
        const token = json.data?.token;
        const user = json.data?.user;
        if (!token || !user) return null;

        return { id: String(user.id), role: user.role, accessToken: token };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "keycloak") {
        token.sub = (account.providerAccountId as string | undefined) ?? token.sub;
        token.accessToken = (account.access_token as string | undefined) ?? null;
        token.accessTokenExpiresAt = account.expires_at
          ? Number(account.expires_at) * 1000
          : null;
        token.roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
      } else if (account?.provider === "credentials" && user) {
        const local = user as { id: string; role?: string; accessToken?: string };
        token.sub = local.id;
        token.accessToken = local.accessToken ?? null;
        // A Sanctum token carries no exposed expiry claim — the session's
        // upper bound is the JWT cookie's own lifetime, not this field.
        token.accessTokenExpiresAt = null;
        token.roles = local.role ? [local.role] : [];
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = (token.accessToken as string | null | undefined) ?? null;
      session.expiresAt = (token.accessTokenExpiresAt as number | null | undefined) ?? null;
      session.user = {
        ...session.user,
        id: (token.sub as string | undefined) ?? "",
        roles: (token.roles as string[] | undefined) ?? [],
      };
      return session;
    },
  },
});
