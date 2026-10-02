import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocumentTemplate, DocumentTemplateVersion } from "@/lib/api/document-templates";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Stany ekranu „Wzory dokumentów” w obszarach szablonu widoku szczegółu,
 * zapis nowej wersji i pytanie przed utratą zmian. Atrapa siedzi na kliencie
 * HTTP (`lib/api/klient`), więc adresy, metody i ciała żądań są mierzone na
 * prawdziwych funkcjach `lib/api/document-templates`.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});

const { WzoryDokumentow } = await import("../WzoryDokumentow");
const { ApiError } = await import("@/lib/api/klient");

const WZOR: DocumentTemplate = {
  type: "agreement",
  content: "<p>Porozumienie {{ $number }}</p>",
  version: 2,
  updated_at: "2026-09-28T10:00:00Z",
  updated_by: { id: 5, name: "Anna Testowa" },
};

const HISTORIA: DocumentTemplateVersion[] = [
  { version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 5, name: "Anna Testowa" } },
  { version: 1, updated_at: "2026-09-01T08:00:00Z", updated_by: null },
];

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "Komunikat serwera.", errors });
}

interface Ustawienia {
  wzor?: DocumentTemplate;
  historia?: DocumentTemplateVersion[];
  put?: (tresc: string) => unknown;
}

function ustawSerwer({ wzor = WZOR, historia = HISTORIA, put }: Ustawienia = {}) {
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: { content: string } }) => {
    if (opcje?.method === "PUT") {
      if (put) return put(opcje.body!.content);
      return { ...wzor, content: opcje.body!.content, version: wzor.version + 1, updated_at: "2026-09-30T12:00:00Z" };
    }
    if (sciezka.endsWith("/versions")) return historia;
    return wzor;
  });
}

function poleTresci(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: /Treść wzoru/ }) as HTMLTextAreaElement;
}

function wpisz(tresc: string) {
  fireEvent.change(poleTresci(), { target: { value: tresc } });
}

async function renderGotowy() {
  ustawSerwer();
  const wynik = render(<WzoryDokumentow />);
  await screen.findByRole("textbox", { name: /Treść wzoru/ });
  return wynik;
}

function przyciskiGlowne(container: HTMLElement) {
  return Array.from(container.ownerDocument.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function obszarGlowny(container: HTMLElement) {
  return container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wzory dokumentów — stany w szablonie widoku szczegółu, jeden main", () => {
  function sprawdzSzablon(container: HTMLElement, znacznik: HTMLElement) {
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-szczegol");
    expect(container.querySelector("main")!.contains(znacznik)).toBe(true);
  }

  it("dane: edytor treści w kolumnie głównej", async () => {
    const { container } = await renderGotowy();
    expect(obszarGlowny(container).contains(poleTresci())).toBe(true);
    sprawdzSzablon(container, poleTresci());
    expect(poleTresci().value).toBe(WZOR.content);
  });

  it("ładowanie: szkielet w kolumnie głównej", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<WzoryDokumentow />);
    sprawdzSzablon(container, container.querySelector<HTMLElement>("[aria-busy='true']")!);
  });

  /** Stany puste stoją na szablonie listy: jedna kolumna, karta na całą szerokość treści. */
  function sprawdzListe(container: HTMLElement, znacznik: HTMLElement) {
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-lista");
    expect(container.querySelector("main")!.contains(znacznik)).toBe(true);
    expect(container.querySelector("[data-obszar='wspierajaca']")).toBeNull();
    expect(container.querySelector("[data-obszar='kolumny']")).toBeNull();
  }

  it("brak wzoru (404): stan pusty z tekstem „Brak wzoru tego typu” stoi w karcie stanu pustego", async () => {
    api.mockRejectedValue(blad(404, "not_found"));
    const { container } = render(<WzoryDokumentow />);
    const naglowek = await screen.findByRole("heading", { name: "Brak wzoru tego typu" });
    sprawdzListe(container, naglowek);
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(container.querySelector("[data-testid='obszar-lista']")!.contains(karta)).toBe(true);
    expect(within(karta).getByRole("heading", { level: 2, name: "Brak wzoru tego typu" })).toBeInTheDocument();
    expect(within(karta).getAllByRole("button")).toHaveLength(1);
    expect(within(karta).getByRole("button", { name: "Wróć" })).toBeInTheDocument();
  });

  it("brak wzoru (404): treść podaje prawdziwą przyczynę, bez zgadywania o środowisku", async () => {
    api.mockRejectedValue(blad(404, "not_found"));
    render(<WzoryDokumentow />);
    await screen.findByRole("heading", { name: "Brak wzoru tego typu" });
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(karta).toHaveTextContent(
      "Dla tego rodzaju dokumentu nie ma jeszcze zapisanego wzoru. Dokumenty tego rodzaju powstają z wbudowanego wzoru.",
    );
    expect(karta.textContent).not.toMatch(/wyłączony|w tym środowisku/);
    fireEvent.click(within(karta).getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("brak wzoru po zmianie rodzaju z klawiatury: fokus zostaje na wyborze rodzaju", async () => {
    const uzytkownik = userEvent.setup();
    api.mockImplementation(async (sciezka: string) => {
      if (sciezka.startsWith("/document-templates/agreement")) return sciezka.endsWith("/versions") ? HISTORIA : WZOR;
      throw blad(404, "not_found");
    });
    render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    screen.getByRole("combobox", { name: "Rodzaj wzoru" }).focus();
    await uzytkownik.keyboard("{Enter}{ArrowDown}{Enter}");
    await screen.findByRole("heading", { name: "Brak wzoru tego typu" });
    expect(screen.getByRole("combobox", { name: "Rodzaj wzoru" })).toHaveFocus();
  });

  it.each([401, 403])("odmowa (%i): wariant odmowy z nazwą roli, zero danych w DOM, jedno wyjście", async (status) => {
    api.mockRejectedValue(blad(status, status === 401 ? "unauthenticated" : "forbidden"));
    const { container } = render(<WzoryDokumentow />);
    const zdanie = await screen.findByText(/administracji/, { selector: "p" });
    sprawdzListe(container, zdanie);
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(within(karta).getByText(zdanieOdmowyRoli("administracji"))).toBeInTheDocument();
    expect(within(karta).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.textContent).not.toContain(WZOR.content);
    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("błąd sieci: komunikat i „Spróbuj ponownie” wczytuje wzór od nowa", async () => {
    api.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<WzoryDokumentow />);
    const komunikat = await screen.findByRole("alert");
    sprawdzSzablon(container, komunikat);
    ustawSerwer();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("dane: bieżąca wersja i historia w kolumnie wspierającej", async () => {
    const { container } = await renderGotowy();
    const wspierajaca = container.querySelector<HTMLElement>("[data-obszar='wspierajaca']")!;
    // Wersja bieżąca stoi raz przy danych i raz jako wiersz historii.
    expect(within(wspierajaca).getAllByText("Wersja 2")).toHaveLength(2);
    expect(within(wspierajaca).getAllByText(/Anna Testowa/)).toHaveLength(2);
    const tabela = within(wspierajaca).getByRole("table", { name: "Historia wersji" });
    expect(within(tabela).getByText("Wersja 1")).toBeTruthy();
    expect(within(tabela).getByText("wzór jeszcze nie był edytowany")).toBeTruthy();
  });
});

describe("wzory dokumentów — wzór ze starym zapisem", () => {
  const ZDANIE = "Ten wzór ma stary zapis. Dokumenty powstają z wzoru domyślnego.";

  async function renderZeZnacznikiem(znacznik: Record<string, unknown>) {
    ustawSerwer({ wzor: { ...WZOR, ...znacznik } as DocumentTemplate });
    const wynik = render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    return wynik;
  }

  it("znacznik true: zdanie stoi w kolumnie głównej od wejścia, przed próbą zapisu", async () => {
    const { container } = await renderZeZnacznikiem({ current_version_unused: true });
    const zdanie = screen.getByText(ZDANIE);
    expect(obszarGlowny(container).contains(zdanie)).toBe(true);
    expect(screen.getAllByText(ZDANIE)).toHaveLength(1);
    // Zdanie stoi przed polem treści i nie jest błędem przerywającym czytnik.
    expect(zdanie.compareDocumentPosition(poleTresci()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.mock.calls.some((wywolanie) => wywolanie[1]?.method === "PUT")).toBe(false);
    // Stara treść jest pokazana w polu taka, jaka leży w bazie.
    expect(poleTresci().value).toBe(WZOR.content);
  });

  it("znacznik false: zdania nie ma", async () => {
    await renderZeZnacznikiem({ current_version_unused: false });
    expect(screen.queryByText(ZDANIE)).toBeNull();
    expect(screen.queryByText(/stary zapis/i)).toBeNull();
  });

  it("brak pola w odpowiedzi: zdania nie ma", async () => {
    await renderGotowy();
    expect(WZOR).not.toHaveProperty("current_version_unused");
    expect(screen.queryByText(ZDANIE)).toBeNull();
    expect(screen.queryByText(/stary zapis/i)).toBeNull();
  });

  it("zapis w nowym zapisie zdejmuje zdanie, gdy serwer odpowiada znacznikiem false", async () => {
    ustawSerwer({
      wzor: { ...WZOR, current_version_unused: true } as DocumentTemplate,
      put: (tresc) => ({ ...WZOR, content: tresc, version: 3, current_version_unused: false }),
    });
    render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    expect(screen.getByText(ZDANIE)).toBeInTheDocument();
    wpisz("<p>Numer {{ $number }}</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    await screen.findByRole("status");
    await waitFor(() => expect(screen.queryByText(ZDANIE)).toBeNull());
  });
});

describe("wzory dokumentów — fokus przy wejściu", () => {
  it("po wejściu pole treści nie ma fokusu, więc pierwszy Tab trafia w „Przejdź do treści”", async () => {
    await renderGotowy();
    expect(poleTresci()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("wzory dokumentów — odczyt", () => {
  it("odczyt biegnie dwiema trasami z kontraktu, dla pierwszego rodzaju", async () => {
    await renderGotowy();
    const sciezki = api.mock.calls.map((wywolanie) => wywolanie[0]);
    expect(sciezki).toContain("/document-templates/agreement");
    expect(sciezki).toContain("/document-templates/agreement/versions");
    expect(api.mock.calls.every((wywolanie) => wywolanie[1] === undefined)).toBe(true);
  });

  it("jeden przycisk główny na ekranie: „Zapisz nową wersję”", async () => {
    const { container } = await renderGotowy();
    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(1);
    expect(glowne[0].textContent).toBe("Zapisz nową wersję");
  });
});

describe("wzory dokumentów — zapis nowej wersji", () => {
  it("PUT z samym polem content, potem powiadomienie i nowy wpis na czele historii", async () => {
    const { container } = await renderGotowy();
    wpisz("<p>Nowa treść</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));

    const powiadomienie = await screen.findByRole("status");
    expect(powiadomienie.textContent).toContain("Zapisano wersję 3");
    expect(powiadomienie.textContent).toContain("Poprzednie wersje zostają w historii");

    const zapis = api.mock.calls.find((wywolanie) => wywolanie[1]?.method === "PUT")!;
    expect(zapis[0]).toBe("/document-templates/agreement");
    expect(zapis[1]).toEqual({ method: "PUT", body: { content: "<p>Nowa treść</p>" } });

    const tabela = within(container.querySelector<HTMLElement>("[data-obszar='wspierajaca']")!).getByRole("table", {
      name: "Historia wersji",
    });
    expect(within(tabela).getByText("Wersja 3")).toBeTruthy();
    expect(poleTresci().value).toBe("<p>Nowa treść</p>");
  });

  it("puste pole: błąd przy polu, żadnego żądania zapisu", async () => {
    await renderGotowy();
    wpisz("   ");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    expect((await screen.findAllByText("Wpisz treść wzoru.")).length).toBeGreaterThan(0);
    expect(api.mock.calls.some((wywolanie) => wywolanie[1]?.method === "PUT")).toBe(false);
  });

  it("treść bez zmian: błąd przy polu, żadnego żądania zapisu", async () => {
    await renderGotowy();
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    expect((await screen.findAllByText(/taka sama jak w bieżącej wersji/)).length).toBeGreaterThan(0);
    expect(api.mock.calls.some((wywolanie) => wywolanie[1]?.method === "PUT")).toBe(false);
  });

  it("422 z polem content: komunikat serwera przy polu, wpisana treść zostaje", async () => {
    ustawSerwer({
      put: () => {
        throw blad(422, "validation_failed", { content: ["Pole treść jest wymagane."] });
      },
    });
    render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    wpisz("<p>x</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    expect((await screen.findAllByText("Pole treść jest wymagane.")).length).toBeGreaterThan(0);
    expect(poleTresci().value).toBe("<p>x</p>");
  });

  it("403 przy zapisie: komunikat nad formularzem, treść zostaje", async () => {
    ustawSerwer({
      put: () => {
        throw blad(403, "forbidden");
      },
    });
    render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    wpisz("<p>x</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    const komunikat = await screen.findByRole("alert");
    expect(komunikat.textContent).toContain(zdanieOdmowyRoli("administracji"));
    expect(poleTresci().value).toBe("<p>x</p>");
  });

  it("404 przy zapisie: komunikat, że nie znaleziono wzoru; treść zostaje", async () => {
    ustawSerwer({
      put: () => {
        throw blad(404, "not_found");
      },
    });
    render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    wpisz("<p>x</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    const komunikat = await screen.findByRole("alert");
    expect(komunikat.textContent).toContain("Nie znaleziono wzoru tego rodzaju");
    expect(poleTresci().value).toBe("<p>x</p>");
  });

  it("błąd sieci przy zapisie: komunikat, treść zostaje, można zapisać ponownie", async () => {
    let proby = 0;
    ustawSerwer({
      put: (tresc) => {
        proby += 1;
        if (proby === 1) throw new TypeError("Failed to fetch");
        return { ...WZOR, content: tresc, version: 3, updated_at: "2026-09-30T12:00:00Z" };
      },
    });
    render(<WzoryDokumentow />);
    await screen.findByRole("textbox", { name: /Treść wzoru/ });
    wpisz("<p>x</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    const komunikat = await screen.findByRole("alert");
    expect(komunikat.textContent).toContain("Nie udało się zapisać. Spróbuj ponownie.");
    expect(poleTresci().value).toBe("<p>x</p>");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz nową wersję" }));
    await screen.findByRole("status");
    expect(proby).toBe(2);
  });
});

describe("wzory dokumentów — zmiana rodzaju i utrata zmian", () => {
  const ROLE_POL = ["textbox", "searchbox", "combobox", "spinbutton", "checkbox", "radio", "switch", "slider", "listbox"] as const;

  /** Pola wejściowe w oknie potwierdzenia: po rolach dostępności i po znacznikach pól. */
  function polaWOknie(okno: HTMLElement) {
    const poRolach = ROLE_POL.flatMap((rola) => within(okno).queryAllByRole(rola));
    const poZnacznikach = Array.from(okno.querySelectorAll("input, textarea, select, [contenteditable]"));
    return [...poRolach, ...poZnacznikach];
  }

  async function wybierzRodzaj(nazwa: string) {
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByRole("combobox", { name: "Rodzaj wzoru" }));
    await uzytkownik.click(screen.getByRole("option", { name: nazwa }));
  }

  it("bez zmian: przełączenie rodzaju od razu wczytuje wzór tego rodzaju", async () => {
    await renderGotowy();
    await wybierzRodzaj("Certyfikat ukończenia programu");
    await waitFor(() => {
      const sciezki = api.mock.calls.map((wywolanie) => wywolanie[0]);
      expect(sciezki).toContain("/document-templates/certificate");
      expect(sciezki).toContain("/document-templates/certificate/versions");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("z niezapisaną treścią: pytanie; „Zostań i edytuj” nic nie wczytuje i zostawia treść", async () => {
    await renderGotowy();
    wpisz("<p>zmiana</p>");
    const wywolaniaPrzed = api.mock.calls.length;
    await wybierzRodzaj("Zaświadczenie o stażu");
    const okno = await screen.findByRole("dialog");
    expect(within(okno).getByRole("heading", { name: "Porzucić niezapisane zmiany?" })).toBeTruthy();
    expect(within(okno).queryAllByRole("textbox")).toHaveLength(0);
    expect(polaWOknie(okno)).toHaveLength(0);
    fireEvent.click(within(okno).getByRole("button", { name: "Zostań i edytuj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.mock.calls.length).toBe(wywolaniaPrzed);
    expect(poleTresci().value).toBe("<p>zmiana</p>");
  });

  it("z niezapisaną treścią: potwierdzenie porzuca zmiany i wczytuje wybrany rodzaj", async () => {
    await renderGotowy();
    wpisz("<p>zmiana</p>");
    await wybierzRodzaj("Zaświadczenie o stażu");
    const okno = await screen.findByRole("dialog");
    fireEvent.click(within(okno).getByRole("button", { name: "Zmień rodzaj bez zapisu" }));
    await waitFor(() =>
      expect(api.mock.calls.map((wywolanie) => wywolanie[0])).toContain("/document-templates/attendance_certificate"),
    );
  });

  it("Wstecz z niezapisaną treścią pyta; bez zmian wraca od razu", async () => {
    await renderGotowy();
    fireEvent.click(screen.getByTestId("pageheader-powrot"));
    expect(back).toHaveBeenCalledTimes(1);
    wpisz("<p>zmiana</p>");
    fireEvent.click(screen.getByTestId("pageheader-powrot"));
    expect(back).toHaveBeenCalledTimes(1);
    const okno = await screen.findByRole("dialog");
    fireEvent.click(within(okno).getByRole("button", { name: "Wyjdź bez zapisu" }));
    expect(back).toHaveBeenCalledTimes(2);
  });

  it("„Cofnij zmiany” pyta i po potwierdzeniu przywraca zapisaną treść", async () => {
    await renderGotowy();
    wpisz("<p>zmiana</p>");
    fireEvent.click(screen.getByRole("button", { name: "Cofnij zmiany" }));
    const okno = await screen.findByRole("dialog");
    expect(within(okno).getByRole("heading", { name: "Cofnąć zmiany we wzorze?" })).toBeTruthy();
    fireEvent.click(within(okno).getByRole("button", { name: "Cofnij zmiany" }));
    expect(poleTresci().value).toBe(WZOR.content);
  });
});
