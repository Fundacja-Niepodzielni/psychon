import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wspólny pomocnik pobierania plików (`lib/api/pliki.ts`): nagłówek
 * `Authorization` trafia wyłącznie do adresu o tym samym pochodzeniu
 * (schemat, host, port) co baza API. Każdy inny adres kończy się błędem
 * przed odczytem tokenu i bez żadnego żądania.
 *
 * Moduły klienta są ładowane od nowa w każdej próbie, więc pamięć sesji jest
 * pusta: odczyt tokenu byłby widoczny jako żądanie do punktu sesji.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

const BAZA = "https://api.psychon.test";
const PUNKT_SESJI = "/api/auth/session";
const TOKEN_PROBNY = "token-probny-pobierania";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", BAZA);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (adres: RequestInfo | URL) =>
    String(adres).includes(PUNKT_SESJI)
      ? { ok: true, status: 200, json: async () => ({ accessToken: TOKEN_PROBNY, expiresAt: Date.now() + 600_000 }) }
      : { ok: true, status: 200, blob: async () => new Blob(["%PDF"]) },
  );
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:atrapa") });
  Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function swiezyPomocnik() {
  vi.resetModules();
  return import("@/lib/api/pliki");
}

function wywolaniaPunktuSesji() {
  return fetchMock.mock.calls.filter((wywolanie) => String(wywolanie[0]).includes(PUNKT_SESJI));
}

function wywolaniaPliku() {
  return fetchMock.mock.calls.filter((wywolanie) => !String(wywolanie[0]).includes(PUNKT_SESJI));
}

describe("downloadFile — adres tego samego API", () => {
  it("adres API: jedno żądanie z nagłówkiem Bearer", async () => {
    const { downloadFile } = await swiezyPomocnik();
    const adres = `${BAZA}/api/v1/documents/7/download?signature=abc`;

    await downloadFile(adres, "dokument.pdf");

    const pliki = wywolaniaPliku();
    expect(pliki).toHaveLength(1);
    expect(String(pliki[0][0])).toBe(adres);
    const naglowki = new Headers((pliki[0][1] as RequestInit | undefined)?.headers);
    expect(naglowki.get("Authorization")).toBe(`Bearer ${TOKEN_PROBNY}`);
  });
});

describe("downloadFile — link z odpowiedzi zaplecza za pośrednikiem TLS", () => {
  // Kształt linku, który zaplecze podpisuje za pośrednikiem TLS
  // (backend/tests/Feature/ProxiedRequestSchemeTest.php, ten sam host).
  const HOST_PLATFORMY = "platforma.psychon.test";
  const SCIEZKA = "/api/v1/documents/3d03e2f3-1d81-455b-aa32-d7bd6b1405bf/download?expires=1790957972&signature=abc";

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", `https://${HOST_PLATFORMY}`);
  });

  it("link `https://` z tym samym hostem: jedno żądanie z nagłówkiem Bearer", async () => {
    const { downloadFile } = await swiezyPomocnik();
    const adres = `https://${HOST_PLATFORMY}${SCIEZKA}`;

    await downloadFile(adres, "dokument.pdf");

    const pliki = wywolaniaPliku();
    expect(pliki).toHaveLength(1);
    expect(String(pliki[0][0])).toBe(adres);
    expect(new Headers((pliki[0][1] as RequestInit | undefined)?.headers).get("Authorization")).toBe(`Bearer ${TOKEN_PROBNY}`);
  });

  it("link `http://` z tym samym hostem: błąd, bez odczytu tokenu i bez żądania", async () => {
    const { downloadFile, NieprawidlowyAdresPliku } = await swiezyPomocnik();

    await expect(downloadFile(`http://${HOST_PLATFORMY}${SCIEZKA}`, "dokument.pdf")).rejects.toBeInstanceOf(
      NieprawidlowyAdresPliku,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("downloadFile — adres spoza API", () => {
  const przypadki: Array<[string, string]> = [
    ["obcy host", "https://pliki.przyklad.test/api/v1/documents/7/download"],
    ["inny port", "https://api.psychon.test:8443/api/v1/documents/7/download"],
    ["inny schemat", "http://api.psychon.test/api/v1/documents/7/download"],
    ["adres zaczynający się od `//`", "//pliki.przyklad.test/api/v1/documents/7/download"],
    ["adres względny", "/api/v1/documents/7/download"],
    ["host z napisem bazy na początku", "https://api.psychon.test.przyklad.test/api/v1/documents/7/download"],
    ["napis bazy przed znakiem `@`", "https://api.psychon.test@pliki.przyklad.test/api/v1/documents/7/download"],
  ];

  it.each(przypadki)("%s: błąd, bez odczytu tokenu i bez żądania", async (_opis, adres) => {
    const { downloadFile, NieprawidlowyAdresPliku } = await swiezyPomocnik();

    await expect(downloadFile(adres, "dokument.pdf")).rejects.toBeInstanceOf(NieprawidlowyAdresPliku);

    expect(wywolaniaPunktuSesji()).toHaveLength(0);
    expect(wywolaniaPliku()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("komunikat błędu nie niesie adresu", async () => {
    const { downloadFile } = await swiezyPomocnik();
    const adres = "https://pliki.przyklad.test/sciezka-probna";

    await expect(downloadFile(adres, "dokument.pdf")).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("przyklad") }),
    );
  });
});
