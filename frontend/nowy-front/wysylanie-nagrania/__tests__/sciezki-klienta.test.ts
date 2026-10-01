import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ścieżki żądań wysyłania nagrania wobec prawdziwego klienta API: pozwolenie
 * na wgranie (to samo żądanie przy pierwszym wysyłaniu i przy dokończeniu) oraz
 * stan nagrania. Klient nie jest podstawiony — podstawiona jest wyłącznie sieć
 * (`fetch`), więc ścieżka przechodzi przez kontrolę kształtu w kliencie albo
 * żądanie w ogóle nie wychodzi.
 */

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { adresApi, NieprawidlowaSciezkaApi } = await import("@/lib/api/klient");
const { pobierzStanNagrania, zlecWgranieNagrania } = await import("@/nowy-front/lekcja-edycja/dane");
const { uchwytWysylania } = await import("../uchwyt");

const BAZA_API = "https://api.example.pl/api/v1";
const ZETON = ["zeton", "probny", "sciezek"].join("-");

const fetchMock = vi.fn();

/** Adresy żądań do API (bez pytania o sesję), z metodą. */
function zadaniaApi(): Array<{ adres: string; metoda: string }> {
  return fetchMock.mock.calls
    .map(([adres, opcje]) => ({ adres: String(adres), metoda: String((opcje as RequestInit | undefined)?.method ?? "GET") }))
    .filter((zadanie) => !zadanie.adres.includes("/api/auth/session"));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (adres: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(adres).includes("/api/auth/session") ? { accessToken: ZETON, expiresAt: Date.now() + 600_000 } : { data: {} },
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.pl");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ścieżki wysyłania nagrania przechodzą kontrolę ścieżek klienta API", () => {
  it("pozwolenie na wgranie: żądanie wychodzi pod adres lekcji", async () => {
    await expect(zlecWgranieNagrania(22, "Trudny rozmówca")).resolves.toBeDefined();
    expect(zadaniaApi()).toEqual([{ adres: `${BAZA_API}/admin/lessons/22/video-uploads`, metoda: "POST" }]);
  });

  it("stan nagrania: żądanie wychodzi pod adres lekcji", async () => {
    await expect(pobierzStanNagrania(22)).resolves.toBeDefined();
    expect(zadaniaApi()).toEqual([{ adres: `${BAZA_API}/admin/lessons/22/video-status`, metoda: "GET" }]);
  });

  it("dokończenie: uchwyt aplikacji prosi o pozwolenie tą samą ścieżką; odpowiedź bez adresu wgrania kończy się przed dostawcą", async () => {
    const plik = new File(["0123456789"], "trudny-rozmowca.mp4", { type: "video/mp4", lastModified: 1_790_000_000_000 });
    const lekcja = { id: 22, tytul: "Trudny rozmówca", adres: "/admin/kursy/4/lekcje/22" };
    await uchwytWysylania.wyslij(plik, lekcja, "dokoncz").catch(() => undefined);
    const doApi = zadaniaApi().filter((zadanie) => zadanie.adres.startsWith(BAZA_API));
    expect(doApi).toEqual([{ adres: `${BAZA_API}/admin/lessons/22/video-uploads`, metoda: "POST" }]);
  });

  it("kontrola sama: obie ścieżki są przyjęte bez zmiany, a ścieżka wychodząca nad lekcję — odrzucona", () => {
    expect(adresApi("/admin/lessons/22/video-uploads", BAZA_API)).toBe(`${BAZA_API}/admin/lessons/22/video-uploads`);
    expect(adresApi("/admin/lessons/22/video-status", BAZA_API)).toBe(`${BAZA_API}/admin/lessons/22/video-status`);
    expect(() => adresApi("/admin/lessons/../video-uploads", BAZA_API)).toThrow(NieprawidlowaSciezkaApi);
  });
});
