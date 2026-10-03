import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trzecia przyczyna 401 z dowolnej trasy biznesowej (obok „konto niepowiązane”
 * i „sesja naprawdę nieważna”, patrz `api-401-bez-petli.test.ts`): konto jest
 * zablokowane. Serwer sam to mówi — 401 z `error.code = "konto_zablokowane"`,
 * w kopercie bez `reason` — więc klient czyta kod PRZED rozstrzygnięciem 401 i
 * przechodzi na `/logowanie/zablokowane` bez pytania `GET /sso/whoami` i bez
 * kończenia sesji (przycisk „Wyloguj się” na tym ekranie robi to sam). Kończenie
 * sesji i skok na `/logowanie` dałyby pętlę: SSO wraca bez pytania, `/me` znów
 * odpowiada 401.
 *
 * Kontrola: kod nieznany klientowi i `konto_niepowiazane` zachowują się jak dotąd.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

async function swiezyModul() {
  vi.resetModules();
  return import("@/lib/api");
}

function zbudujFetch(odpowiedzMe: unknown, whoamiOk = true) {
  const wywolania: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    wywolania.push(url);
    if (url.includes("/api/auth/session")) {
      return { ok: true, json: async () => ({ accessToken: "token-abc", expiresAt: Date.now() + 600_000 }) };
    }
    if (url.includes("/sso/whoami")) {
      return whoamiOk
        ? { ok: true, status: 200, json: async () => ({ sub: "sub-123", roles: ["volunteer"] }) }
        : { ok: false, status: 401, json: async () => ({ error: { status: 401, code: "invalid_token", message: "x" } }) };
    }
    return { ok: false, status: 401, json: async () => odpowiedzMe };
  });
  return { fetchMock, wywolania };
}

const BLOKADA = {
  error: { status: 401, code: "konto_zablokowane", message: "To konto jest zablokowane." },
};

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  signOutMock.mockClear();
  assign = vi.fn();
  prawdziwaLokalizacja = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, origin: "https://platforma.example.org" },
  });
});

afterEach(() => {
  if (prawdziwaLokalizacja) Object.defineProperty(window, "location", prawdziwaLokalizacja);
  vi.unstubAllGlobals();
});

describe("401 z kodem konto_zablokowane", () => {
  it("ląduje na /logowanie/zablokowane, nie na /logowanie/niepowiazane i nie na /logowanie", async () => {
    const { api } = await swiezyModul();
    const { fetchMock } = zbudujFetch(BLOKADA);
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/me")).rejects.toMatchObject({ status: 401, code: "konto_zablokowane" });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(String(assign.mock.calls[0][0])).toBe("https://platforma.example.org/logowanie/zablokowane");
  });

  it("nie pyta o whoami (serwer sam nazwał stan) i nie kończy sesji — brak pętli ponownego logowania", async () => {
    const { api } = await swiezyModul();
    const { fetchMock, wywolania } = zbudujFetch(BLOKADA);
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(wywolania.filter((adres) => adres.includes("/sso/whoami"))).toHaveLength(0);
    expect(signOutMock).not.toHaveBeenCalled();
    const cele = assign.mock.calls.map((wywolanie) => String(wywolanie[0]));
    expect(cele.some((cel) => cel === "https://platforma.example.org/logowanie")).toBe(false);
    expect(cele).toHaveLength(1);
  });
});

describe("kontrola: pozostałe 401 zachowują się jak dotąd", () => {
  it("kod nieznany klientowi przy ważnej sesji → /logowanie/niepowiazane (whoami pytane)", async () => {
    const { api } = await swiezyModul();
    const { fetchMock, wywolania } = zbudujFetch({
      error: { status: 401, code: "kod_ktorego_klient_nie_zna", message: "x" },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(String(assign.mock.calls[0][0])).toBe("https://platforma.example.org/logowanie/niepowiazane");
    expect(wywolania.filter((adres) => adres.includes("/sso/whoami"))).toHaveLength(1);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("kod nieznany klientowi przy sesji nieważnej → koniec sesji i /logowanie", async () => {
    const { api } = await swiezyModul();
    const { fetchMock } = zbudujFetch(
      { error: { status: 401, code: "kod_ktorego_klient_nie_zna", message: "x" } },
      false,
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(String(assign.mock.calls[0][0])).toBe("https://platforma.example.org/logowanie");
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("zwykłe unauthenticated bez szczegółów przy ważnej sesji → /logowanie/niepowiazane", async () => {
    const { api } = await swiezyModul();
    const { fetchMock } = zbudujFetch({
      error: { status: 401, code: "unauthenticated", message: "Zaloguj się, aby kontynuować." },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/me")).rejects.toMatchObject({ status: 401 });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(String(assign.mock.calls[0][0])).toBe("https://platforma.example.org/logowanie/niepowiazane");
  });

  it("konto_niepowiazane z sub → /logowanie/niepowiazane", async () => {
    const { api } = await swiezyModul();
    const { fetchMock } = zbudujFetch({
      error: { status: 401, code: "konto_niepowiazane", message: "x", reason: { sub: "sub-123" } },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/me")).rejects.toMatchObject({ status: 401, code: "konto_niepowiazane" });

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(String(assign.mock.calls[0][0])).toBe("https://platforma.example.org/logowanie/niepowiazane");
  });
});

describe("checkAccountBinding: kod z odpowiedzi", () => {
  it("oddaje kod konto_zablokowane bez sub", async () => {
    const { checkAccountBinding } = await swiezyModul();
    const { fetchMock } = zbudujFetch(BLOKADA);
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await checkAccountBinding();
    expect(wynik).toEqual({ code: "konto_zablokowane" });
    expect(wynik?.sub).toBeUndefined();
  });

  it("konto niepowiązane nadal oddaje kod i sub", async () => {
    const { checkAccountBinding } = await swiezyModul();
    const { fetchMock } = zbudujFetch({
      error: { status: 401, code: "konto_niepowiazane", message: "x", reason: { sub: "sub-123" } },
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await checkAccountBinding()).toEqual({ code: "konto_niepowiazane", sub: "sub-123" });
  });
});
