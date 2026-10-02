import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { odpowiedzPulpitu } from "./atrapa";

const pobierzPulpitAdministracji = vi.fn();
const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", () => ({
  pobierzPulpitAdministracji: (...args: unknown[]) => pobierzPulpitAdministracji(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PulpitAdministracji } = await import("../PulpitAdministracji");

const ZERA = odpowiedzPulpitu({
  queues: [
    { key: "applications", count: 0, link: "/admin/uczestniczki" },
    { key: "internship_entries", count: 0, link: "/admin/staz" },
  ],
});

/** Każdy stan ekranu: jeden main z id=tresc i znacznik szablonu pulpitu w DOM. */
function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-pulpit");
}

function przyciskiGlowne(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === "Otwórz sprawy");
}

beforeEach(() => {
  pobierzPulpitAdministracji.mockReset();
  push.mockReset();
  back.mockReset();
});

describe("kontrola sprawdzenia szablonu", () => {
  it("odrzuca DOM z dwoma main, z innym id i bez znacznika szablonu", () => {
    const dwa = document.createElement("div");
    dwa.innerHTML = '<main id="tresc" tabindex="-1" data-style-id="szablon-pulpit"></main><main></main>';
    expect(() => sprawdzSzablon(dwa)).toThrow();

    const beznaczn = document.createElement("div");
    beznaczn.innerHTML = '<main id="tresc" tabindex="-1"></main>';
    expect(() => sprawdzSzablon(beznaczn)).toThrow();

    const inneId = document.createElement("div");
    inneId.innerHTML = '<main id="inne" tabindex="-1" data-style-id="szablon-pulpit"></main>';
    expect(() => sprawdzSzablon(inneId)).toThrow();
  });
});

describe("Pulpit administracji — stany ekranu", () => {
  it("ładowanie: szkielet w szablonie, brak przycisku głównego i brak liczb", () => {
    pobierzPulpitAdministracji.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PulpitAdministracji />);

    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByText("Uczestnicy w programie")).not.toBeInTheDocument();
  });

  it("dane: liczniki, sprawy z liczbami i odnośnikami z odpowiedzi, jeden przycisk główny", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(screen.getByText("Ukończenia programu")).toBeInTheDocument();
    expect(screen.getByText("Wydane certyfikaty")).toBeInTheDocument();
    expect(container.querySelector("#pulpit-uczestnicy")?.textContent).toContain("12");
    expect(container.querySelector("#pulpit-uczestnicy")?.textContent).toContain("osób");
    expect(container.querySelector("#pulpit-ukonczenia")?.textContent).toContain("osoby");
    expect(container.querySelector("#pulpit-certyfikaty")?.textContent).toContain("2");
    expect(container.querySelector("#pulpit-certyfikaty")?.textContent).toContain("certyfikaty");

    const odnosnik = screen.getByRole("link", { name: "Otwórz: Zgłoszenia rekrutacyjne" });
    expect(odnosnik).toHaveAttribute("href", "/admin/uczestniczki");
    // Pytania odczytuje i odpowiada na nie prowadzący — wiersz zostaje z liczbą, bez akcji.
    expect(screen.queryByRole("link", { name: "Otwórz: Pytania bez odpowiedzi" })).not.toBeInTheDocument();
    expect(container.querySelector("a[href='/prowadzacy/pytania']")).toBeNull();
    // Dolna karta „Zgłoszenia rekrutacyjne” była dublem wiersza listy — jej już nie ma.
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(container.querySelector("#pulpit-zgloszenia")).toBeNull();
    expect(screen.getAllByText("Zgłoszenia rekrutacyjne")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Co czeka na decyzję" })).toBeTruthy();
    // Widoczny napis akcji jest krótki, pełną nazwę niesie nazwa dostępna linku.
    expect(odnosnik.textContent).toMatch(/^Otwórz\s*›$/);
    expect(screen.getAllByText("czeka na decyzję").length).toBeGreaterThan(0);
    expect(screen.queryByText("Czeka na decyzję")).not.toBeInTheDocument();
    expect(screen.queryByText("Zgłoszenia do decyzji")).not.toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(1);
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  it("dane: przycisk „Otwórz sprawy” przechodzi pod link kolejki applications", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);
    await waitFor(() => expect(przyciskiGlowne(container)).toHaveLength(1));

    await uzytkownik.click(przyciskiGlowne(container)[0]);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/uczestniczki");
    expect(przyciskiGlowne(container)[0]).not.toHaveAttribute("aria-disabled");
  });

  it("pusty: wszystkie liczby zerowe pokazują „Brak spraw do decyzji”, liczniki zostają, przycisk niedostępny z powodem", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(ZERA);
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Otwórz:/ })).not.toBeInTheDocument();

    const glowny = przyciskiGlowne(container)[0];
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).toHaveAccessibleDescription("Brak zgłoszeń rekrutacyjnych do decyzji.");
    await uzytkownik.click(glowny);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Nie można otworzyć spraw")).toBeInTheDocument();
  });

  it("dane: inne kolejki mają sprawy, ale applications ma 0 — przycisk niedostępny z powodem, bez przejścia", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 0, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 7, link: "/admin/staz" },
        ],
      }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Otwórz: Dyżury czekające na decyzję" })).toBeInTheDocument(),
    );
    const glowny = przyciskiGlowne(container)[0];
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).toHaveAccessibleDescription("Brak zgłoszeń rekrutacyjnych do decyzji.");
    await uzytkownik.click(glowny);
    expect(push).not.toHaveBeenCalled();
  });

  it("dane: bez kolejki applications w odpowiedzi przycisk jest niedostępny z powodem, bez przejścia", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({ queues: [{ key: "internship_entries", count: 7, link: "/admin/staz" }] }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Otwórz: Dyżury czekające na decyzję" })).toBeInTheDocument(),
    );
    const glowny = przyciskiGlowne(container)[0];
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(glowny).toHaveAccessibleDescription("Odpowiedź serwera nie zawiera zgłoszeń rekrutacyjnych do otwarcia.");
    await uzytkownik.click(glowny);
    expect(push).not.toHaveBeenCalled();
  });

  it("pusty: odpowiedź bez kolejek też pokazuje stan pusty i przycisk bez celu", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu({ queues: [] }));
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)[0]).toHaveAttribute("aria-disabled", "true");
  });

  it("dane: kolejka z adresem spoza aplikacji nie ma odnośnika, a kliknięcie pokazuje ostrzeżenie", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 3, link: "https://obcy.example/x" },
          { key: "questions", count: 1, link: "/prowadzacy/pytania" },
        ],
      }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Zgłoszenia rekrutacyjne")).toBeInTheDocument());
    expect(container.querySelector("a[href^='http']")).toBeNull();
    await uzytkownik.click(screen.getByRole("button", { name: "Otwórz: Zgłoszenia rekrutacyjne" }));
    expect(screen.getByText("Adres tych spraw z odpowiedzi serwera jest nieprawidłowy.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("403 forbidden: komunikat o braku dostępu, bez liczb i bez przycisku głównego", async () => {
    pobierzPulpitAdministracji.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }),
    );
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText(/Ten ekran jest dla administracji/)).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByText("Uczestnicy w programie")).not.toBeInTheDocument();
  });

  it("401: ten sam stan braku dostępu", async () => {
    pobierzPulpitAdministracji.mockRejectedValue(
      new ApiError({ status: 401, code: "unauthenticated", message: "Zaloguj się." }),
    );
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText(/Ten ekran jest dla administracji/)).toBeInTheDocument());
    sprawdzSzablon(container);
  });

  it("błąd sieci: Notice z błędem, brak zmyślonych zer, ponowienie wczytuje dane", async () => {
    pobierzPulpitAdministracji
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Nie udało się wczytać pulpitu")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(container.querySelector("[role='alert']")).toBeTruthy();
    expect(screen.queryByText("Uczestnicy w programie")).not.toBeInTheDocument();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument());
    sprawdzSzablon(container);
    expect(pobierzPulpitAdministracji).toHaveBeenCalledTimes(2);
  });

  it("odpowiedź o złym kształcie jest błędem, nie zerami", async () => {
    pobierzPulpitAdministracji.mockResolvedValue({ counters: { participants: "dużo" }, queues: [] });
    const { container } = render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Nie udało się wczytać pulpitu")).toBeInTheDocument());
    sprawdzSzablon(container);
  });

  it("odświeżenie ze stanu pustego wczytuje dane od nowa", async () => {
    pobierzPulpitAdministracji.mockResolvedValueOnce(ZERA).mockResolvedValueOnce(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    render(<PulpitAdministracji />);

    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Odśwież" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Otwórz: Zgłoszenia rekrutacyjne" })).toBeInTheDocument());
    expect(pobierzPulpitAdministracji).toHaveBeenCalledTimes(2);
  });

  it("przycisk powrotu w nagłówku wraca do poprzedniego ekranu", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    render(<PulpitAdministracji />);
    await waitFor(() => expect(screen.getByText("Uczestnicy w programie")).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("Pulpit administracji — wiersz pytań bez odpowiedzi nie prowadzi do odmowy", () => {
  /** Wiersz listy z tytułem `nazwa` (najbliższy przodek będący wierszem tabeli listy). */
  function wiersz(nazwa: string): HTMLElement {
    const w = screen.getByText(nazwa).closest('[role="row"]');
    if (!(w instanceof HTMLElement)) throw new Error(`brak wiersza „${nazwa}”`);
    return w;
  }

  /** Komórka wiersza pod nagłówkiem kolumny o podanej nazwie. */
  function komorka(wierszListy: HTMLElement, kolumna: string): HTMLElement {
    const naglowki = within(screen.getByRole("table", { name: "Co czeka na decyzję" })).getAllByRole("columnheader");
    const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === kolumna);
    expect(indeks, `kolumna „${kolumna}”`).toBeGreaterThanOrEqual(0);
    return within(wierszListy).getAllByRole("cell")[indeks];
  }

  it("kolumny w kolejności: Kolejka, Stan, Liczba, akcja — nazwa pierwsza, dane z jednego odczytu pulpitu", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    render(<PulpitAdministracji />);
    await screen.findByText("Pytania bez odpowiedzi");

    const tabela = screen.getByRole("table", { name: "Co czeka na decyzję" });
    expect(within(tabela).getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Kolejka",
      "Stan",
      "Liczba",
      "Akcja",
    ]);
    const zgloszenia = wiersz("Zgłoszenia rekrutacyjne");
    expect(within(zgloszenia).getAllByRole("cell")[0]).toBe(komorka(zgloszenia, "Kolejka"));
    expect(komorka(zgloszenia, "Kolejka")).toHaveTextContent(/^Zgłoszenia rekrutacyjne$/);
    expect(komorka(zgloszenia, "Stan")).toHaveTextContent(/^Stan\s*czeka na decyzję$/);
    expect(komorka(zgloszenia, "Liczba")).toHaveTextContent(/^Liczba\s*4\s*sprawy$/);
    expect(komorka(zgloszenia, "Akcja")).toContainElement(
      screen.getByRole("link", { name: "Otwórz: Zgłoszenia rekrutacyjne" }),
    );
    // Adnotacja kolejki bez akcji stoi pod jej nazwą, w pierwszej kolumnie.
    expect(komorka(wiersz("Pytania bez odpowiedzi"), "Kolejka")).toHaveTextContent(
      /^Pytania bez odpowiedziodpowiada prowadzący$/,
    );
    expect(pobierzPulpitAdministracji).toHaveBeenCalledTimes(1);
  });

  it("wiersz questions: liczba i adnotacja „odpowiada prowadzący”, zero odnośnika i zero przycisku", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    render(<PulpitAdministracji />);
    await screen.findByText("Pytania bez odpowiedzi");

    const pytania = wiersz("Pytania bez odpowiedzi");
    expect(within(pytania).getByText("7")).toBeInTheDocument();
    expect(within(pytania).getByText("spraw")).toBeInTheDocument();
    expect(within(pytania).getByText("odpowiada prowadzący")).toBeInTheDocument();
    expect(within(pytania).queryByRole("link")).toBeNull();
    expect(within(pytania).queryByRole("button")).toBeNull();
    expect(pytania.textContent).not.toMatch(/Otwórz/);
  });

  it("wiersz questions: nie fokusowalny, nie klikalny, bez odnośnika; komórka akcji jest pusta", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    render(<PulpitAdministracji />);
    await screen.findByText("Pytania bez odpowiedzi");

    const pytania = wiersz("Pytania bez odpowiedzi");
    // Ani tabindex, ani href, ani obsługi kliknięcia na żadnym elemencie wiersza; jedyne role to struktura tabeli.
    for (const element of [pytania, ...Array.from(pytania.querySelectorAll("*"))]) {
      expect(element.hasAttribute("tabindex")).toBe(false);
      expect(element.hasAttribute("href")).toBe(false);
      expect(element.hasAttribute("onclick")).toBe(false);
      expect([null, "row", "cell"]).toContain(element.getAttribute("role"));
    }
    expect(pytania.getAttribute("role")).toBe("row");
    expect(pytania.querySelectorAll("a, button, input, select, textarea, [contenteditable]")).toHaveLength(0);
    // Komórka akcji stoi w swojej kolumnie (liczba zostaje w kolumnie liczb), ale nic w niej nie ma.
    const komorki = within(pytania).getAllByRole("cell");
    expect(komorki).toHaveLength(4);
    expect(komorki[3].textContent).toBe("");
    expect(komorki[3].children).toHaveLength(0);
    // Ukryte przed czytnikiem są w tym wierszu tylko podpisy kolumn przy wartościach.
    const ukryte = Array.from(pytania.querySelectorAll('[aria-hidden="true"]')).map((el) => el.textContent);
    expect(ukryte).toEqual(["Stan", "Liczba"]);
    // W sąsiednim wierszu dochodzi tylko strzałka wewnątrz odnośnika „Otwórz”.
    const ukryteSasiada = Array.from(wiersz("Zgłoszenia rekrutacyjne").querySelectorAll('[aria-hidden="true"]'));
    expect(ukryteSasiada.filter((el) => el.closest("a") === null).map((el) => el.textContent)).toEqual(["Stan", "Liczba"]);
    expect(ukryteSasiada.filter((el) => el.closest("a") !== null)).toHaveLength(1);
  });

  it("pozostałe wiersze mają „Otwórz” na swoje adresy z odpowiedzi serwera", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 4, link: "/admin/uczestniczki" },
          { key: "internship_entries", count: 7, link: "/admin/staz" },
          { key: "profiles", count: 2, link: "/admin/profile" },
          { key: "questions", count: 7, link: "/prowadzacy/pytania" },
        ],
      }),
    );
    render(<PulpitAdministracji />);
    await screen.findByText("Pytania bez odpowiedzi");

    const adresy: [string, string][] = [
      ["Zgłoszenia rekrutacyjne", "/admin/uczestniczki"],
      ["Dyżury czekające na decyzję", "/admin/staz"],
      ["Profile prowadzących do decyzji", "/admin/profile"],
    ];
    for (const [nazwa, adres] of adresy) {
      const odnosnik = within(wiersz(nazwa)).getByRole("link", { name: `Otwórz: ${nazwa}` });
      expect(odnosnik).toHaveAttribute("href", adres);
      expect(within(wiersz(nazwa)).queryByText("odpowiada prowadzący")).toBeNull();
    }
    // Dokładnie trzy odnośniki akcji w całym ekranie: pytań wśród nich nie ma.
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("suma „Razem” obejmuje liczbę pytań", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    render(<PulpitAdministracji />);
    await screen.findByText("Pytania bez odpowiedzi");
    // 4 + 7 + 0 + 7 z atrapy.
    expect(screen.getByText("Razem").parentElement).toHaveTextContent(/^Razem\s*18\s*spraw$/);
    // Suma stoi w kolumnie liczb — tej samej, w której stoją liczby wierszy.
    const stopka = screen.getByText("Razem").closest('[role="row"]') as HTMLElement;
    expect(within(stopka).getAllByRole("cell")[2]).toHaveTextContent(/^18\s*spraw$/);
    expect(komorka(wiersz("Pytania bez odpowiedzi"), "Liczba")).toHaveTextContent(/^Liczba\s*7\s*spraw$/);
  });

  it("reguła idzie po kluczu kolejki: questions z adresem w aplikacji i z obcym nadal bez akcji", async () => {
    for (const link of ["/admin/pytania", "https://obcy.example/x", "/prowadzacy/pytania"]) {
      pobierzPulpitAdministracji.mockResolvedValue(
        odpowiedzPulpitu({
          queues: [
            { key: "applications", count: 1, link: "/admin/uczestniczki" },
            { key: "questions", count: 2, link },
          ],
        }),
      );
      const { unmount } = render(<PulpitAdministracji />);
      await screen.findByText("Pytania bez odpowiedzi");
      expect(within(wiersz("Pytania bez odpowiedzi")).queryByRole("link")).toBeNull();
      expect(within(wiersz("Pytania bez odpowiedzi")).queryByRole("button")).toBeNull();
      unmount();
      pobierzPulpitAdministracji.mockReset();
    }
  });

  it("kontrola: ten sam adres pod innym kluczem kolejki dalej daje „Otwórz”", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 1, link: "/admin/uczestniczki" },
          { key: "profiles", count: 2, link: "/prowadzacy/pytania" },
        ],
      }),
    );
    render(<PulpitAdministracji />);
    await screen.findByText("Profile prowadzących do decyzji");
    expect(
      within(wiersz("Profile prowadzących do decyzji")).getByRole("link", {
        name: "Otwórz: Profile prowadzących do decyzji",
      }),
    ).toHaveAttribute("href", "/prowadzacy/pytania");
  });

  it("pytania z liczbą 0: nadal bez akcji, z plakietką „brak spraw”", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(
      odpowiedzPulpitu({
        queues: [
          { key: "applications", count: 3, link: "/admin/uczestniczki" },
          { key: "questions", count: 0, link: "/prowadzacy/pytania" },
        ],
      }),
    );
    render(<PulpitAdministracji />);
    await screen.findByText("Pytania bez odpowiedzi");
    const pytania = wiersz("Pytania bez odpowiedzi");
    expect(within(pytania).getByText("brak spraw")).toBeInTheDocument();
    expect(within(pytania).getByText("odpowiada prowadzący")).toBeInTheDocument();
    expect(within(pytania).queryByRole("link")).toBeNull();
  });

  it("przycisk „Otwórz sprawy” w nagłówku bez zmian: prowadzi pod link kolejki applications", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const uzytkownik = userEvent.setup();
    const { container } = render(<PulpitAdministracji />);
    await waitFor(() => expect(przyciskiGlowne(container)).toHaveLength(1));
    await uzytkownik.click(przyciskiGlowne(container)[0]);
    expect(push).toHaveBeenCalledWith("/admin/uczestniczki");
  });
});

describe("Pulpit administracji — przycisk główny w nagłówku (makieta 2.0.4, `.head .acts`)", () => {
  it("dane: „Otwórz sprawy” stoi w nagłówku przy tytule, nie w treści (kontrola dodatnia: jest dokładnie jeden)", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    const { container } = render(<PulpitAdministracji />);
    await waitFor(() => expect(przyciskiGlowne(container)).toHaveLength(1));

    const glowa = container.querySelector("[data-testid='pageheader-glowa']")!;
    expect(glowa).toContainElement(screen.getByRole("heading", { level: 1, name: "Pulpit administracji" }));
    expect(glowa).toContainElement(przyciskiGlowne(container)[0]);
    expect(container.querySelector("[data-obszar='naglowek']")).toContainElement(przyciskiGlowne(container)[0]);
  });

  it("pusty: powód niedostępności stoi pod nagłówkiem i opisuje przycisk (aria-describedby)", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(ZERA);
    const { container } = render(<PulpitAdministracji />);
    await waitFor(() => expect(screen.getByText("Brak spraw do decyzji")).toBeInTheDocument());

    const powod = screen.getByText("Brak zgłoszeń rekrutacyjnych do decyzji.");
    expect(container.querySelector("[data-obszar='naglowek']")).toContainElement(powod);
    expect(przyciskiGlowne(container)[0].getAttribute("aria-describedby")).toBe(powod.id);
  });

  it("lista spraw ma nagłówek h2 (pod h1, bez przeskoku stopnia)", async () => {
    pobierzPulpitAdministracji.mockResolvedValue(odpowiedzPulpitu());
    render(<PulpitAdministracji />);
    expect(await screen.findByRole("heading", { level: 2, name: "Co czeka na decyzję" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});
