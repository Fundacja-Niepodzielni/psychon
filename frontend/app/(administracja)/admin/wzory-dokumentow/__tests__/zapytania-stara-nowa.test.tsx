import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Wzory dokumentów: zapytania HTTP dotychczasowej strony (`StaraTresc`, trzy
 * zakładki) i nowego ekranu (jeden ekran z wyborem rodzaju) dla każdego z
 * trzech rodzajów — odczyt wzoru i historii oraz zapis nowej wersji. Prawdziwy
 * klient API, podmieniony tylko `fetch`. Dwie różnice są zmierzone i
 * nazwane wprost: wybór rodzaju nie siedzi już w adresie (`?zakladka=`), a
 * zapis identycznej treści jest blokowany po stronie ekranu.
 */

let parametrZakladki: string | null = null;

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/wzory-dokumentow",
  useSearchParams: () => new URLSearchParams(parametrZakladki ? { zakladka: parametrZakladki } : {}),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { default: StaraTresc } = await import("../StaraTresc");
const { WzoryDokumentow } = await import("@/nowy-front/wzory-dokumentow/WzoryDokumentow");

interface Zapytanie {
  metoda: string;
  adres: string;
  cialo: string | null;
}

const API = "http://localhost:8000/api/v1";
const RODZAJE = [
  { typ: "agreement", zakladka: "porozumienie", etykieta: "Porozumienie wolontariackie" },
  { typ: "attendance_certificate", zakladka: "zaswiadczenie", etykieta: "Zaświadczenie o stażu" },
  { typ: "certificate", zakladka: "certyfikat", etykieta: "Certyfikat ukończenia programu" },
] as const;

let zapytania: Zapytanie[] = [];

function wzor(typ: string, wersja = 2, tresc = `<p>Wzór ${typ}</p>`) {
  return {
    type: typ,
    content: tresc,
    version: wersja,
    updated_at: "2026-09-28T10:00:00Z",
    updated_by: { id: 5, name: "Anna Testowa" },
  };
}

function atrapaFetch(wejscie: RequestInfo | URL, opcje?: RequestInit): Promise<Response> {
  const adres = String(wejscie);
  if (adres.includes("/api/auth/session")) {
    return Promise.resolve(
      new Response(JSON.stringify({ accessToken: "atrapa-tokenu", expiresAt: Date.now() + 3_600_000 }), { status: 200 }),
    );
  }
  const metoda = opcje?.method ?? "GET";
  zapytania.push({ metoda, adres, cialo: typeof opcje?.body === "string" ? opcje.body : null });
  const dopasowanie = adres.match(/\/document-templates\/([a-z_]+)(\/versions)?$/);
  if (!dopasowanie) return Promise.resolve(new Response("{}", { status: 500 }));
  const [, typ, historia] = dopasowanie;
  let dane: unknown;
  if (historia) dane = [{ version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 5, name: "Anna Testowa" } }];
  else if (metoda === "PUT") dane = wzor(typ, 3, (JSON.parse(String(opcje?.body)) as { content: string }).content);
  else dane = wzor(typ);
  return Promise.resolve(
    new Response(JSON.stringify({ data: dane }), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

beforeEach(() => {
  zapytania = [];
  parametrZakladki = null;
  vi.stubGlobal("fetch", vi.fn(atrapaFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const doTypu = (typ: string) => zapytania.filter((z) => z.adres.includes(`/document-templates/${typ}`));

async function otworzStara(typ: (typeof RODZAJE)[number]) {
  parametrZakladki = typ.zakladka;
  await act(async () => {
    render(<StaraTresc />);
  });
  await screen.findByLabelText("Treść wzoru");
}

async function otworzNowa(typ: (typeof RODZAJE)[number]) {
  await act(async () => {
    render(<WzoryDokumentow />);
  });
  await screen.findByRole("button", { name: "Zapisz nową wersję" });
  if (typ.typ !== "agreement") {
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("combobox", { name: "Rodzaj wzoru" }));
    await uzytkownik.click(screen.getByRole("option", { name: typ.etykieta }));
    await waitFor(() => expect(doTypu(typ.typ).length).toBeGreaterThanOrEqual(2));
    await screen.findByDisplayValue(`<p>Wzór ${typ.typ}</p>`);
  }
}

/**
 * Limit czasu przypadków, które pod obciążeniem hosta (równoległe procesy, zimny pierwszy import)
 * trwają wielokrotnie dłużej niż domyślne 5000 ms. Wartość to większa z: trzykrotność maksimum
 * z 10 pomiarów na cichym hoście albo 15 000 ms; przy każdym przypadku stoi jego zmierzony czas.
 */
const LIMIT_PRZYPADKU_MS = 15_000;

describe("wzory dokumentów — odczyt: te same zapytania dla każdego rodzaju", () => {
  it.each(RODZAJE)("rodzaj $typ: odczyt wzoru i historii — identyczne zapytania", async (rodzaj) => {
    await otworzStara(rodzaj);
    const stara = doTypu(rodzaj.typ);
    cleanup();
    zapytania = [];

    await otworzNowa(rodzaj);
    const nowa = doTypu(rodzaj.typ);

    expect([...nowa].sort((a, b) => a.adres.localeCompare(b.adres))).toEqual(
      [...stara].sort((a, b) => a.adres.localeCompare(b.adres)),
    );
    expect(stara).toHaveLength(2);
  });
});

describe("wzory dokumentów — zapis nowej wersji", () => {
  // zmierzone na cichym hoście: maks. 0,9 s z 10; limit 3× i co najmniej 15 s
  it("zmieniona treść: identyczne PUT (adres, metoda, ciało) w obu wersjach", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    await otworzStara(RODZAJE[0]);
    const polaStara = screen.getByLabelText("Treść wzoru");
    await uzytkownik.clear(polaStara);
    await uzytkownik.type(polaStara, "Nowa treść wzoru");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(zapytania.some((z) => z.metoda === "PUT")).toBe(true));
    const stara = zapytania.filter((z) => z.metoda === "PUT");
    cleanup();
    zapytania = [];

    await otworzNowa(RODZAJE[0]);
    const polaNowa = screen.getByRole("textbox", { name: /^Treść wzoru/ });
    await uzytkownik.clear(polaNowa);
    await uzytkownik.type(polaNowa, "Nowa treść wzoru");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    await waitFor(() => expect(zapytania.some((z) => z.metoda === "PUT")).toBe(true));
    const nowa = zapytania.filter((z) => z.metoda === "PUT");

    expect(nowa).toEqual(stara);
    expect(stara).toEqual([
      { metoda: "PUT", adres: `${API}/document-templates/agreement`, cialo: JSON.stringify({ content: "Nowa treść wzoru" }) },
    ]);
  });

  it("różnica zmierzona: dotychczasowa strona zapisuje też identyczną treść jako nową wersję, nowy ekran tego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    await otworzStara(RODZAJE[0]);
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(zapytania.some((z) => z.metoda === "PUT")).toBe(true));
    cleanup();
    zapytania = [];

    await otworzNowa(RODZAJE[0]);
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    await screen.findByText(/Treść jest taka sama jak w bieżącej wersji/);
    expect(zapytania.some((z) => z.metoda === "PUT")).toBe(false);
  });
});

describe("wzory dokumentów — wybór rodzaju i daty", () => {
  it("różnica zmierzona: wybór rodzaju nie trafia do adresu — `?zakladka=` jest ignorowany, ekran zawsze zaczyna od porozumienia", async () => {
    parametrZakladki = "certyfikat";
    await act(async () => {
      render(<WzoryDokumentow />);
    });
    await screen.findByRole("button", { name: "Zapisz nową wersję" });
    expect(doTypu("certificate")).toHaveLength(0);
    expect(doTypu("agreement")).toHaveLength(2);
  });

  it("znacznik czasu z odpowiedzi nie trafia do DOM surowo (ISO/UTC), tylko sformatowany po polsku", async () => {
    await otworzNowa(RODZAJE[0]);
    const tekst = document.body.textContent ?? "";
    expect(tekst).not.toMatch(/2026-09-28/);
    expect(tekst).not.toMatch(/T\d\d:\d\d:\d\d/);
    expect(tekst).toContain("28 września 2026");
  });
});
