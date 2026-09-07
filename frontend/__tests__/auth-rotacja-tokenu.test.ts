import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Świadkowie rotacji tokenu w `auth.ts` — callbacki `jwt` i `session`.
 *
 * Dlaczego przez przechwycenie konfiguracji, a nie przez import callbacków:
 * `auth.ts` woła `NextAuth({...})` na poziomie modułu i eksportuje wyłącznie
 * `handlers/auth/signIn/signOut`. Callbacki nie są eksportowane. Żeby ich
 * dotknąć BEZ zmiany kodu produkcyjnego, podstawiamy domyślny eksport
 * `next-auth` i zapamiętujemy obiekt konfiguracji, który `auth.ts` sam mu
 * podaje. Mierzymy więc dokładnie tę funkcję, która pojedzie na produkcję —
 * nie jej kopię przepisaną do testu.
 */

const przechwycona = vi.hoisted(() => ({ config: null as unknown }));

interface JwtArg {
  token: Record<string, unknown>;
  user?: unknown;
  account?: unknown;
}
interface SessionArg {
  session: Record<string, unknown>;
  token: Record<string, unknown>;
}
interface NextAuthConfigLike {
  callbacks: {
    jwt: (arg: JwtArg) => Promise<Record<string, unknown>>;
    session: (arg: SessionArg) => Promise<Record<string, unknown>>;
  };
}

// Bez `importOriginal()`: prawdziwy `next-auth` ciągnie w środowisku testowym
// `next/server` po ścieżce, której Node nie rozwiązuje, i moduł nie wstaje w
// ogóle. Podstawiamy więc tylko to, czego `auth.ts` z tego pakietu używa —
// fabrykę `NextAuth` i klasę bazową błędu logowania hasłem.
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
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials";
  },
}));

const ISSUER = "https://konta.example.test/realms/niepodzielni";

/**
 * Access token realmu: nagłówek.payload.podpis, payload w base64url. Podpisu
 * nikt tu nie sprawdza — `auth.ts` też nie i pisze, dlaczego.
 */
function tokenDostepu(sub: string, role: string[]): string {
  const payload = Buffer.from(JSON.stringify({ sub, realm_access: { roles: role } }), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `bmFnbA.${payload}.cG9kcGlz`;
}

async function callbacki(): Promise<NextAuthConfigLike["callbacks"]> {
  await import("@/auth");
  const config = przechwycona.config as NextAuthConfigLike | null;
  if (!config) throw new Error("auth.ts nie oddał konfiguracji do NextAuth");
  return config.callbacks;
}

/** Sesja z ciasteczka, zanim callback `session` cokolwiek na niej ustawi. */
function pustaSesja(): Record<string, unknown> {
  return { user: {}, expires: "2099-01-01T00:00:00.000Z" };
}

let poprzedniIssuer: string | undefined;

beforeEach(() => {
  poprzedniIssuer = process.env.AUTH_KEYCLOAK_ISSUER;
  process.env.AUTH_KEYCLOAK_ISSUER = ISSUER;
});

afterEach(() => {
  if (poprzedniIssuer === undefined) delete process.env.AUTH_KEYCLOAK_ISSUER;
  else process.env.AUTH_KEYCLOAK_ISSUER = poprzedniIssuer;
  vi.unstubAllGlobals();
});

describe("callback jwt: rotacja tokenu konta Fundacji", () => {
  it("token po terminie WRACA ZMIENIONY, a sesja żyje dalej", async () => {
    const { jwt, session } = await callbacki();
    const nowyDostep = tokenDostepu("sub-123", ["uczestniczka", "prowadzaca"]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: nowyDostep,
        refresh_token: "odswiezajacy-2",
        expires_in: 300,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const przed = Date.now();
    const wynik = await jwt({
      token: {
        provider: "keycloak",
        sub: "sub-123",
        accessToken: "stary-dostep",
        refreshToken: "odswiezajacy-1",
        accessTokenExpiresAt: przed - 1000,
        roles: ["uczestniczka"],
      },
    });

    // 1. Rotacja poszła pod endpoint tokenu tego realmu, grantem refresh_token,
    //    tym samym publicznym klientem, bez sekretu.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ISSUER}/protocol/openid-connect/token`);
    const cialo = String(init.body);
    expect(cialo).toContain("grant_type=refresh_token");
    expect(cialo).toContain("refresh_token=odswiezajacy-1");
    expect(cialo).toContain("client_id=psychon-web");

    // 2. Token WRÓCIŁ ZMIENIONY — to jest cała treść tego świadka.
    expect(wynik.accessToken).toBe(nowyDostep);
    expect(wynik.accessToken).not.toBe("stary-dostep");
    expect(wynik.refreshToken).toBe("odswiezajacy-2");
    expect(Number(wynik.accessTokenExpiresAt)).toBeGreaterThan(przed);
    expect(wynik.roles).toEqual(["uczestniczka", "prowadzaca"]);
    expect(wynik.error).toBeUndefined();

    // 3. Sesja przeżyła: użytkowniczka dalej ma token do wołania API.
    const sesja = await session({ session: pustaSesja(), token: wynik });
    expect(sesja.accessToken).toBe(nowyDostep);
    expect(sesja.error).toBeUndefined();
    expect((sesja.user as { roles: string[] }).roles).toEqual(["uczestniczka", "prowadzaca"]);
  });

  it("realm bez nowego refresh_token: stary zostaje w obiegu", async () => {
    const { jwt } = await callbacki();
    const nowyDostep = tokenDostepu("sub-123", []);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: nowyDostep, expires_in: 60 }),
      }),
    );

    const wynik = await jwt({
      token: {
        provider: "keycloak",
        accessToken: "stary-dostep",
        refreshToken: "odswiezajacy-1",
        accessTokenExpiresAt: Date.now() - 1,
        roles: [],
      },
    });

    expect(wynik.accessToken).toBe(nowyDostep);
    expect(wynik.refreshToken).toBe("odswiezajacy-1");
  });

  it("KONTROLA NEGATYWNA: token przed terminem NIE jest rotowany", async () => {
    const { jwt } = await callbacki();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const termin = Date.now() + 60_000;

    const wynik = await jwt({
      token: {
        provider: "keycloak",
        accessToken: "stary-dostep",
        refreshToken: "odswiezajacy-1",
        accessTokenExpiresAt: termin,
        roles: ["uczestniczka"],
      },
    });

    // Implementacja, która rotuje ZAWSZE, przechodzi test wyżej tak samo jak
    // poprawna. Dopiero ta kontrola odróżnia „odświeża, kiedy trzeba" od
    // „bije w realm przy każdym odczycie sesji".
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wynik.accessToken).toBe("stary-dostep");
    expect(wynik.accessTokenExpiresAt).toBe(termin);
  });

  it("KONTROLA NEGATYWNA: drzwi lokalne (credentials) nie mają czego rotować", async () => {
    const { jwt } = await callbacki();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await jwt({
      token: {
        provider: "credentials",
        accessToken: "sanctum-abc",
        refreshToken: null,
        accessTokenExpiresAt: null,
        roles: ["uczestniczka"],
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wynik.accessToken).toBe("sanctum-abc");
    expect(wynik.error).toBeUndefined();
  });
});

describe("callback jwt: nieudana rotacja UPUSZCZA sesję", () => {
  /**
   * Każdy z tych sposobów, na jaki rotacja może nie wyjść, ma dać ten sam
   * wynik: sesja wylogowana — a nie wyjątek i nie martwy token trzymany dalej.
   */
  const awarie: Array<[string, () => unknown]> = [
    [
      "realm odmawia (refresh token unieważniony)",
      () => vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }),
    ],
    ["realm nieosiągalny (fetch rzuca)", () => vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))],
    [
      "realm oddaje odpowiedź bez access_token",
      () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ expires_in: 300 }) }),
    ],
  ];

  for (const [nazwa, zrobFetch] of awarie) {
    it(`${nazwa}: sesja wychodzi wylogowana, bez wyjątku`, async () => {
      const { jwt, session } = await callbacki();
      vi.stubGlobal("fetch", zrobFetch());

      const wynik = await jwt({
        token: {
          provider: "keycloak",
          sub: "sub-123",
          accessToken: "stary-dostep",
          refreshToken: "odswiezajacy-1",
          accessTokenExpiresAt: Date.now() - 1000,
          roles: ["uczestniczka"],
        },
      });

      expect(wynik.error).toBe("RefreshAccessTokenError");
      expect(wynik.accessToken).toBeNull();
      expect(wynik.accessTokenExpiresAt).toBe(0);

      // To, co zobaczy przeglądarka: żadnego tokenu, żadnych ról, jawna flaga
      // błędu — a NIE stary token udający, że wszystko gra.
      const sesja = await session({ session: pustaSesja(), token: wynik });
      expect(sesja.accessToken).toBeNull();
      expect(sesja.expiresAt).toBeNull();
      expect(sesja.error).toBe("RefreshAccessTokenError");
      expect((sesja.user as { roles: string[] }).roles).toEqual([]);
      expect((sesja.user as { id: string }).id).toBe("sub-123");
    });
  }

  it("brak refresh tokenu w sesji: też wylogowanie, bez wołania realmu", async () => {
    const { jwt } = await callbacki();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await jwt({
      token: {
        provider: "keycloak",
        accessToken: "stary-dostep",
        refreshToken: null,
        accessTokenExpiresAt: Date.now() - 1000,
        roles: ["uczestniczka"],
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wynik.error).toBe("RefreshAccessTokenError");
    expect(wynik.accessToken).toBeNull();
  });

  it("brak skonfigurowanego issuera: wylogowanie, a nie ślepy strzał w localhost", async () => {
    const { jwt } = await callbacki();
    delete process.env.AUTH_KEYCLOAK_ISSUER;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await jwt({
      token: {
        provider: "keycloak",
        accessToken: "stary-dostep",
        refreshToken: "odswiezajacy-1",
        accessTokenExpiresAt: Date.now() - 1000,
        roles: [],
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wynik.error).toBe("RefreshAccessTokenError");
  });
});
