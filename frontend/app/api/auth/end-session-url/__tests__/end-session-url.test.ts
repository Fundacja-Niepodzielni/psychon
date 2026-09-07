// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Świadek wylogowania po stronie kont Fundacji.
 *
 * Sam `signOut()` kończy tylko ciasteczko tej aplikacji — ciasteczko SSO
 * realmu w przeglądarce je przeżywa i drugie kliknięcie „Zaloguj się przez
 * Konta Niepodzielni" wpuszcza bez hasła. Zamyka to dopiero nawigacja pod
 * `end_session_endpoint` realmu, z `id_token_hint` i
 * `post_logout_redirect_uri`. Ten adres buduje ta trasa i to on jest tu
 * mierzony: nie „czy coś zwróciła", tylko CZY NIÓSŁ OBA PARAMETRY.
 */

vi.mock("next-auth", () => ({
  // `auth.ts` (skąd trasa bierze identyfikator klienta) woła NextAuth na
  // poziomie modułu; w teście podstawiamy fabrykę, żeby wziąć z niego samą
  // stałą, bez stawiania całego Auth.js.
  default: () => ({ handlers: {}, auth: () => null, signIn: () => undefined, signOut: () => undefined }),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));

const getTokenMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));

const ISSUER = "https://konta.example.test/realms/niepodzielni";
const ADRES = "https://szkolenia.example.test/api/auth/end-session-url";

async function adresWylogowania(): Promise<string> {
  const { GET } = await import("@/app/api/auth/end-session-url/route");
  const odpowiedz = await GET(new NextRequest(ADRES));
  const { url } = (await odpowiedz.json()) as { url: string };
  return url;
}

let poprzedniIssuer: string | undefined;
let poprzedniSekret: string | undefined;

beforeEach(() => {
  poprzedniIssuer = process.env.AUTH_KEYCLOAK_ISSUER;
  poprzedniSekret = process.env.AUTH_SECRET;
  process.env.AUTH_KEYCLOAK_ISSUER = ISSUER;
  process.env.AUTH_SECRET = "sekret-tylko-testowy";
  getTokenMock.mockReset();
});

afterEach(() => {
  if (poprzedniIssuer === undefined) delete process.env.AUTH_KEYCLOAK_ISSUER;
  else process.env.AUTH_KEYCLOAK_ISSUER = poprzedniIssuer;
  if (poprzedniSekret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = poprzedniSekret;
});

describe("adres wylogowania z systemu kont", () => {
  it("prowadzi pod end_session_endpoint realmu z id_token_hint i post_logout_redirect_uri", async () => {
    getTokenMock.mockResolvedValue({ idToken: "id-token-tej-sesji", sub: "sub-123" });

    const url = new URL(await adresWylogowania());

    // 1. Ten realm, jego własny endpoint wylogowania — nie ekran aplikacji.
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/protocol/openid-connect/logout`);

    // 2. Oba parametry, o które chodzi w tym plastrze. Bez `id_token_hint`
    //    realm pyta „czy na pewno wylogować", bez `post_logout_redirect_uri`
    //    nie ma dokąd wrócić — obie luki wyglądają w przeglądarce identycznie
    //    jak działające wylogowanie, dopóki ktoś nie kliknie drugi raz.
    expect(url.searchParams.get("id_token_hint")).toBe("id-token-tej-sesji");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://szkolenia.example.test/api/auth/callback/keycloak",
    );

    // 3. Ten sam publiczny klient, którym się logowano.
    expect(url.searchParams.get("client_id")).toBe("psychon-web");

    // Sekret sesji nigdy nie idzie w adresie widocznym w przeglądarce.
    expect(url.search).not.toContain("sekret-tylko-testowy");
  });

  it("bierze identyfikator klienta z auth.ts, a nie z własnej kopii", async () => {
    getTokenMock.mockResolvedValue({ idToken: "id-token-tej-sesji" });
    const { ACCOUNT_SYSTEM_CLIENT_ID } = await import("@/auth");

    const url = new URL(await adresWylogowania());

    expect(url.searchParams.get("client_id")).toBe(ACCOUNT_SYSTEM_CLIENT_ID);
  });

  it("sesja bez id tokenu: adres realmu bez pustego id_token_hint", async () => {
    getTokenMock.mockResolvedValue({ sub: "sub-123" });

    const url = new URL(await adresWylogowania());

    // Pusty `id_token_hint` jest gorszy niż jego brak: realm odrzuca żądanie,
    // zamiast zapytać użytkowniczkę.
    expect(url.searchParams.has("id_token_hint")).toBe(false);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://szkolenia.example.test/api/auth/callback/keycloak",
    );
  });

  it("KONTROLA NEGATYWNA: bez skonfigurowanego realmu wraca ekran logowania, nie adres realmu", async () => {
    delete process.env.AUTH_KEYCLOAK_ISSUER;
    getTokenMock.mockResolvedValue({ idToken: "id-token-tej-sesji" });

    const url = await adresWylogowania();

    expect(url).toBe("https://szkolenia.example.test/logowanie/konta");
    expect(url).not.toContain("openid-connect/logout");
  });
});
