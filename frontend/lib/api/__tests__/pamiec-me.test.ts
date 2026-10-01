import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OKNO_PAMIECI_ME_MS,
  czyOdczytKonta,
  czySciezkaMe,
  odczytajMe,
  wyczyscPamiecMe,
} from "@/lib/api/pamiec-me";

/**
 * Pamięć odpowiedzi `GET /me` (`lib/api/pamiec-me.ts`) — każda reguła ma tu
 * osobny test: na samym module (część I) i przez prawdziwy transport
 * `api()` z atrapą `fetch` (część II). Część III pilnuje izolacji między
 * testami (reset w `__tests__/setup.ts`).
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

/** Odroczona obietnica — pozwala rozstrzygnąć żądanie „w locie" ręcznie. */
function odroczona<T>() {
  let spelnij!: (v: T) => void;
  let odrzuc!: (e: unknown) => void;
  const obietnica = new Promise<T>((res, rej) => {
    spelnij = res;
    odrzuc = rej;
  });
  return { obietnica, spelnij, odrzuc };
}

describe("I. moduł pamięci", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T05:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("okno gotowej odpowiedzi nie przekracza 10 s (limit z założeń)", () => {
    expect(OKNO_PAMIECI_ME_MS).toBeGreaterThan(0);
    expect(OKNO_PAMIECI_ME_MS).toBeLessThanOrEqual(10_000);
  });

  it("reguła 1: klucz to token — inny token to nowe żądanie, nigdy cudza odpowiedź", async () => {
    const pobierzA = vi.fn(async () => ({ data: { id: 1 } }));
    const pobierzB = vi.fn(async () => ({ data: { id: 2 } }));

    expect(await odczytajMe("token-a", pobierzA)).toEqual({ data: { id: 1 } });
    expect(await odczytajMe("token-b", pobierzB)).toEqual({ data: { id: 2 } });
    expect(pobierzB).toHaveBeenCalledTimes(1);

    // Pamięć trzyma jeden wpis (bieżący token): powrót do „a" to znów żądanie.
    const pobierzA2 = vi.fn(async () => ({ data: { id: 1 } }));
    await odczytajMe("token-a", pobierzA2);
    expect(pobierzA2).toHaveBeenCalledTimes(1);
  });

  it("reguła 1: brak tokenu (null) to osobny klucz, nie wspólny z tokenem", async () => {
    await odczytajMe("token-a", async () => ({ data: 1 }));
    const pobierzBez = vi.fn(async () => ({ data: 2 }));
    expect(await odczytajMe(null, pobierzBez)).toEqual({ data: 2 });
    expect(pobierzBez).toHaveBeenCalledTimes(1);
  });

  it("reguła 2: równoległe odczyty dzielą jedno żądanie w locie", async () => {
    const zadanie = odroczona<unknown>();
    const pobierz = vi.fn(() => zadanie.obietnica);

    const a = odczytajMe("t", pobierz);
    const b = odczytajMe("t", pobierz);
    const c = odczytajMe("t", pobierz);
    expect(pobierz).toHaveBeenCalledTimes(1);

    zadanie.spelnij({ data: { id: 7 } });
    expect(await Promise.all([a, b, c])).toEqual([
      { data: { id: 7 } },
      { data: { id: 7 } },
      { data: { id: 7 } },
    ]);
  });

  it("reguła 3: gotowa odpowiedź jest oddawana w oknie, a po jego upływie pobierana na nowo", async () => {
    const pobierz = vi.fn(async () => ({ data: { id: 1 } }));
    await odczytajMe("t", pobierz);

    vi.advanceTimersByTime(OKNO_PAMIECI_ME_MS - 1);
    await odczytajMe("t", pobierz);
    expect(pobierz).toHaveBeenCalledTimes(1);

    // Odczyt z pamięci NIE odnawia okna: liczy się od nadejścia odpowiedzi.
    vi.advanceTimersByTime(1);
    await odczytajMe("t", pobierz);
    expect(pobierz).toHaveBeenCalledTimes(2);
  });

  it("reguła 4: czyszczenie wyrzuca gotową odpowiedź", async () => {
    const pobierz = vi.fn(async () => ({ data: { id: 1 } }));
    await odczytajMe("t", pobierz);
    wyczyscPamiecMe();
    await odczytajMe("t", pobierz);
    expect(pobierz).toHaveBeenCalledTimes(2);
  });

  it("reguła 4: odpowiedź żądania wystartowanego PRZED czyszczeniem nie wraca do pamięci", async () => {
    const stare = odroczona<unknown>();
    const pobierzStare = vi.fn(() => stare.obietnica);
    const pierwszy = odczytajMe("t", pobierzStare);

    wyczyscPamiecMe();
    stare.spelnij({ data: { id: "stare" } });
    await pierwszy;

    const pobierzNowe = vi.fn(async () => ({ data: { id: "nowe" } }));
    expect(await odczytajMe("t", pobierzNowe)).toEqual({ data: { id: "nowe" } });
    expect(pobierzNowe).toHaveBeenCalledTimes(1);
  });

  it("reguła 4: odczyt po czyszczeniu nie dołącza do żądania w locie sprzed czyszczenia", async () => {
    const stare = odroczona<unknown>();
    void odczytajMe("t", () => stare.obietnica);
    wyczyscPamiecMe();

    const pobierzNowe = vi.fn(async () => ({ data: { id: "nowe" } }));
    expect(await odczytajMe("t", pobierzNowe)).toEqual({ data: { id: "nowe" } });
    expect(pobierzNowe).toHaveBeenCalledTimes(1);
    stare.spelnij({ data: { id: "stare" } });
  });

  it("reguła 5: błąd nie jest pamiętany — następny odczyt pyta znowu", async () => {
    const pobierz = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce({ data: { id: 1 } });

    await expect(odczytajMe("t", pobierz)).rejects.toThrow("503");
    expect(await odczytajMe("t", pobierz)).toEqual({ data: { id: 1 } });
    expect(pobierz).toHaveBeenCalledTimes(2);
  });

  it("reguła 5: błąd żądania w locie dostają wszyscy czekający, a mimo to nie zostaje w pamięci", async () => {
    const zadanie = odroczona<unknown>();
    const pobierz = vi.fn(() => zadanie.obietnica);
    const a = odczytajMe("t", pobierz);
    const b = odczytajMe("t", pobierz);
    zadanie.odrzuc(new Error("503"));
    await expect(a).rejects.toThrow("503");
    await expect(b).rejects.toThrow("503");
    expect(pobierz).toHaveBeenCalledTimes(1);

    const pobierzPonownie = vi.fn(async () => ({ data: { id: 1 } }));
    await odczytajMe("t", pobierzPonownie);
    expect(pobierzPonownie).toHaveBeenCalledTimes(1);
  });

  it("reguła 6: zmiana odpowiedzi przez jednego wywołującego nie psuje innych ani pamięci", async () => {
    const pobierz = vi.fn(async () => ({ data: { id: 1, adres: { miasto: "Gdańsk" }, role: "volunteer" } }));

    const pierwszy = (await odczytajMe("t", pobierz)) as { data: { adres: { miasto: string }; role: string } };
    pierwszy.data.role = "super_admin";
    pierwszy.data.adres.miasto = "Zmienione";

    const drugi = (await odczytajMe("t", pobierz)) as { data: { adres: { miasto: string }; role: string } };
    expect(pobierz).toHaveBeenCalledTimes(1);
    expect(drugi.data.role).toBe("volunteer");
    expect(drugi.data.adres.miasto).toBe("Gdańsk");
    expect(drugi).not.toBe(pierwszy);
  });

  it("reguła 6: wywołujący czekający na to samo żądanie w locie dostają osobne kopie", async () => {
    const zadanie = odroczona<unknown>();
    const a = odczytajMe("t", () => zadanie.obietnica);
    const b = odczytajMe("t", () => zadanie.obietnica);
    zadanie.spelnij({ data: { role: "volunteer" } });

    const [ka, kb] = (await Promise.all([a, b])) as { data: { role: string } }[];
    expect(ka).not.toBe(kb);
    ka.data.role = "zmieniona";
    expect(kb.data.role).toBe("volunteer");
  });

  it("rozpoznanie ścieżek: pamiętany jest tylko GET /me, a zmiany całej rodziny /me czyszczą", () => {
    expect(czyOdczytKonta("/me", "GET")).toBe(true);
    expect(czyOdczytKonta("/me?x=1", "GET")).toBe(true);
    expect(czyOdczytKonta("/me", "PATCH")).toBe(false);
    expect(czyOdczytKonta("/me/exports", "GET")).toBe(false);
    expect(czyOdczytKonta("/mentor", "GET")).toBe(false);
    expect(czySciezkaMe("/me")).toBe(true);
    expect(czySciezkaMe("/me/exports")).toBe(true);
    expect(czySciezkaMe("/mentor")).toBe(false);
    expect(czySciezkaMe("/admin/me")).toBe(false);
  });
});

describe("II. przez transport api()", () => {
  interface Stan {
    token: string | null;
    wywolaniaMe: number;
    wywolania: string[];
    /** Odpowiedź na `GET /me`; domyślnie 200 z kontem. */
    odpowiedzMe: () => Promise<unknown>;
  }

  let stan: Stan;
  let assign: ReturnType<typeof vi.fn>;
  let prawdziwaLokalizacja: PropertyDescriptor | undefined;

  function odp(status: number, cialo: unknown) {
    return { ok: status >= 200 && status < 300, status, json: async () => cialo };
  }

  const konto = () => odp(200, { data: { id: 17, role: "volunteer", address: { city: "Gdańsk" } } });

  beforeEach(() => {
    signOutMock.mockClear();
    stan = {
      token: "token-a",
      wywolaniaMe: 0,
      wywolania: [],
      odpowiedzMe: async () => konto(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metoda = (init?.method ?? "GET").toUpperCase();
        stan.wywolania.push(`${metoda} ${url}`);
        // Sesja Auth.js: wygasa „natychmiast", więc token bywa pytany za każdym razem.
        if (url.includes("/api/auth/session")) {
          return odp(200, { accessToken: stan.token, expiresAt: Date.now() + 1_000 });
        }
        // Sesja Kont ważna (konto tylko niepowiązane): 401 nie kończy sesji, więc
        // czyszczenie pamięci po 401 musi pochodzić z samego transportu.
        if (url.includes("/sso/whoami")) return odp(200, { sub: "sub-1", roles: ["volunteer"] });
        if (url.endsWith("/me") && metoda === "GET") {
          stan.wywolaniaMe += 1;
          return stan.odpowiedzMe();
        }
        if (url.endsWith("/me") && metoda === "PATCH") return odp(200, { data: { id: 17, role: "volunteer" } });
        if (url.endsWith("/courses")) return odp(200, { data: [] });
        if (url.endsWith("/forbidden")) return odp(401, { error: { status: 401, code: "unauthenticated", message: "Brak." } });
        return odp(200, { data: { adres: url } });
      }),
    );
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

  /** Świeży klient (cache sesji i pamięć `/me` w nowych instancjach modułów). */
  async function swiezyKlient() {
    vi.resetModules();
    return import("@/lib/api");
  }

  it("dwa kolejne api('/me') z tym samym tokenem to jedno żądanie sieciowe", async () => {
    const { api } = await swiezyKlient();
    const a = await api<{ role: string }>("/me");
    const b = await api<{ role: string }>("/me");
    expect(a.role).toBe("volunteer");
    expect(b.role).toBe("volunteer");
    expect(stan.wywolaniaMe).toBe(1);
  });

  it("równoległe api('/me') (strażnik, powłoka, ekran) to jedno żądanie sieciowe", async () => {
    const { api } = await swiezyKlient();
    await Promise.all([api("/me"), api("/me"), api("/me")]);
    expect(stan.wywolaniaMe).toBe(1);
  });

  it("reguła 1: zmiana tokenu daje nowe żądanie", async () => {
    const { api } = await swiezyKlient();
    await api("/me");
    stan.token = "token-b";
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 3: po upływie okna api('/me') pyta serwer na nowo", async () => {
    const { api } = await swiezyKlient();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-01T05:00:00Z"));
      await api("/me");
      vi.setSystemTime(new Date("2026-10-01T05:00:00Z").getTime() + OKNO_PAMIECI_ME_MS - 1);
      await api("/me");
      expect(stan.wywolaniaMe).toBe(1);
      vi.setSystemTime(new Date("2026-10-01T05:00:00Z").getTime() + OKNO_PAMIECI_ME_MS);
      await api("/me");
      expect(stan.wywolaniaMe).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reguła 4: PATCH /me czyści pamięć — następny GET /me pyta serwer", async () => {
    const { api } = await swiezyKlient();
    await api("/me");
    await api("/me", { method: "PATCH", body: { phone: "+48 600 100 200" } });
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 4: GET /me wystartowany w trakcie PATCH /me nie zapisuje starej treści do pamięci", async () => {
    const { api } = await swiezyKlient();
    const odlozona = odroczona<unknown>();
    stan.odpowiedzMe = () => odlozona.obietnica;

    const odczytWTrakcie = api("/me");
    await vi.waitFor(() => expect(stan.wywolaniaMe).toBe(1));
    await api("/me", { method: "PATCH", body: { phone: "+48 600 100 200" } });
    odlozona.spelnij(konto());
    await odczytWTrakcie;

    stan.odpowiedzMe = async () => konto();
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 4: zakończenie sesji (endSession) czyści pamięć", async () => {
    const { api, endSession } = await swiezyKlient();
    await api("/me");
    await endSession();
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("reguła 4: sesja zakończona przez nieudaną rotację tokenu czyści pamięć", async () => {
    const { api, getToken } = await swiezyKlient();
    await api("/me");
    expect(stan.wywolaniaMe).toBe(1);

    // Jedno pytanie o sesję zwraca błąd rotacji; potem sesja znów oddaje ten sam token.
    const fetchMock = vi.mocked(globalThis.fetch);
    const poprzednia = fetchMock.getMockImplementation()!;
    let raz = true;
    fetchMock.mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/api/auth/session") && raz) {
        raz = false;
        return odp(200, { accessToken: null, expiresAt: null, error: "RefreshAccessTokenError" }) as unknown as Response;
      }
      return poprzednia(url, init);
    });
    expect(await getToken()).toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);

    // Ten sam token „token-a" i okno nadal otwarte — bez czyszczenia odpowiedź wróciłaby z pamięci.
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 5: błąd 500 nie jest pamiętany", async () => {
    const { api } = await swiezyKlient();
    stan.odpowiedzMe = async () => odp(500, { error: { status: 500, code: "server_error", message: "Błąd." } });
    await expect(api("/me")).rejects.toMatchObject({ status: 500 });
    stan.odpowiedzMe = async () => konto();
    expect((await api<{ role: string }>("/me")).role).toBe("volunteer");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 5: 401 z /me nie jest pamiętane", async () => {
    const { api } = await swiezyKlient();
    stan.odpowiedzMe = async () => odp(401, { error: { status: 401, code: "unauthenticated", message: "Brak." } });
    await expect(api("/me")).rejects.toMatchObject({ status: 401 });
    stan.odpowiedzMe = async () => konto();
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 5: 401 z dowolnej trasy czyści pamięć /me", async () => {
    const { api } = await swiezyKlient();
    await api("/me");
    await expect(api("/forbidden")).rejects.toMatchObject({ status: 401 });
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });

  it("reguła 6: zmiana odpowiedzi jednego wywołującego nie psuje drugiego", async () => {
    const { api } = await swiezyKlient();
    const a = await api<{ role: string; address: { city: string } }>("/me");
    a.role = "super_admin";
    a.address.city = "Zmienione";
    const b = await api<{ role: string; address: { city: string } }>("/me");
    expect(b.role).toBe("volunteer");
    expect(b.address.city).toBe("Gdańsk");
    expect(stan.wywolaniaMe).toBe(1);
  });

  it("pamięć dotyczy wyłącznie GET /me: inne trasy i /me/… idą zawsze do sieci", async () => {
    const { api } = await swiezyKlient();
    await api("/courses");
    await api("/courses");
    await api("/me/exports/ex_1");
    await api("/me/exports/ex_1");
    const wywolania = stan.wywolania.filter((w) => !w.includes("/api/auth/session"));
    expect(wywolania.filter((w) => w.endsWith("/courses"))).toHaveLength(2);
    expect(wywolania.filter((w) => w.endsWith("/me/exports/ex_1"))).toHaveLength(2);
  });

  it("żądanie GET /me z własnym signal omija pamięć i jej nie zasila", async () => {
    const { api } = await swiezyKlient();
    await api("/me");
    await api("/me", { signal: new AbortController().signal });
    expect(stan.wywolaniaMe).toBe(2);
    await api("/me");
    expect(stan.wywolaniaMe).toBe(2);
  });
});

describe("III. izolacja testów (reset w __tests__/setup.ts)", () => {
  const zapis = vi.fn(async () => ({ data: { z: "testu A" } }));

  it("test A zostawia gotową odpowiedź w pamięci modułu", async () => {
    await odczytajMe("token-izolacji", zapis);
    expect(zapis).toHaveBeenCalledTimes(1);
    // W obrębie tego samego testu pamięć działa — dopiero reset ją zrzuca.
    await odczytajMe("token-izolacji", zapis);
    expect(zapis).toHaveBeenCalledTimes(1);
  });

  it("test B z tym samym tokenem nie widzi śladu testu A", async () => {
    const pobierz = vi.fn(async () => ({ data: { z: "testu B" } }));
    expect(await odczytajMe("token-izolacji", pobierz)).toEqual({ data: { z: "testu B" } });
    expect(pobierz).toHaveBeenCalledTimes(1);
  });
});
