import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adres systemu kont w `auth.ts` jest wartością konfiguracji
 * (`AUTH_KEYCLOAK_ISSUER`), a nie stałą w kodzie: dostawca logowania dostaje
 * dokładnie tę wartość, a bez niej nie dostaje żadnego adresu zastępczego.
 *
 * Konfigurację dostawcy przechwytujemy z wywołania fabryki `Keycloak(...)`,
 * które `auth.ts` wykonuje przy imporcie — mierzymy więc obiekt, który
 * pojedzie na produkcję, bez zmiany kodu produkcyjnego.
 */

const przechwycone = vi.hoisted(() => ({ opcje: null as null | { issuer?: unknown } }));

vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {},
    auth: () => null,
    signIn: () => undefined,
    signOut: () => undefined,
  }),
}));

vi.mock("next-auth/providers/keycloak", () => ({
  default: (opcje: { issuer?: unknown }) => {
    przechwycone.opcje = opcje;
    return { id: "keycloak", ...opcje };
  },
}));

async function issuerDostawcy(): Promise<unknown> {
  vi.resetModules();
  przechwycone.opcje = null;
  await import("@/auth");
  // Rzutowanie: TypeScript po przypisaniu `null` wyżej nie widzi, że import
  // wypełnia pole przez atrapę dostawcy.
  const opcje = przechwycone.opcje as { issuer?: unknown } | null;
  if (!opcje) throw new Error("auth.ts nie utworzył dostawcy Keycloak");
  return opcje.issuer;
}

let poprzedni: string | undefined;

beforeEach(() => {
  poprzedni = process.env.AUTH_KEYCLOAK_ISSUER;
});

afterEach(() => {
  if (poprzedni === undefined) delete process.env.AUTH_KEYCLOAK_ISSUER;
  else process.env.AUTH_KEYCLOAK_ISSUER = poprzedni;
});

describe("auth.ts: adres systemu kont z konfiguracji", () => {
  it("dostawca logowania dostaje adres dokładnie z AUTH_KEYCLOAK_ISSUER, także po jego zmianie", async () => {
    process.env.AUTH_KEYCLOAK_ISSUER = "https://konta.example.test/realms/pierwszy";
    expect(await issuerDostawcy()).toBe("https://konta.example.test/realms/pierwszy");

    process.env.AUTH_KEYCLOAK_ISSUER = "https://konta.example.test/realms/drugi";
    expect(await issuerDostawcy()).toBe("https://konta.example.test/realms/drugi");
  });

  it("KONTROLA NEGATYWNA: bez AUTH_KEYCLOAK_ISSUER dostawca nie dostaje żadnego adresu zastępczego", async () => {
    delete process.env.AUTH_KEYCLOAK_ISSUER;
    expect(await issuerDostawcy()).toBeUndefined();
  });
});
