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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string | null;
    accessTokenExpiresAt?: number | null;
    roles?: string[];
  }
}
