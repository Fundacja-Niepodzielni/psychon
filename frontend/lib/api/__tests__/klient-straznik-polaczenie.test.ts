import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Połączenie ocen adresu z `adresApi`. Strażnik ma trzy linie obrony (reguły na
 * napisanej ścieżce, porównanie z bazą, porównanie struktury segmentów po
 * normalizacji parsera), a spreparowana ścieżka łapana jest zwykle przez kilka
 * naraz — dlatego usunięcie wywołania JEDNEJ z nich nie zmienia wyniku żadnej
 * próby na prawdziwych ścieżkach i taka próba nie wykryje, że wywołania nie ma.
 * Ta próba podstawia wynik oceny i sprawdza, że `adresApi`:
 *  - pyta każdą ocenę, i to o właściwy adres (adres sklejony z bazą i ścieżką,
 *    baza z końcowym ukośnikiem);
 *  - odrzuca ścieżkę, gdy któraś ocena mówi „nie”, choćby druga mówiła „tak”;
 *  - gdy obie oceny odpowiadają „tak”, niczego nie zmienia (podstawka jest przezroczysta).
 */

const sterowanie = vi.hoisted(() => ({
  wBazie: null as boolean | null,
  zLiteralem: null as boolean | null,
  wywolaniaWBazie: [] as Array<{ adres: string; baza: string }>,
  wywolaniaZLiteralem: [] as Array<{ czysta: string; literal: string; zapytanie: string; rzeczywisty: string }>,
}));

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

vi.mock("@/lib/api/adres-straznik", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/adres-straznik")>();
  return {
    ...oryginal,
    adresWBazie: (adres: URL, baza: URL) => {
      sterowanie.wywolaniaWBazie.push({ adres: adres.href, baza: baza.href });
      return sterowanie.wBazie ?? oryginal.adresWBazie(adres, baza);
    },
    zgodnaZLiteralem: (czysta: string, literal: string, zapytanie: string, rzeczywisty: URL, wzglednyOrigin: string) => {
      sterowanie.wywolaniaZLiteralem.push({ czysta, literal, zapytanie, rzeczywisty: rzeczywisty.href });
      return sterowanie.zLiteralem ?? oryginal.zgodnaZLiteralem(czysta, literal, zapytanie, rzeczywisty, wzglednyOrigin);
    },
  };
});

const { adresApi, api, NieprawidlowaSciezkaApi } = await import("@/lib/api/klient");

const BAZA_API = "https://api.example.pl/api/v1";
const WZGLEDNY = "http://wzgledny.invalid";

const fetchMock = vi.fn();

beforeEach(() => {
  sterowanie.wBazie = null;
  sterowanie.zLiteralem = null;
  sterowanie.wywolaniaWBazie.length = 0;
  sterowanie.wywolaniaZLiteralem.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (adres: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(adres).includes("/api/auth/session")
        ? { accessToken: "token-probny-polaczenia", expiresAt: Date.now() + 600_000 }
        : { data: "ok" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.pl");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("adresApi — każda ocena adresu ma głos rozstrzygający", () => {
  it("bez podstawionego wyniku podstawka jest przezroczysta: poprawna ścieżka przechodzi", () => {
    expect(adresApi("/me", BAZA_API)).toBe(`${BAZA_API}/me`);
    expect(adresApi("/admin/users?search=kowal", BAZA_API)).toBe(`${BAZA_API}/admin/users?search=kowal`);
  });

  it("ocena bazy mówi „nie”: ścieżka jest odrzucona, choć wszystkie pozostałe linie ją przepuszczają", () => {
    sterowanie.wBazie = false;
    expect(() => adresApi("/me", BAZA_API)).toThrow(NieprawidlowaSciezkaApi);
    expect(sterowanie.wywolaniaWBazie).toHaveLength(1);
  });

  it("ocena struktury mówi „nie”: ścieżka jest odrzucona, choć wszystkie pozostałe linie ją przepuszczają", () => {
    sterowanie.zLiteralem = false;
    expect(() => adresApi("/me", BAZA_API)).toThrow(NieprawidlowaSciezkaApi);
    expect(sterowanie.wywolaniaZLiteralem).toHaveLength(1);
  });

  it("obie oceny mówią „tak”: ścieżka przechodzi i obie były zapytane", () => {
    sterowanie.wBazie = true;
    sterowanie.zLiteralem = true;
    expect(adresApi("/me", BAZA_API)).toBe(`${BAZA_API}/me`);
    expect(sterowanie.wywolaniaWBazie).toHaveLength(1);
    expect(sterowanie.wywolaniaZLiteralem).toHaveLength(1);
  });

  it("odrzucenie przez ocenę nie zostawia żadnego żądania: api() nie woła fetch (ani po token)", async () => {
    sterowanie.wBazie = false;
    await expect(api("/me")).rejects.toBeInstanceOf(NieprawidlowaSciezkaApi);
    expect(fetchMock).not.toHaveBeenCalled();

    sterowanie.wBazie = null;
    sterowanie.zLiteralem = false;
    await expect(api("/me")).rejects.toBeInstanceOf(NieprawidlowaSciezkaApi);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wyjątek po odrzuceniu przez ocenę nie niesie ścieżki", () => {
    sterowanie.zLiteralem = false;
    try {
      adresApi("/me/exports/tajny-identyfikator", BAZA_API);
      expect.unreachable("ścieżka miała zostać odrzucona");
    } catch (blad) {
      expect(blad).toBeInstanceOf(NieprawidlowaSciezkaApi);
      expect((blad as Error).message).not.toContain("tajny-identyfikator");
    }
  });
});

describe("adresApi — oceny dostają adres sklejony z bazą i ścieżką, nie ścieżkę samą", () => {
  it("ocena bazy: adres = baza + ścieżka, baza = baza z końcowym ukośnikiem", () => {
    adresApi("/me/exports/17?x=1", BAZA_API);
    expect(sterowanie.wywolaniaWBazie).toEqual([{ adres: `${BAZA_API}/me/exports/17?x=1`, baza: `${BAZA_API}/` }]);
  });

  it("ocena struktury: baza bez końcowego ukośnika, ścieżka bez zapytania, zapytanie osobno, adres rzeczywisty", () => {
    adresApi("/me/exports/17?x=1", `${BAZA_API}/`);
    expect(sterowanie.wywolaniaZLiteralem).toEqual([
      { czysta: BAZA_API, literal: "/me/exports/17", zapytanie: "?x=1", rzeczywisty: `${BAZA_API}/me/exports/17?x=1` },
    ]);
  });

  it("baza względna (pusta): adres liczony względem hosta zastępczego", () => {
    adresApi("/me", "");
    expect(sterowanie.wywolaniaWBazie).toEqual([{ adres: `${WZGLEDNY}/me`, baza: `${WZGLEDNY}/` }]);
    expect(sterowanie.wywolaniaZLiteralem[0]?.czysta).toBe("");
  });

  it("odrzucenie przez pierwszą linię (reguły na ścieżce) następuje przed obiema ocenami", () => {
    expect(() => adresApi("/me/..", BAZA_API)).toThrow(NieprawidlowaSciezkaApi);
    expect(sterowanie.wywolaniaWBazie).toHaveLength(0);
    expect(sterowanie.wywolaniaZLiteralem).toHaveLength(0);
  });
});
