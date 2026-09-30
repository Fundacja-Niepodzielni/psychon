import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import {
  brakujaceKlucze,
  kluczeMetaZOpenApi,
  kluczeZasobu,
} from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran wniosków o profil psychologa (`ProfileKolejka`) na szablonie
 * `ListTemplate`: każdy stan ma jeden `main` i znacznik szablonu; wiersz
 * ma etykietę stanu po polsku (nigdy surowy kod) i jedną akcję „Otwórz
 * wniosek” z adresem ekranu decyzji; filtr wysyła wyłącznie parametr
 * `status`. Atrapy mają klucze odczytane z zasobów PHP i `openapi.json`.
 */

const apiPaged = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, apiPaged: (...a: unknown[]) => apiPaged(...a) };
});

const { ApiError } = await import("@/lib/api/klient");
const { ProfileKolejka } = await import("../ProfileKolejka");

const ZASOBY = [
  "backend/app/Http/Resources/H15/AdminPsychologistProfileResource.php",
  "backend/app/Http/Resources/H15/AdminProfileDocumentResource.php",
];

function wniosek(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    user: { id: 40 + id, first_name: "Anna", last_name: "Demo" },
    specializations: ["interwencja kryzysowa"],
    approach: "poznawczo-behawioralny",
    city: "Kraków",
    bio: "Krótki opis.",
    publication_consent_granted: true,
    status: "submitted",
    return_reason: null,
    decided_at: null,
    documents: [
      { id: 1, type: "dyplom", uploaded_at: "2026-09-01T10:00:00Z", download_url: "https://example.test/podpisany" },
    ],
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...nadpisz,
  };
}

const META = { current_page: 1, per_page: 25, total: 2, last_page: 1 };
const DWA = [wniosek(7), wniosek(8, { user: { id: 49, first_name: "Ewa", last_name: "Demo" }, city: null, approach: null, documents: [] })];

function schemat(): string[] {
  return [...new Set(ZASOBY.flatMap((z) => kluczeZasobu(z)))].sort();
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
}

async function renderZDanymi(dane = DWA) {
  apiPaged.mockResolvedValueOnce({ data: dane, meta: { ...META, total: dane.length } });
  const wynik = render(<ProfileKolejka />);
  await screen.findByText(`${dane[0].user.first_name} ${dane[0].user.last_name}`);
  return wynik;
}

beforeEach(() => {
  apiPaged.mockReset();
  back.mockReset();
});

describe("ProfileKolejka — schemat atrap", () => {
  it("atrapa wniosku ma wszystkie klucze zasobów PHP (wniosek i załącznik)", () => {
    expect(brakujaceKlucze(wniosek(1), schemat())).toEqual([]);
  });

  it("atrapa meta ma wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(META, kluczeMetaZOpenApi("/v1/admin/profiles"))).toEqual([]);
  });

  it("kontrola: atrapa bez klucza `city` jest wykryta jako niepełna", () => {
    const uboga: Record<string, unknown> = { ...wniosek(1) };
    delete uboga.city;
    expect(brakujaceKlucze(uboga, schemat())).toEqual(["city"]);
  });
});

describe("ProfileKolejka — stany w szablonie", () => {
  it("ładowanie: szkielet w obszarze listy, filtr widoczny, jeden main", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<ProfileKolejka />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
    expect(container.querySelector("[data-testid='obszar-filtry']")).not.toBeNull();
  });

  it("dane: wiersz z osobą, podpisem, etykietą stanu i odnośnikiem do ekranu decyzji", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    expect(apiPaged).toHaveBeenCalledWith("/admin/profiles?status=submitted&page=1&per_page=25");
    const pierwszy = screen.getByText("Anna Demo").closest("div")!.parentElement!;
    expect(pierwszy).toHaveTextContent("Kraków · poznawczo-behawioralny · załączniki: 1");
    expect(pierwszy).toHaveTextContent("Czeka na decyzję");
    const odnosniki = screen.getAllByRole("link", { name: "Otwórz wniosek" });
    expect(odnosniki.map((a) => a.getAttribute("href"))).toEqual([
      "/nowy-front/admin/profile/7",
      "/nowy-front/admin/profile/8",
    ]);
    expect(container.textContent).toContain("miasto nie podane · nurt nie podany · załączniki: 0");
    expect(container.textContent).not.toContain("submitted");
  });

  it("status poza słownikiem nie wychodzi na ekran jako surowy kod", async () => {
    const { container } = await renderZDanymi([wniosek(9, { status: "zupelnie_nowy" })]);
    expect(container.textContent).toContain("Stan nieznany");
    expect(container.textContent).not.toContain("zupelnie_nowy");
  });

  it("pusty: „Brak wniosków do decyzji”", async () => {
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    const { container } = render(<ProfileKolejka />);
    await screen.findByRole("heading", { name: "Brak wniosków do decyzji" });
    sprawdzSzablon(container);
    expect(screen.queryAllByRole("link", { name: "Otwórz wniosek" })).toHaveLength(0);
  });

  it.each([401, 403])("odmowa %i: stan brak uprawnień z rolą, zero danych, jeden main", async (status) => {
    apiPaged.mockRejectedValueOnce(
      new ApiError({ status, code: status === 401 ? "unauthenticated" : "forbidden", message: "Odmowa." }),
    );
    const { container } = render(<ProfileKolejka />);
    await waitFor(() => expect(container.textContent).toContain("administracji"));
    sprawdzSzablon(container);
    expect(screen.queryAllByRole("link", { name: "Otwórz wniosek" })).toHaveLength(0);
    expect(container.textContent).not.toContain("Anna");
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, ponowienie wczytuje listę", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<ProfileKolejka />);
    const ponow = await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    apiPaged.mockResolvedValueOnce({ data: DWA, meta: META });
    await uzytkownik.click(ponow);
    await screen.findByText("Anna Demo");
    expect(apiPaged).toHaveBeenCalledTimes(2);
    sprawdzSzablon(container);
  });

  it("kontrola: dwa main w drzewie są wykryte przez pomiar jednego main", () => {
    const { container } = render(
      <div>
        <main id="tresc" tabIndex={-1} />
        <main id="tresc" tabIndex={-1} />
      </div>,
    );
    expect(() => jedenMain(container)).toThrow(/dokładnie jednego/);
  });
});

describe("ProfileKolejka — filtr i stronicowanie", () => {
  it("filtr „Do poprawy” → zapytanie z status=returned i page=1, etykieta stanu w wierszu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    apiPaged.mockResolvedValueOnce({
      data: [wniosek(10, { status: "returned", return_reason: "Uzupełnij." })],
      meta: { ...META, total: 1 },
    });
    await uzytkownik.click(screen.getByRole("combobox", { name: /Stan wniosku/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Do poprawy" }));
    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/admin/profiles?status=returned&page=1&per_page=25"));
    await screen.findByText("Do poprawy", { selector: "span" });
  });

  it("pusty wynik dla innego stanu ma własny nagłówek", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    await uzytkownik.click(screen.getByRole("combobox", { name: /Stan wniosku/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Opublikowany" }));
    await screen.findByRole("heading", { name: "Brak wniosków w wybranym stanie" });
  });

  it("stronicowanie: druga strona woła zapytanie z page=2", async () => {
    apiPaged.mockResolvedValueOnce({ data: DWA, meta: { ...META, last_page: 2, total: 40 } });
    const uzytkownik = userEvent.setup();
    render(<ProfileKolejka />);
    await screen.findByText("Strona 1 z 2");
    apiPaged.mockResolvedValueOnce({ data: [wniosek(11)], meta: { ...META, current_page: 2, last_page: 2, total: 40 } });
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith("/admin/profiles?status=submitted&page=2&per_page=25"),
    );
  });

  it("ekran niczego nie zapisuje: jedyne wywołane API to odczyt listy", async () => {
    await renderZDanymi();
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(within(document.body).queryAllByRole("form")).toHaveLength(0);
  });
});
