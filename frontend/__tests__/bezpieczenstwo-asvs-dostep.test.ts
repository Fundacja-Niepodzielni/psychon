import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Probes for the frontend side of the ASVS 5.0 L2 review of authentication,
 * session management and authorization
 * (`docs/bezpieczenstwo/przeglad-asvs-dostep.md`, sections 3–5).
 *
 * `it.todo` entries describe the target state of each open gap and keep the
 * gate green. The one active test measures today's state of `auth.ts`; it is
 * expected to fail once row 7.1.1 is fixed, and must then be replaced by the
 * target assertion from its `it.todo`.
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
  it("stan dziś (luka 7.1.1): sesja JWT bez jawnego maxAge, czyli domyślne 30 dni Auth.js", async () => {
    const config = await konfiguracja();

    expect(config.session?.strategy).toBe("jwt");
    expect(config.session?.maxAge).toBeUndefined();
  });

  it.todo(
    "luka 7.1.1 (przeglad-asvs-dostep.md, wiersz 7.1.1): session.maxAge jest ustawione jawnie i nie przekracza udokumentowanego limitu sesji SSO",
  );
});

describe("ASVS 7.4.1 — wylogowanie kończy sesję także w systemie kont", () => {
  it.todo(
    "luka 7.4.1 punkt b (przeglad-asvs-dostep.md, wiersz 7.4.1): gdy adresu wylogowania nie da się odczytać, PanelShell i tak kończy sesję systemu kont — dziś przypina to odwrotnie components/layout/__tests__/panelshell-wylogowanie.test.tsx",
  );
});

describe("ASVS 7.6.2 — sesja powstaje dopiero po działaniu użytkownika", () => {
  it.todo(
    "luka 7.6.2 (przeglad-asvs-dostep.md, wiersz 7.6.2): /logowanie bez ?error= nie woła signIn przed kliknięciem przycisku — dziś przypina to odwrotnie app/logowanie/__tests__/logowanie-stany.test.tsx",
  );
});
