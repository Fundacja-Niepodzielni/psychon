import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { WNIOSEK, WNIOSEK_ODESLANY, WNIOSEK_ZAAKCEPTOWANY } from "./atrapy";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { DostawcaRamki } from "@/design-system/szablony/KontekstRamki";

/**
 * Ekran decyzji o wniosku o profil: każdy stan w szablonie `DetailTemplate` (jeden `main`,
 * znacznik szablonu), akceptacja i odesłanie z żądaniami na trasach kontraktu, komunikaty
 * 422/403/404 i błąd sieci, pobranie załącznika. Atrapa siedzi na kliencie API, więc
 * mapowanie błędów z `dane.ts` przechodzi razem z ekranem.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  // Nowa ramka składa okruszek ze ścieżki: wniosek stoi pod pozycją menu „Profile psychologa”.
  usePathname: () => "/admin/profile/12",
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
const downloadFile = vi.fn();
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...a: unknown[]) => downloadFile(...a) }));

const { ApiError } = await import("@/lib/api/klient");
const { ProfilDecyzja } = await import("../ProfilDecyzja");

const NAGLOWEK = /^Wniosek o profil: Ewa Przykładowa/;

function bladApi(status: number, code: string, message: string, extra: { errors?: Record<string, string[]>; reason?: Record<string, unknown> } = {}) {
  return new ApiError({ status, code, message, ...extra });
}

/** Adresy tras, które ekran może wołać — wszystko inne wywraca test. */
function trasy(ustawienia: { show?: unknown; accept?: unknown; ret?: unknown }) {
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    const odpowiedz =
      sciezka === "/admin/profiles/12" && !opcje?.method
        ? ustawienia.show
        : sciezka === "/admin/profiles/12/accept" && opcje?.method === "POST"
          ? ustawienia.accept
          : sciezka === "/admin/profiles/12/return" && opcje?.method === "POST"
            ? ustawienia.ret
            : new Error(`nieoczekiwane żądanie ${opcje?.method ?? "GET"} ${sciezka}`);
    if (odpowiedz instanceof Error) throw odpowiedz;
    if (typeof odpowiedz === "function") return (odpowiedz as () => unknown)();
    return odpowiedz;
  });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  const main = container.querySelector("main")!;
  expect(main.getAttribute("data-style-id")).toBe("szablon-szczegol");
  expect(container.querySelector("#tresc")).toBe(main);
}

/** Sekcja formularza ma być treścią strony, nie oknem modalnym: żadnej roli okna ani `aria-modal` w całym DOM. */
function sprawdzBezOkna() {
  expect(document.querySelector("[role='dialog'], [role='alertdialog'], [aria-modal]")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
}

async function renderGotowy(wniosek = WNIOSEK) {
  trasy({ show: wniosek });
  const wynik = render(<ProfilDecyzja id="12" />);
  await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
  return wynik;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockReset();
  downloadFile.mockReset();
});

describe("Wniosek o profil — decyzja: stany w szablonie, jeden main", () => {
  it("ładowanie: szkielet w kolumnie głównej", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProfilDecyzja id="12" />);
    sprawdzSzablon(container);
    const glowna = container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
    expect(glowna.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Wczytywanie wniosku" })).toBeInTheDocument();
  });

  it("dane: karta wniosku, opis, załączniki i jeden przycisk główny „Zatwierdź”", async () => {
    const { container } = await renderGotowy();
    sprawdzSzablon(container);
    expect(screen.getByText("Gdańsk")).toBeInTheDocument();
    expect(screen.getByText("interwencja kryzysowa, terapia poznawczo-behawioralna")).toBeInTheDocument();
    expect(screen.getByText("udzielona")).toBeInTheDocument();
    expect(screen.getByText(/Pracuję z osobami dorosłymi\./)).toBeInTheDocument();
    expect(screen.getByText("czeka na decyzję")).toBeInTheDocument();
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Zatwierdź");
    expect(screen.getByRole("button", { name: "Poproś o poprawkę" })).toBeInTheDocument();
    const wspierajaca = container.querySelector<HTMLElement>("[data-obszar='wspierajaca']")!;
    expect(within(wspierajaca).getByRole("heading", { level: 2, name: "Decyzja o wniosku" })).toBeInTheDocument();
  });

  it("po decyzji zapisanej na serwerze (zaakceptowany): informacja bez przycisku głównego", async () => {
    const { container } = await renderGotowy(WNIOSEK_ZAAKCEPTOWANY);
    sprawdzSzablon(container);
    expect(screen.getAllByText("zatwierdzony").length).toBeGreaterThan(0);
    expect(screen.getByText("Wniosek zatwierdzony")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Poproś o poprawkę" })).toBeNull();
  });

  it("po decyzji zapisanej na serwerze (odesłany): komentarz widoczny, bez przycisku głównego", async () => {
    const { container } = await renderGotowy(WNIOSEK_ODESLANY);
    sprawdzSzablon(container);
    expect(screen.getByText(/Komentarz: Uzupełnij opis podejścia\./)).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("wniosek opublikowany (status spoza typu klienta): znacznik „opublikowany” i brak decyzji", async () => {
    const { container } = await renderGotowy({ ...WNIOSEK, status: "published" as never });
    sprawdzSzablon(container);
    expect(screen.getByText("opublikowany")).toBeInTheDocument();
    expect(screen.getByText("Wniosek nie czeka na decyzję")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it.each([401, 403])("brak uprawnień (%i): wariant odmowy z rolą w kolumnie głównej, zero danych wniosku", async (status) => {
    trasy({ show: () => Promise.reject(bladApi(status, status === 401 ? "unauthenticated" : "forbidden", "Odmowa.")) });
    const { container } = render(<ProfilDecyzja id="12" />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Wniosek jest niedostępny" });
    sprawdzSzablon(container);
    const glowna = container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
    expect(glowna.contains(naglowek)).toBe(true);
    expect(glowna).toHaveTextContent(/administracji/);
    expect(container.textContent).not.toMatch(/Ewa|Przykładowa|Gdańsk|interwencja kryzysowa/);
    expect(screen.queryByRole("button", { name: /^Pobierz załącznik/ })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("brak wniosku (404): „Nie znaleziono wniosku” z wyjściem", async () => {
    trasy({ show: () => Promise.reject(bladApi(404, "not_found", "Nie znaleziono wniosku.")) });
    const { container } = render(<ProfilDecyzja id="12" />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Nie znaleziono wniosku" });
    sprawdzSzablon(container);
    expect(container.querySelector("[data-obszar='glowna']")!.contains(naglowek)).toBe(true);
  });

  it("niepoprawny identyfikator w adresie: ten sam stan, bez żądania", () => {
    const { container } = render(<ProfilDecyzja id="abc" />);
    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono wniosku" })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, które wczytuje wniosek", async () => {
    const uzytkownik = userEvent.setup();
    let proby = 0;
    api.mockImplementation(async () => {
      proby += 1;
      if (proby === 1) throw new TypeError("Failed to fetch");
      return WNIOSEK;
    });
    const { container } = render(<ProfilDecyzja id="12" />);
    const komunikat = await screen.findByText("Nie udało się wczytać wniosku");
    sprawdzSzablon(container);
    expect(container.querySelector("[data-obszar='glowna']")!.contains(komunikat)).toBe(true);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe("Wniosek o profil — decyzja: akceptacja", () => {
  it("kliknięcie → POST accept bez ciała, stan po decyzji z powiadomieniem", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: WNIOSEK, accept: WNIOSEK_ZAAKCEPTOWANY });
    const { container } = render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });

    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź" }));

    await screen.findByText("Wniosek zatwierdzony");
    expect(api).toHaveBeenCalledWith("/admin/profiles/12/accept", { method: "POST" });
    expect(screen.getByRole("status")).toHaveTextContent("Wniosek zatwierdzony.");
    expect(przyciskiGlowne()).toHaveLength(0);
    sprawdzSzablon(container);
  });

  it("403 entry_locked: ostrzeżenie „już rozstrzygnięty” i ponowne wczytanie rekordu", async () => {
    const uzytkownik = userEvent.setup();
    let odczyty = 0;
    api.mockImplementation(async (_sciezka: string, opcje?: { method?: string }) => {
      if (opcje?.method === "POST") throw bladApi(403, "entry_locked", "Ten wniosek został już rozstrzygnięty.");
      odczyty += 1;
      return odczyty === 1 ? WNIOSEK : WNIOSEK_ZAAKCEPTOWANY;
    });
    render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź" }));
    await screen.findByText("Wniosek jest już rozstrzygnięty");
    expect(screen.getByText("Ten wniosek został już rozstrzygnięty.")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Wczytaj wniosek ponownie" }));
    await waitFor(() => expect(screen.getByText("Wniosek zatwierdzony")).toBeInTheDocument());
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("403 forbidden przy zapisie: komunikat w panelu decyzji, ekran zostaje w szablonie", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: WNIOSEK, accept: () => Promise.reject(bladApi(403, "forbidden", "Nie masz dostępu do tej akcji.")) });
    const { container } = render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź" }));
    expect(await screen.findByText("Nie masz dostępu do tej akcji.")).toBeInTheDocument();
    sprawdzSzablon(container);
  });

  it("404 przy zapisie: komunikat z koperty w panelu", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: WNIOSEK, accept: () => Promise.reject(bladApi(404, "not_found", "Nie znaleziono wniosku.")) });
    render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź" }));
    expect(await screen.findByText("Nie znaleziono wniosku", { selector: "*" })).toBeInTheDocument();
  });

  it("błąd sieci przy zapisie: zdanie w panelu, przycisk główny zostaje do ponowienia", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: WNIOSEK, accept: () => Promise.reject(new TypeError("Failed to fetch")) });
    render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź" }));
    expect(await screen.findByText("Nie udało się zatwierdzić wniosku. Spróbuj ponownie.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
  });
});

describe("Wniosek o profil — decyzja: odesłanie z komentarzem", () => {
  async function otworzPoprawke() {
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("button", { name: "Poproś o poprawkę" }));
    return uzytkownik;
  }

  it("sekcja komentarza zastępuje rząd decyzji: jeden przycisk główny, jeden rząd przycisków", async () => {
    const { container } = await renderGotowy();
    await otworzPoprawke();

    expect(await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Wyślij prośbę o poprawkę" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Wróć do decyzji" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Zatwierdź" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(1);
    sprawdzSzablon(container);
  });

  it("otwarcie prośby o poprawkę przenosi fokus na pole komentarza (sekcja otwierana działaniem)", async () => {
    await renderGotowy();
    await otworzPoprawke();

    expect(await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ })).toHaveFocus();
  });

  it("sekcja prośby o poprawkę nie jest oknem: brak dialogu i aria-modal, formularz w głównej treści", async () => {
    const { container } = await renderGotowy();
    sprawdzBezOkna();
    await otworzPoprawke();

    const pole = await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ });
    sprawdzBezOkna();
    const main = container.querySelector("main")!;
    expect(main.contains(pole)).toBe(true);
    expect(main.contains(screen.getByRole("button", { name: "Wyślij prośbę o poprawkę" }))).toBe(true);
    expect(main.contains(screen.getByRole("button", { name: "Wróć do decyzji" }))).toBe(true);
    sprawdzSzablon(container);
  });

  it("pusty komentarz: błąd przy polu, żadnego żądania odesłania", async () => {
    await renderGotowy();
    const uzytkownik = await otworzPoprawke();
    await uzytkownik.type(await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ }), "   ");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę o poprawkę" }));
    expect((await screen.findAllByText("Dodaj komentarz przed prośbą o poprawkę.")).length).toBeGreaterThan(0);
    expect(api.mock.calls.filter((wywolanie) => wywolanie[1]?.method === "POST")).toHaveLength(0);
  });

  it("komentarz z odpowiedzią 200: ciało {reason}, powiadomienie, stan po decyzji bez przycisku głównego", async () => {
    trasy({ show: WNIOSEK, ret: WNIOSEK_ODESLANY });
    const { container } = render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    const uzytkownik = await otworzPoprawke();
    await uzytkownik.type(await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ }), "Uzupełnij opis podejścia.");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę o poprawkę" }));

    await screen.findByText("Wniosek do poprawki.");
    expect(api).toHaveBeenLastCalledWith("/admin/profiles/12/return", { method: "POST", body: { reason: "Uzupełnij opis podejścia." } });
    expect(screen.getByText(/Komentarz: Uzupełnij opis podejścia\./)).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    sprawdzSzablon(container);
  });

  it("422 z serwera: błąd przy polu komentarza", async () => {
    trasy({
      show: WNIOSEK,
      ret: () => Promise.reject(bladApi(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { reason: ["Podaj powód odesłania."] } })),
    });
    render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    const uzytkownik = await otworzPoprawke();
    await uzytkownik.type(await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę o poprawkę" }));
    expect((await screen.findAllByText("Podaj powód odesłania.")).length).toBeGreaterThan(0);
  });

  it("403 entry_locked przy odesłaniu: ostrzeżenie w sekcji komentarza", async () => {
    trasy({ show: WNIOSEK, ret: () => Promise.reject(bladApi(403, "entry_locked", "Ten wniosek został już rozstrzygnięty.")) });
    const { container } = render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    const uzytkownik = await otworzPoprawke();
    await uzytkownik.type(await screen.findByRole("textbox", { name: /^Komentarz do poprawki/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij prośbę o poprawkę" }));
    expect(await screen.findByText("Wniosek jest już rozstrzygnięty")).toBeInTheDocument();
    sprawdzSzablon(container);
  });

  it("„Wróć do decyzji” przywraca przycisk główny", async () => {
    await renderGotowy();
    const uzytkownik = await otworzPoprawke();
    await uzytkownik.click(await screen.findByRole("button", { name: "Wróć do decyzji" }));
    expect(await screen.findByRole("button", { name: "Zatwierdź" })).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
  });
});

describe("Wniosek o profil — decyzja: załączniki", () => {
  it("informacja o zapisie wglądu jest widoczna, a „Pobierz” otwiera podpisany adres z odpowiedzi", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile.mockResolvedValue(undefined);
    await renderGotowy();
    expect(screen.getByText("Każde otwarcie załącznika jest zapisywane w dzienniku działań.")).toBeInTheDocument();
    expect(screen.getByText("Dyplom, dodano 10 września 2026")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz załącznik: Zaświadczenie o niekaralności" }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(downloadFile).toHaveBeenCalledWith(WNIOSEK.documents[1].download_url, "niekaralnosc-6");
  });

  it("błąd pobrania: komunikat w kolumnie głównej", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile.mockRejectedValue(bladApi(404, "not_found", "Nie znaleziono załącznika."));
    await renderGotowy();
    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz załącznik: Dyplom" }));
    expect(await screen.findByText("Nie znaleziono załącznika.")).toBeInTheDocument();
  });

  it("wniosek bez załączników: zdanie zamiast listy", async () => {
    await renderGotowy({ ...WNIOSEK, documents: [] });
    expect(screen.getByText("Wniosek nie ma załączników.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pobierz załącznik/ })).toBeNull();
  });

  it("opis własny jest tekstem: HTML w treści nie tworzy elementów", async () => {
    const { container } = await renderGotowy({ ...WNIOSEK, bio: "<img src=x onerror=alert(1)>Opis" });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>Opis")).toBeInTheDocument();
  });
});

/**
 * Okruszki ekranu szczegółu: w nowej ramce reguła z `OkruszekRamki.ts` składa
 * korzeń „Administracja” (`/admin`), pozycję menu ramki („Profile psychologa” →
 * `/admin/profile`) i bieżącą pozycję na końcu. W nowej ramce to jedyna droga
 * powrotu; w starej powłoce i bez dostawców zostaje „Wstecz” i pełny ślad.
 */
describe("Wniosek o profil — decyzja: okruszki", () => {
  it("w nowej ramce: bez „Wstecz”, pierwsze łącze = korzeń „Administracja” → /admin, drugie = pozycja menu „Profile psychologa” → /admin/profile", async () => {
    trasy({ show: WNIOSEK });
    render(
      <DostawcaRamki
        menu={[
          {
            naglowek: "Dotychczasowy panel",
            pozycje: [{ etykieta: "Profile psychologa", href: "/admin/profile", biezaca: true }],
          },
        ]}
      >
        <ProfilDecyzja id="12" />
      </DostawcaRamki>,
    );
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    expect(screen.queryByRole("button", { name: "Wstecz" })).toBeNull();
    const okruszki = screen.getByRole("navigation", { name: "Okruszki" });
    const lacza = within(okruszki).getAllByRole("link");
    expect(lacza.map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Administracja", "/admin"],
      ["Profile psychologa", "/admin/profile"],
    ]);
    expect(okruszki.textContent).toContain("Wniosek o profil");
  });

  it("sam DostawcaPowloki (stara powłoka): „Wstecz” i ten sam ślad", async () => {
    trasy({ show: WNIOSEK });
    render(
      <DostawcaPowloki>
        <ProfilDecyzja id="12" />
      </DostawcaPowloki>,
    );
    await screen.findByRole("heading", { level: 1, name: NAGLOWEK });
    expect(screen.getByRole("button", { name: "Wstecz" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Okruszki" })).getByRole("link", { name: "Profile psychologa" })).toHaveAttribute(
      "href",
      "/admin/profile",
    );
  });
});
