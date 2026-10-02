import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { ZGLOSZENIE, ZGLOSZENIE_ODRZUCONE, ZGLOSZENIE_ZAAKCEPTOWANE } from "./atrapy";

/**
 * Ekran decyzji o zgłoszeniu rekrutacyjnym: każdy stan w szablonie `DetailTemplate`
 * (jeden `main`, znacznik szablonu), akceptacja i odrzucenie z żądaniami na trasach
 * kontraktu, komunikaty 409/422/403/404 i błąd sieci. Atrapa siedzi na kliencie API,
 * więc mapowanie błędów z `dane.ts` przechodzi razem z ekranem.
 */

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
// Ekran bierze klienta z `@/lib/api/klient`; beczkę `@/lib/api` podmieniamy zapobiegawczo, żeby przyszły import z beczki nie poszedł do prawdziwego transportu.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
const downloadFile = vi.fn();
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...a: unknown[]) => downloadFile(...a) }));

const { ApiError } = await import("@/lib/api/klient");
const { ZgloszenieDecyzja } = await import("../ZgloszenieDecyzja");

function bladApi(status: number, code: string, message: string, extra: { errors?: Record<string, string[]>; reason?: Record<string, unknown> } = {}) {
  return new ApiError({ status, code, message, ...extra });
}

/** Adresy tras, które ekran może wołać — wszystko inne wywraca test. */
function trasy(ustawienia: { show?: unknown; accept?: unknown; reject?: unknown }) {
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    const odpowiedz =
      sciezka === "/admin/applications/31" && !opcje?.method
        ? ustawienia.show
        : sciezka === "/admin/applications/31/accept" && opcje?.method === "POST"
          ? ustawienia.accept
          : sciezka === "/admin/applications/31/reject" && opcje?.method === "POST"
            ? ustawienia.reject
            : new Error(`nieoczekiwane żądanie ${opcje?.method ?? "GET"} ${sciezka}`);
    if (odpowiedz instanceof Error) throw odpowiedz;
    if (typeof odpowiedz === "function") return (odpowiedz as () => unknown)();
    return odpowiedz;
  });
}

function ustawZgloszenie(zgloszenie = ZGLOSZENIE) {
  trasy({ show: zgloszenie });
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

async function renderGotowy(zgloszenie = ZGLOSZENIE) {
  ustawZgloszenie(zgloszenie);
  const wynik = render(<ZgloszenieDecyzja id="31" />);
  await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
  return wynik;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockReset();
  downloadFile.mockReset();
});

describe("Zgłoszenie — decyzja: stany w szablonie, jeden main", () => {
  it("ładowanie: szkielet w kolumnie głównej", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    sprawdzSzablon(container);
    const glowna = container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
    expect(glowna.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Wczytywanie zgłoszenia" })).toBeInTheDocument();
  });

  it("dane: karta kandydata i jeden przycisk główny „Zatwierdź i utwórz konto”", async () => {
    const { container } = await renderGotowy();
    sprawdzSzablon(container);
    expect(screen.getByText("marta.demo@example.test")).toBeInTheDocument();
    expect(screen.getByText("Uniwersytet Demo")).toBeInTheDocument();
    expect(screen.getByText("Czeka na decyzję")).toBeInTheDocument();
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Zatwierdź i utwórz konto");
    expect(screen.getByRole("button", { name: "Odrzuć zgłoszenie" })).toBeInTheDocument();
    expect(within(container.querySelector("[data-obszar='wspierajaca']")!).getByRole("heading", { level: 2, name: "Decyzja o zgłoszeniu" })).toBeInTheDocument();
  });

  it("po decyzji zapisanej na serwerze (zaakceptowane): informacja i odnośnik do karty osoby, bez przycisku głównego", async () => {
    const { container } = await renderGotowy(ZGLOSZENIE_ZAAKCEPTOWANE);
    sprawdzSzablon(container);
    expect(screen.getByText("Zgłoszenie zatwierdzone")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Otwórz kartę osoby" })).toHaveAttribute("href", "/admin/uczestniczki/44");
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Odrzuć zgłoszenie" })).toBeNull();
  });

  it("po decyzji zapisanej na serwerze (odrzucone): powód widoczny, bez przycisku głównego", async () => {
    const { container } = await renderGotowy(ZGLOSZENIE_ODRZUCONE);
    sprawdzSzablon(container);
    expect(screen.getByText(/Brak dyplomu ukończonych studiów psychologicznych\./)).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it.each([401, 403])("brak uprawnień (%i): wariant odmowy z rolą w kolumnie głównej, zero danych zgłoszenia", async (status) => {
    trasy({ show: () => Promise.reject(bladApi(status, status === 401 ? "unauthenticated" : "forbidden", "Odmowa.")) });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Zgłoszenie jest niedostępne" });
    sprawdzSzablon(container);
    const glowna = container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
    expect(glowna.contains(naglowek)).toBe(true);
    expect(glowna).toHaveTextContent(/administracji/);
    expect(container.textContent).not.toMatch(/Marta|marta\.demo|Uniwersytet Demo/);
    expect(screen.queryByRole("button", { name: "Pobierz skan dyplomu" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("brak zgłoszenia (404): „Nie znaleziono zgłoszenia” z wyjściem", async () => {
    trasy({ show: () => Promise.reject(bladApi(404, "not_found", "Nie znaleziono zgłoszenia.")) });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Nie znaleziono zgłoszenia" });
    sprawdzSzablon(container);
    expect(container.querySelector("[data-obszar='glowna']")!.contains(naglowek)).toBe(true);
  });

  it("powrót na listę: „Wróć do listy” i okruszek prowadzą na trasę produktu naboru, nie na poligon ani wstecz", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: () => Promise.reject(bladApi(404, "not_found", "Nie znaleziono zgłoszenia.")) });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 2, name: "Nie znaleziono zgłoszenia" });

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć do listy" }));
    expect(push).toHaveBeenCalledWith("/admin/nabor");
    expect(back).not.toHaveBeenCalled();
    const okruszek = screen.getByRole("link", { name: "Zgłoszenia rekrutacyjne" });
    expect(okruszek.getAttribute("href")).toBe("/admin/nabor");
  });

  it("okruszek szczegółu: Administracja › Sprawy › Zgłoszenia rekrutacyjne › osoba ze zgłoszenia", async () => {
    trasy({ show: ZGLOSZENIE });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    const okruszek = screen.getByRole("navigation", { name: "Okruszki" });
    const elementy = Array.from(okruszek.querySelectorAll("li")).map((li) => li.firstElementChild?.textContent);
    expect(elementy).toEqual(["Administracja", "Sprawy", "Zgłoszenia rekrutacyjne", "Marta Demo"]);
    expect(okruszek.querySelector("a[href='/admin/nabor']")?.textContent).toBe("Zgłoszenia rekrutacyjne");
  });

  it("niepoprawny identyfikator w adresie: ten sam stan, bez żądania", () => {
    const { container } = render(<ZgloszenieDecyzja id="abc" />);
    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono zgłoszenia" })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, które wczytuje zgłoszenie", async () => {
    const uzytkownik = userEvent.setup();
    let proby = 0;
    api.mockImplementation(async () => {
      proby += 1;
      if (proby === 1) throw new TypeError("Failed to fetch");
      return ZGLOSZENIE;
    });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    const komunikat = await screen.findByText("Nie udało się wczytać zgłoszenia");
    sprawdzSzablon(container);
    expect(container.querySelector("[data-obszar='glowna']")!.contains(komunikat)).toBe(true);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe("Zgłoszenie — decyzja: akceptacja", () => {
  it("rola domyślna = rola ze zgłoszenia; kliknięcie → POST accept i stan po decyzji z powiadomieniem", async () => {
    const uzytkownik = userEvent.setup();
    trasy({
      show: ZGLOSZENIE,
      accept: { user_id: 44, access_expires_at: "2027-03-30T09:00:00Z", invitation_mail: "sent" },
    });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    expect(screen.getByRole("combobox", { name: /^Rola konta/ })).toHaveTextContent("Wolontariusz");

    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));

    await screen.findByText("Zgłoszenie zatwierdzone");
    expect(api).toHaveBeenCalledWith("/admin/applications/31/accept", { method: "POST", body: { role: "volunteer" } });
    expect(screen.getByRole("status")).toHaveTextContent("Zgłoszenie zatwierdzone. Konto zostało utworzone.");
    expect(screen.getByRole("link", { name: "Otwórz kartę osoby" })).toHaveAttribute("href", "/admin/uczestniczki/44");
    expect(przyciskiGlowne()).toHaveLength(0);
    sprawdzSzablon(container);
  });

  it("wybrana rola trafia do żądania", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: ZGLOSZENIE, accept: { user_id: 44, access_expires_at: "2027-03-30T09:00:00Z", invitation_mail: "sent" } });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("combobox", { name: /^Rola konta/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Student" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    await screen.findByText("Zgłoszenie zatwierdzone");
    expect(api).toHaveBeenCalledWith("/admin/applications/31/accept", { method: "POST", body: { role: "student" } });
  });

  it("zaproszenie, które nie wyszło, jest nazwane osobnym komunikatem", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: ZGLOSZENIE, accept: { user_id: 44, access_expires_at: "2027-03-30T09:00:00Z", invitation_mail: "failed" } });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    expect(await screen.findByText("Zaproszenie nie zostało wysłane")).toBeInTheDocument();
  });

  it("422: błąd pola „Rola konta” z odpowiedzi serwera, ekran zostaje w decyzji", async () => {
    const uzytkownik = userEvent.setup();
    trasy({
      show: ZGLOSZENIE,
      accept: () => Promise.reject(bladApi(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { role: ["Nieznana rola."] } })),
    });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    expect(await screen.findByText("Nieznana rola.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
    sprawdzSzablon(container);
  });

  it("409 email_already_registered: komunikat z koperty i odnośnik do karty istniejącej osoby", async () => {
    const uzytkownik = userEvent.setup();
    trasy({
      show: ZGLOSZENIE,
      accept: () =>
        Promise.reject(bladApi(409, "email_already_registered", "Na ten adres jest już zarejestrowane konto.", { reason: { existing_user_id: 17 } })),
    });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    expect(await screen.findByText("Na ten adres jest już zarejestrowane konto.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Otwórz kartę osoby" })).toHaveAttribute("href", "/admin/uczestniczki/17");
    expect(przyciskiGlowne()).toHaveLength(1);
    sprawdzSzablon(container);
  });

  it("409 pełny limit miejsc: ostrzeżenie z liczbami, potem akceptacja mimo limitu wysyła force:true", async () => {
    const uzytkownik = userEvent.setup();
    let wywolania = 0;
    trasy({
      show: ZGLOSZENIE,
      accept: () => {
        wywolania += 1;
        if (wywolania === 1) {
          return Promise.reject(
            bladApi(409, "edition_capacity_exceeded", "Limit miejsc w edycji został przekroczony.", { reason: { capacity: 20, active: 20, requested: 1 } }),
          );
        }
        return { user_id: 44, access_expires_at: "2027-03-30T09:00:00Z", invitation_mail: "sent" };
      },
    });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));

    expect(await screen.findByText(/Limit: 20, zajęte: 20\./)).toBeInTheDocument();
    sprawdzSzablon(container);
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Zatwierdź mimo limitu miejsc");

    await uzytkownik.click(glowne[0]);
    await screen.findByText("Zgłoszenie zatwierdzone");
    expect(api).toHaveBeenLastCalledWith("/admin/applications/31/accept", { method: "POST", body: { role: "volunteer", force: true } });
  });

  it("409 zgłoszenie już rozstrzygnięte: ostrzeżenie i ponowne wczytanie rekordu", async () => {
    const uzytkownik = userEvent.setup();
    let odczyty = 0;
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
      if (opcje?.method === "POST") throw bladApi(409, "application_already_decided", "Zgłoszenie zostało już rozstrzygnięte.");
      odczyty += 1;
      return odczyty === 1 ? ZGLOSZENIE : ZGLOSZENIE_ZAAKCEPTOWANE;
    });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    await screen.findByText("Zgłoszenie jest już rozstrzygnięte");
    await uzytkownik.click(screen.getByRole("button", { name: "Wczytaj zgłoszenie ponownie" }));
    await waitFor(() => expect(screen.getByText("Zgłoszenie zatwierdzone")).toBeInTheDocument());
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("403 przy zapisie: komunikat w panelu decyzji, ekran zostaje w szablonie", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: ZGLOSZENIE, accept: () => Promise.reject(bladApi(403, "forbidden", "Nie masz dostępu do tej akcji.")) });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    expect(await screen.findByText("Nie masz dostępu do tej akcji.")).toBeInTheDocument();
    sprawdzSzablon(container);
  });

  it("błąd sieci przy zapisie: zdanie w panelu, przycisk główny zostaje do ponowienia", async () => {
    const uzytkownik = userEvent.setup();
    trasy({ show: ZGLOSZENIE, accept: () => Promise.reject(new TypeError("Failed to fetch")) });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }));
    expect(await screen.findByText("Nie udało się zatwierdzić zgłoszenia. Spróbuj ponownie.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
  });
});

describe("Zgłoszenie — decyzja: odrzucenie z powodem", () => {
  async function otworzOdrzucenie() {
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }));
    return uzytkownik;
  }

  it("pole powodu zastępuje wybór roli: zatwierdzenie znika, odrzucenie zostaje jednym przyciskiem bez wypełnienia", async () => {
    ustawZgloszenie();
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await otworzOdrzucenie();

    expect(await screen.findByRole("textbox", { name: /^Powód odrzucenia/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Odrzuć zgłoszenie" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Wróć do decyzji" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Zatwierdź i utwórz konto" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
    sprawdzSzablon(container);
  });

  it("otwarcie odrzucenia przenosi fokus na pole powodu (sekcja otwierana działaniem)", async () => {
    ustawZgloszenie();
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await otworzOdrzucenie();

    expect(await screen.findByRole("textbox", { name: /^Powód odrzucenia/ })).toHaveFocus();
  });

  it("sekcja odrzucenia nie jest oknem: brak dialogu i aria-modal, formularz w głównej treści", async () => {
    ustawZgloszenie();
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    sprawdzBezOkna();
    await otworzOdrzucenie();

    const pole = await screen.findByRole("textbox", { name: /^Powód odrzucenia/ });
    sprawdzBezOkna();
    const main = container.querySelector("main")!;
    expect(main.contains(pole)).toBe(true);
    expect(main.contains(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }))).toBe(true);
    expect(main.contains(screen.getByRole("button", { name: "Wróć do decyzji" }))).toBe(true);
    sprawdzSzablon(container);
  });

  it("pusty powód: błąd przy polu, żadnego żądania odrzucenia", async () => {
    ustawZgloszenie();
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    const uzytkownik = await otworzOdrzucenie();
    await screen.findByRole("textbox", { name: /^Powód odrzucenia/ });
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Powód odrzucenia/ }), "   ");
    await uzytkownik.click(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }));
    expect(await screen.findAllByText("Podaj powód odrzucenia zgłoszenia.")).not.toHaveLength(0);
    expect(api.mock.calls.filter((wywolanie) => wywolanie[1]?.method === "POST")).toHaveLength(0);
  });

  it("powód z odpowiedzią 200: ciało {reason}, powiadomienie, stan po decyzji bez przycisku głównego", async () => {
    trasy({ show: ZGLOSZENIE, reject: ZGLOSZENIE_ODRZUCONE });
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    const uzytkownik = await otworzOdrzucenie();
    await uzytkownik.type(await screen.findByRole("textbox", { name: /^Powód odrzucenia/ }), "Brak dyplomu.");
    await uzytkownik.click(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }));

    await screen.findByText("Zgłoszenie odrzucone.");
    expect(api).toHaveBeenLastCalledWith("/admin/applications/31/reject", { method: "POST", body: { reason: "Brak dyplomu." } });
    expect(screen.getByText(/Powód: Brak dyplomu ukończonych studiów psychologicznych\./)).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    sprawdzSzablon(container);
  });

  it("422 z serwera: błąd przy polu powodu", async () => {
    trasy({
      show: ZGLOSZENIE,
      reject: () => Promise.reject(bladApi(422, "validation_failed", "Popraw zaznaczone pola.", { errors: { reason: ["Podaj powód odrzucenia zgłoszenia."] } })),
    });
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    const uzytkownik = await otworzOdrzucenie();
    await uzytkownik.type(await screen.findByRole("textbox", { name: /^Powód odrzucenia/ }), "x");
    await uzytkownik.click(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }));
    expect((await screen.findAllByText("Podaj powód odrzucenia zgłoszenia.")).length).toBeGreaterThan(0);
  });

  it("„Wróć do decyzji” przywraca wybór roli i przycisk główny", async () => {
    ustawZgloszenie();
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    const uzytkownik = await otworzOdrzucenie();
    await uzytkownik.click(await screen.findByRole("button", { name: "Wróć do decyzji" }));
    expect(await screen.findByRole("button", { name: "Zatwierdź i utwórz konto" })).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
  });
});

describe("Zgłoszenie — decyzja: skan dyplomu", () => {
  it("przycisk pobiera skan z trasy diploma-scan; informacja o zapisie wglądu jest widoczna", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile.mockResolvedValue(undefined);
    await renderGotowy();
    expect(screen.getByText(/Każde otwarcie skanu jest zapisywane w dzienniku działań\./)).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz skan dyplomu" }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(downloadFile.mock.calls[0][0]).toMatch(/\/api\/v1\/admin\/applications\/31\/diploma-scan$/);
  });

  it("błąd pobrania: komunikat z serwera", async () => {
    const uzytkownik = userEvent.setup();
    downloadFile.mockRejectedValue(bladApi(404, "diploma_scan_not_found", "Nie znaleziono pliku skanu dyplomu."));
    await renderGotowy();
    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz skan dyplomu" }));
    expect(await screen.findByText("Nie znaleziono pliku skanu dyplomu.")).toBeInTheDocument();
  });

  it("zgłoszenie bez skanu: zdanie zamiast przycisku", async () => {
    await renderGotowy({ ...ZGLOSZENIE, has_diploma_scan: false, diploma_scan_url: null });
    expect(screen.getByText("Do zgłoszenia nie dołączono skanu dyplomu.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pobierz skan dyplomu" })).toBeNull();
  });
});

describe("Zgłoszenie — decyzja: przycisk odrzucenia w stałym miejscu", () => {
  function rzadOdrzucenia() {
    return screen.getByTestId("rzad-odrzucenia");
  }

  function sprawdzPrzyciskOdrzucenia(container: HTMLElement) {
    const przycisk = within(rzadOdrzucenia()).getByRole("button", { name: "Odrzuć zgłoszenie" });
    const klasy = przycisk.className.split(/\s+/);
    expect(klasy.some((klasa) => /(^|_)outline(_|$)/.test(klasa))).toBe(true);
    expect(klasy.some((klasa) => /(^|_)niebezpieczny(_|$)/.test(klasa))).toBe(true);
    expect(klasy.some((klasa) => /(^|_)primary(_|$)/.test(klasa))).toBe(false);
    const panel = container.querySelector("[data-obszar='wspierajaca'] section")!;
    expect(panel.lastElementChild).toBe(rzadOdrzucenia());
    expect(within(rzadOdrzucenia()).getAllByRole("button")).toHaveLength(1);
  }

  it("przed otwarciem pola powodu: ostatni rząd panelu, osobno od zatwierdzenia, obrys z czerwonym napisem", async () => {
    ustawZgloszenie();
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });

    sprawdzPrzyciskOdrzucenia(container);
    expect(rzadOdrzucenia().contains(screen.getByRole("button", { name: "Zatwierdź i utwórz konto" }))).toBe(false);
  });

  it("po otwarciu pola powodu: ten sam rząd i ten sam wygląd, „Wróć do decyzji” stoi poza nim", async () => {
    ustawZgloszenie();
    const { container } = render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await userEvent.click(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }));
    await screen.findByRole("textbox", { name: /^Powód odrzucenia/ });

    sprawdzPrzyciskOdrzucenia(container);
    expect(rzadOdrzucenia().contains(screen.getByRole("button", { name: "Wróć do decyzji" }))).toBe(false);
  });

  it("samo otwarcie pola powodu niczego nie wysyła, a przy polu stoi zdanie, że kandydat powodu nie dostaje", async () => {
    ustawZgloszenie();
    render(<ZgloszenieDecyzja id="31" />);
    await screen.findByRole("heading", { level: 1, name: /^Zgłoszenie: Marta Demo/ });
    await userEvent.click(screen.getByRole("button", { name: "Odrzuć zgłoszenie" }));
    await screen.findByRole("textbox", { name: /^Powód odrzucenia/ });

    expect(api.mock.calls.filter((wywolanie) => wywolanie[1]?.method === "POST")).toHaveLength(0);
    expect(screen.getByText("Powód zostaje zapisany przy zgłoszeniu. Kandydat nie dostaje go w wiadomości.")).toBeInTheDocument();
  });
});
