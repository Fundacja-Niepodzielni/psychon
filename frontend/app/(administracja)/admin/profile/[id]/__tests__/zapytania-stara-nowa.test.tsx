import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WNIOSEK, WNIOSEK_ODESLANY, WNIOSEK_ZAAKCEPTOWANY } from "@/nowy-front/profil-decyzja/__tests__/atrapy";

/**
 * Wgląd w dane wrażliwe (dyplom, zaświadczenie o niekaralności) zostawia wpis
 * w `sensitive_access_log` po stronie serwera wyłącznie przy pobraniu
 * załącznika (`AdminProfileController::downloadDocument`). Ten plik mierzy
 * zapytania HTTP, które wysyła dotychczasowa strona (`StaraTresc`) i nowy
 * ekran: prawdziwy klient API i prawdziwe `downloadFile`, podmieniony tylko
 * `fetch`. Dla każdego scenariusza (pobranie, akceptacja, odesłanie) lista
 * zapytań (metoda, adres, ciało, obecność tokenu) musi być identyczna.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { default: StaraTresc } = await import("../StaraTresc");
const { ProfilDecyzja } = await import("@/nowy-front/profil-decyzja/ProfilDecyzja");

interface Zapytanie {
  metoda: string;
  adres: string;
  cialo: string | null;
  token: string | null;
}

const API = "http://localhost:8000/api/v1";
const DOKUMENT = "http://localhost:8000/api/v1/admin/profiles/12/documents/5?signature=abc";

let zapytania: Zapytanie[] = [];

function odpowiedzJson(dane: unknown): Response {
  return new Response(JSON.stringify({ data: dane }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function atrapaFetch(wejscie: RequestInfo | URL, opcje?: RequestInit): Promise<Response> {
  const adres = String(wejscie);
  if (adres.includes("/api/auth/session")) {
    return Promise.resolve(
      new Response(JSON.stringify({ accessToken: "atrapa-tokenu", expiresAt: Date.now() + 3_600_000 }), { status: 200 }),
    );
  }
  const naglowki = new Headers(opcje?.headers);
  zapytania.push({
    metoda: opcje?.method ?? "GET",
    adres,
    cialo: typeof opcje?.body === "string" ? opcje.body : null,
    token: naglowki.get("Authorization"),
  });
  if (adres === DOKUMENT) return Promise.resolve(new Response("PDF", { status: 200 }));
  if (adres === `${API}/admin/profiles/12`) return Promise.resolve(odpowiedzJson(WNIOSEK));
  if (adres === `${API}/admin/profiles/12/accept`) return Promise.resolve(odpowiedzJson(WNIOSEK_ZAAKCEPTOWANY));
  if (adres === `${API}/admin/profiles/12/return`) return Promise.resolve(odpowiedzJson(WNIOSEK_ODESLANY));
  return Promise.resolve(new Response(JSON.stringify({ error: { status: 500, code: "x", message: "x" } }), { status: 500 }));
}

beforeEach(() => {
  zapytania = [];
  vi.stubGlobal("fetch", vi.fn(atrapaFetch));
  Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:atrapa") });
  Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Wersja = "stara" | "nowa";
type Scenariusz = "pobranie" | "akceptacja" | "odeslanie";

const KOMENTARZ = "Uzupełnij opis podejścia.";

async function przebieg(wersja: Wersja, scenariusz: Scenariusz): Promise<Zapytanie[]> {
  const uzytkownik = userEvent.setup();
  await act(async () => {
    render(
      wersja === "stara" ? (
        <Suspense fallback={null}>
          <StaraTresc params={Promise.resolve({ id: "12" })} />
        </Suspense>
      ) : (
        <ProfilDecyzja id="12" />
      ),
    );
  });

  if (wersja === "stara") await screen.findByText("Dane wniosku");
  else await screen.findByRole("heading", { level: 1, name: /^Wniosek o profil: Ewa Przykładowa/ });

  if (scenariusz === "pobranie") {
    const przycisk =
      wersja === "stara"
        ? screen.getAllByRole("button", { name: "Pobierz" })[0]
        : screen.getAllByRole("button", { name: /^Pobierz załącznik/ })[0];
    await uzytkownik.click(przycisk);
    await waitFor(() => expect(zapytania.some((z) => z.adres === DOKUMENT)).toBe(true));
  } else if (scenariusz === "akceptacja") {
    await uzytkownik.click(screen.getByRole("button", { name: wersja === "stara" ? "Akceptuj wniosek" : "Zatwierdź" }));
    await waitFor(() => expect(zapytania.some((z) => z.adres.endsWith("/accept"))).toBe(true));
  } else {
    if (wersja === "stara") {
      await uzytkownik.type(screen.getByLabelText("Powód odesłania"), KOMENTARZ);
      await uzytkownik.click(screen.getByRole("button", { name: "Odeślij do poprawy" }));
    } else {
      await uzytkownik.click(screen.getByRole("button", { name: "Poproś o poprawkę" }));
      await uzytkownik.type(screen.getByLabelText(/^Co trzeba poprawić/), KOMENTARZ);
      await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę o poprawkę" }));
    }
    await waitFor(() => expect(zapytania.some((z) => z.adres.endsWith("/return"))).toBe(true));
  }
  return [...zapytania];
}

/**
 * Limit czasu przypadków, które pod obciążeniem hosta (równoległe procesy, zimny pierwszy import)
 * trwają wielokrotnie dłużej niż domyślne 5000 ms. Wartość to większa z: trzykrotność maksimum
 * z 10 pomiarów na cichym hoście albo 15 000 ms; przy każdym przypadku stoi jego zmierzony czas.
 */
const LIMIT_PRZYPADKU_MS = 15_000;

describe("/admin/profile/[id] — zapytania dotychczasowej strony i nowego ekranu", () => {
  // zmierzone na cichym hoście: maks. 1,2 s z 10 (najwolniejszy scenariusz „odeslanie”); limit 3× i co najmniej 15 s
  it.each<Scenariusz>(["pobranie", "akceptacja", "odeslanie"])(
    "scenariusz %s: obie wersje wysyłają dokładnie te same zapytania (metoda, adres, ciało, token)",
    async (scenariusz) => {
      const stara = await przebieg("stara", scenariusz);
      document.body.innerHTML = "";
      zapytania = [];
      const nowa = await przebieg("nowa", scenariusz);

      expect(nowa).toEqual(stara);
      expect(stara.length).toBeGreaterThan(1);
      // Każde zapytanie niesie token osoby — wgląd zostaje przypisany do niej w dzienniku serwera.
      expect(stara.every((z) => z.token === "Bearer atrapa-tokenu")).toBe(true);
    },
    LIMIT_PRZYPADKU_MS,
  );

  it("pobranie załącznika: dokładnie jedno zapytanie o plik (jeden wpis w dzienniku wglądu), pod podpisanym adresem z odpowiedzi", async () => {
    const nowa = await przebieg("nowa", "pobranie");
    expect(nowa.filter((z) => z.adres.includes("/documents/"))).toEqual([
      { metoda: "GET", adres: DOKUMENT, cialo: null, token: "Bearer atrapa-tokenu" },
    ]);
  });

  it("samo wczytanie wniosku nie pobiera żadnego załącznika (jak dotychczasowa strona)", async () => {
    const nowa = await przebieg("nowa", "akceptacja");
    expect(nowa.some((z) => z.adres.includes("/documents/"))).toBe(false);
    const stara = await (async () => {
      document.body.innerHTML = "";
      zapytania = [];
      return przebieg("stara", "akceptacja");
    })();
    expect(stara.some((z) => z.adres.includes("/documents/"))).toBe(false);
  });

  it("odesłanie: ciało żądania niesie dokładnie pole reason z przyciętym komentarzem", async () => {
    const nowa = await przebieg("nowa", "odeslanie");
    expect(nowa.find((z) => z.adres.endsWith("/return"))?.cialo).toBe(JSON.stringify({ reason: KOMENTARZ }));
  });
});

describe("/admin/profile/[id] — daty nowego ekranu", () => {
  it("znacznik czasu z odpowiedzi nie trafia do DOM surowo (ISO/UTC), tylko sformatowany po polsku", async () => {
    await act(async () => {
      render(<ProfilDecyzja id="12" />);
    });
    await screen.findByRole("heading", { level: 1, name: /^Wniosek o profil: Ewa Przykładowa/ });

    const tekst = document.body.textContent ?? "";
    expect(tekst).not.toMatch(/2026-09-1\d/);
    expect(tekst).not.toMatch(/T\d\d:\d\d:\d\d/);
    expect(tekst).toContain("10 września 2026");
  });
});
