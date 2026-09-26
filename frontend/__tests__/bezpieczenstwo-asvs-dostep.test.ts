import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Probes for the frontend side of the ASVS 5.0 L2 review of authentication,
 * session management and authorization
 * (`docs/bezpieczenstwo/przeglad-asvs-dostep.md`, sections 3–5).
 *
 * The probe asserts today's state of `auth.ts` (row 7.1.1). It is expected to
 * fail once the gap is fixed; whoever fixes it inverts the assertion and
 * updates the table row. Rows 7.4.1 (b) and 7.6.2 have their own probe files:
 * `bezpieczenstwo-asvs-wylogowanie.test.tsx` and
 * `bezpieczenstwo-asvs-logowanie.test.tsx`.
 *
 * The configuration is captured the same way as in `auth-rotacja-tokenu.test.ts`:
 * the default export of `next-auth` is replaced, so the test reads the exact
 * object `auth.ts` hands to NextAuth, without changing production code.
 */

const przechwycona = vi.hoisted(() => ({ config: null as unknown }));

interface NextAuthConfigLike {
  session?: { strategy?: string; maxAge?: number; updateAge?: number };
}

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    przechwycona.config = config;
    return {
      handlers: {},
      auth: () => null,
      signIn: () => undefined,
      signOut: () => undefined,
    };
  },
}));

async function konfiguracja(): Promise<NextAuthConfigLike> {
  await import("@/auth");
  const config = przechwycona.config as NextAuthConfigLike | null;
  if (!config) throw new Error("auth.ts nie oddał konfiguracji do NextAuth");
  return config;
}

let poprzedniIssuer: string | undefined;

beforeEach(() => {
  poprzedniIssuer = process.env.AUTH_KEYCLOAK_ISSUER;
  process.env.AUTH_KEYCLOAK_ISSUER = "https://konta.example.test/realms/niepodzielni";
});

afterEach(() => {
  if (poprzedniIssuer === undefined) delete process.env.AUTH_KEYCLOAK_ISSUER;
  else process.env.AUTH_KEYCLOAK_ISSUER = poprzedniIssuer;
});

describe("ASVS 7.1.1 / 7.3.x — czas życia sesji frontu", () => {
  it("luka 7.1.1 (przeglad-asvs-dostep.md, wiersz 7.1.1): sesja JWT bez jawnego maxAge, czyli domyślne 30 dni Auth.js", async () => {
    const config = await konfiguracja();

    expect(config.session?.strategy).toBe("jwt");
    expect(config.session?.maxAge).toBeUndefined();
  });
});
