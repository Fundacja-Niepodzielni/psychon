import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { brakujaceKlucze, kluczeMetaZOpenApi, kluczeZasobu } from "./zrodla-ekranu";

/**
 * Ekran decyzji o dyżurach (`StazKolejka`) na szablonie `ListTemplate`:
 *  - każdy stan (ładowanie, dane, pusty, brak uprawnień, błąd sieci) ma jeden
 *    `main` i znacznik szablonu w DOM;
 *  - zatwierdzenie, prośba o poprawkę i odrzucenie wołają właściwe trasy
 *    z właściwym ciałem; 422 bez komentarza pokazuje błąd przy polu;
 *    403 `entry_locked` pokazuje komunikat z koperty i odświeża listę;
 *  - sekcja komentarza stoi w treści — w DOM nie ma okna dialogowego.
 * Atrapy mają klucze odczytane z zasobu PHP i `openapi.json`.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { StazKolejka } = await import("../StazKolejka");

const ZASOB = "backend/app/Http/Resources/H11/AdminInternshipEntryResource.php";

function wpis(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-08-27T18:00:00Z",
    updated_at: "2026-08-27T18:00:00Z",
    user: { id: 17, first_name: "Marta", last_name: "Demo" },
    ...nadpisz,
  };
}

const META = { current_page: 1, per_page: 25, total: 2, last_page: 1 };

const DWA_WPISY = [
  wpis(91),
  wpis(92, { form: "chat_duty", hours: "2", consultations_count: 0, description: null, user: { id: 18, first_name: "Filip", last_name: "Demo" } }),
];

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function oknaDialogowe() {
  return document.querySelectorAll('[role="dialog"], [aria-modal]');
}

function wierszeListy() {
  return Array.from(document.querySelectorAll("ul[aria-label='Dyżury do decyzji'] > li"));
}

function wiersz(nazwa: string) {
  return screen.getByText(nazwa).closest("li")!;
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
}

async function renderZDanymi(wpisy = DWA_WPISY) {
  apiPaged.mockResolvedValueOnce({ data: wpisy, meta: { ...META, total: wpisy.length } });
  const wynik = render(<StazKolejka />);
  await screen.findByText("Marta Demo");
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
});

describe("StazKolejka — schemat atrap", () => {
  it("atrapa wpisu ma wszystkie klucze zasobu PHP", () => {
    expect(brakujaceKlucze(wpis(1), kluczeZasobu(ZASOB))).toEqual([]);
  });

  it("atrapa meta ma wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(META, kluczeMetaZOpenApi("/v1/admin/internship/pending"))).toEqual([]);
  });

  it("kontrola: atrapa bez klucza `hours` jest wykryta jako niepełna", () => {
    const uboga: Record<string, unknown> = { ...wpis(1) };
    delete uboga.hours;
    expect(brakujaceKlucze(uboga, kluczeZasobu(ZASOB))).toEqual(["hours"]);
  });
});

describe("StazKolejka — stany w szablonie", () => {
  it("ładowanie: szkielet w obszarze listy, jeden main, znacznik szablonu", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<StazKolejka />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
  });

  it("dane: dwa wiersze z osobą, datą, godzinami jako string, formą i stanem", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    expect(apiPaged).toHaveBeenCalledWith("/admin/internship/pending?page=1&per_page=25");
    expect(wierszeListy()).toHaveLength(2);
    expect(screen.getAllByText("czeka na decyzję")).toHaveLength(2);
    const pierwszy = wiersz("Marta Demo");
    expect(pierwszy).toHaveTextContent("Dyżur z 27.08.2026 · 3.5 h · dyżur telefoniczny · konsultacje: 4");
    expect(pierwszy).toHaveTextContent("Dyżur telefoniczny — bez danych osób.");
    const drugi = wiersz("Filip Demo");
    expect(drugi).toHaveTextContent("2 h · czat · konsultacje: 0");
    expect(drugi).toHaveTextContent("Bez opisu.");
  });

  it("kolejność wierszy jest kolejnością z serwera", async () => {
    await renderZDanymi([DWA_WPISY[1], DWA_WPISY[0]]);
    const nazwy = wierszeListy().map((li) => li.textContent ?? "");
    expect(nazwy[0]).toContain("Filip Demo");
    expect(nazwy[1]).toContain("Marta Demo");
  });

  it("każdy wiersz ma jeden rząd trzech przycisków: Zatwierdź, Poproś o poprawkę, Odrzuć dyżur", async () => {
    await renderZDanymi();
    for (const nazwa of ["Marta Demo", "Filip Demo"]) {
      const przyciski = within(wiersz(nazwa)).getAllByRole("button").map((b) => b.textContent);
      expect(przyciski).toEqual(["Zatwierdź", "Poproś o poprawkę", "Odrzuć dyżur"]);
    }
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("pusty: „Brak wpisów do decyzji”", async () => {
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    const { container } = render(<StazKolejka />);
    await screen.findByRole("heading", { name: "Brak wpisów do decyzji" });
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
  });

  it.each([401, 403])("odmowa %i: stan brak uprawnień z rolą, zero danych, jeden main", async (status) => {
    apiPaged.mockRejectedValueOnce(blad(status, status === 401 ? "unauthenticated" : "forbidden", "Odmowa."));
    const { container } = render(<StazKolejka />);
    await waitFor(() => expect(container.textContent).toContain("administracji"));
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
    expect(container.textContent).not.toContain("Marta");
    expect(container.textContent).not.toContain("Dyżur z");
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, ponowienie wczytuje listę", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<StazKolejka />);
    const ponow = await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    apiPaged.mockResolvedValueOnce({ data: DWA_WPISY, meta: META });
    await uzytkownik.click(ponow);
    await screen.findByText("Marta Demo");
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

  it("stronicowanie: druga strona woła zapytanie z page=2", async () => {
    apiPaged.mockResolvedValueOnce({ data: DWA_WPISY, meta: { ...META, last_page: 2, total: 40 } });
    const uzytkownik = userEvent.setup();
    render(<StazKolejka />);
    await screen.findByText("Strona 1 z 2");
    apiPaged.mockResolvedValueOnce({
      data: [wpis(93, { user: { id: 19, first_name: "Ewa", last_name: "Demo" } })],
      meta: { ...META, current_page: 2, last_page: 2, total: 40 },
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Ewa Demo");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/internship/pending?page=2&per_page=25");
  });
});

describe("StazKolejka — decyzje", () => {
  it("Zatwierdź: POST na accept bez ciała, wiersz znika, potwierdzenie w Toast", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    api.mockResolvedValueOnce(wpis(91, { status: "accepted" }));
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Zatwierdź" }));
    await waitFor(() => expect(screen.queryByText("Marta Demo", { selector: "p" })).toBeNull());
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/internship/91/accept", { method: "POST" });
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur zatwierdzony: Marta Demo.");
    expect(screen.getByText("Filip Demo")).toBeInTheDocument();
  });

  it("Poproś o poprawkę: sekcja w treści bez okna dialogowego, jeden przycisk główny", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderZDanymi();
    expect(oknaDialogowe()).toHaveLength(0);
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę: Marta Demo/ });
    expect(wiersz("Marta Demo").contains(formularz)).toBe(true);
    expect(oknaDialogowe()).toHaveLength(0);
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(within(formularz).getByRole("button", { name: "Wróć do listy" })).toBeInTheDocument();
    sprawdzSzablon(container);
  });

  it("kontrola: ta sama sekcja owinięta w Dialog jest wykryta jako okno dialogowe", () => {
    render(
      <Dialog
        tytul="Poproś o poprawkę"
        etykietaWycofania="Wróć do listy"
        etykietaPotwierdzenia="Poproś o poprawkę"
        onWycofaj={() => undefined}
        onPotwierdz={() => undefined}
      >
        <FormSection
          tytul="Poproś o poprawkę"
          pola={[{ id: "k", etykieta: "Komentarz", rodzaj: "wieloliniowy" }]}
          onAnuluj={() => undefined}
          onZapisz={() => undefined}
        />
      </Dialog>,
    );
    expect(oknaDialogowe().length).toBeGreaterThan(0);
  });

  it("otwarcie decyzji przenosi fokus na pierwsze pole formularza (sekcja otwierana działaniem)", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę: Marta Demo/ });
    const pierwsze = formularz.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
    expect(pierwsze).not.toBeNull();
    expect(pierwsze).toHaveFocus();
  });

  it("Poproś o poprawkę bez komentarza: 422 z serwera, błąd przy polu, wiersz zostaje", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę/ });
    api.mockRejectedValueOnce(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", {
        comment: ["Dodaj komentarz przed odesłaniem wpisu."],
      }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Poproś o poprawkę" }));
    await waitFor(() => expect(within(formularz).getAllByText("Dodaj komentarz przed odesłaniem wpisu.").length).toBeGreaterThan(0));
    expect(api).toHaveBeenCalledWith("/admin/internship/91/return", { method: "POST", body: { comment: "" } });
    expect(wiersz("Marta Demo")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Poproś o poprawkę z komentarzem: POST na return z komentarzem, wiersz znika, Toast", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /Co trzeba poprawić/ }), "Uzupełnij opis dyżuru.");
    api.mockResolvedValueOnce(wpis(91, { status: "returned", review_comment: "Uzupełnij opis dyżuru." }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Poproś o poprawkę" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(api).toHaveBeenCalledWith("/admin/internship/91/return", {
      method: "POST",
      body: { comment: "Uzupełnij opis dyżuru." },
    });
    expect(screen.queryByText("Marta Demo", { selector: "p" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur odesłany do poprawy. Marta Demo.");
  });

  it("Odrzuć dyżur z powodem: POST na reject, wiersz znika, Toast", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Filip Demo")).getByRole("button", { name: "Odrzuć dyżur" }));
    const formularz = await screen.findByRole("form", { name: /Odrzuć dyżur: Filip Demo/ });
    expect(oknaDialogowe()).toHaveLength(0);
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /Powód odrzucenia/ }), "Dyżur nie odbył się.");
    api.mockResolvedValueOnce(wpis(92, { status: "rejected" }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odrzuć dyżur" }));
    await waitFor(() => expect(screen.queryByText("Filip Demo", { selector: "p" })).toBeNull());
    expect(api).toHaveBeenCalledWith("/admin/internship/92/reject", {
      method: "POST",
      body: { comment: "Dyżur nie odbył się." },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur odrzucony. Filip Demo.");
  });

  it("Odrzuć dyżur bez powodu: 422 z serwera, błąd przy polu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Filip Demo")).getByRole("button", { name: "Odrzuć dyżur" }));
    const formularz = await screen.findByRole("form", { name: /Odrzuć dyżur/ });
    api.mockRejectedValueOnce(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", { comment: ["Dodaj powód przed odrzuceniem wpisu."] }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odrzuć dyżur" }));
    await waitFor(() => expect(within(formularz).getAllByText("Dodaj powód przed odrzuceniem wpisu.").length).toBeGreaterThan(0));
    expect(api).toHaveBeenCalledWith("/admin/internship/92/reject", { method: "POST", body: { comment: "" } });
  });

  it("entry_locked: komunikat z koperty, sekcja zamknięta, lista odświeżona bez rozstrzygniętego wpisu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    api.mockRejectedValueOnce(blad(403, "entry_locked", "Ten wpis został już rozstrzygnięty."));
    apiPaged.mockResolvedValueOnce({ data: [DWA_WPISY[1]], meta: { ...META, total: 1 } });
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Zatwierdź" }));
    await screen.findByText("Ten wpis został już rozstrzygnięty.");
    await waitFor(() => expect(screen.queryByText("Marta Demo", { selector: "p" })).toBeNull());
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Filip Demo")).toBeInTheDocument();
  });

  it("Wróć do listy zamyka sekcję bez żądania", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odrzuć dyżur" }));
    const formularz = await screen.findByRole("form", { name: /Odrzuć dyżur/ });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Wróć do listy" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(wiersz("Marta Demo")).toBeInTheDocument();
  });

  it("błąd sieci przy zapisie decyzji: komunikat, wiersz zostaje, lista nie jest wczytywana ponownie", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Zatwierdź" }));
    await screen.findByText("Decyzja nie została zapisana");
    expect(screen.getByText("Nie udało się zapisać decyzji. Sprawdź połączenie i spróbuj ponownie.")).toBeInTheDocument();
    expect(wiersz("Marta Demo")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("ostatni wpis na liście: po decyzji stan pusty", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi([DWA_WPISY[0]]);
    api.mockResolvedValueOnce(wpis(91, { status: "accepted" }));
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Zatwierdź" }));
    await screen.findByRole("heading", { name: "Brak wpisów do decyzji" });
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur zatwierdzony");
  });
});
