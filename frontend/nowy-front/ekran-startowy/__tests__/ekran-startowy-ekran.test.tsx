import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Stany ekranu „Treść ekranu Zacznij tutaj” (A-30) na `FormTemplate`:
 * ładowanie, dane z podglądem, zapis, 422 z polami, odmowa 401/403, brak
 * (404), błąd sieci (odczyt i zapis). Każdy stan: jeden `main` z
 * `id="tresc"` i znacznik szablonu w DOM.
 */

const api = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/klient", async (oryginal) => ({
  ...(await oryginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { EkranStartowy } = await import("../EkranStartowy");

const EKRAN = {
  video: { title: "Wprowadzenie do programu", url: null, caption: "Krótki film powitalny pojawi się tutaj wkrótce." },
  program: { title: "Jak wygląda program", body: "Pierwszy akapit.\n\nDrugi akapit." },
  expectations: { title: "Czego od Ciebie oczekujemy", body: "Regularnej pracy z materiałami." },
  updated_at: "2026-09-30T10:15:00Z",
};

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "Komunikat serwera.", errors });
}

function poczekajNaFormularz() {
  return screen.findByRole("heading", { level: 2, name: "Treść ekranu" });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-formularz");
  expect(container.querySelector("#tresc")).toBe(container.querySelector("main"));
}

function podglad(nazwa: string) {
  return screen.getByRole("region", { name: nazwa });
}

beforeEach(() => {
  api.mockReset();
  back.mockReset();
});

describe("A-30 — stany w szablonie FormTemplate", () => {
  it("ładowanie: szkielet, jeden main, bez przycisku głównego", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<EkranStartowy />);
    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("dane: pola i podgląd z odpowiedzi, data ostatniej zmiany, jedyny przycisk główny „Zapisz i opublikuj”", async () => {
    api.mockResolvedValue(EKRAN);
    const { container } = render(<EkranStartowy />);
    await poczekajNaFormularz();
    sprawdzSzablon(container);
    expect(api).toHaveBeenCalledWith("/onboarding");

    expect(screen.getByLabelText(/^Tytuł filmu powitalnego/)).toHaveValue(EKRAN.video.title);
    expect(screen.getByLabelText(/^Treść o przebiegu programu/)).toHaveValue(EKRAN.program.body);
    expect(screen.getByText(/^Ostatnia zmiana: 30 września 2026/)).toBeInTheDocument();

    expect(within(podglad("Podgląd: film")).getByRole("heading", { level: 3, name: EKRAN.video.title })).toBeInTheDocument();
    expect(within(podglad("Podgląd: film")).getByText(EKRAN.video.caption)).toBeInTheDocument();
    expect(within(podglad("Podgląd: przebieg programu")).getByText(/Pierwszy akapit\./)).toBeInTheDocument();
    expect(within(podglad("Podgląd: oczekiwania")).getByText(EKRAN.expectations.body)).toBeInTheDocument();

    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Zapisz i opublikuj");
  });

  it("błąd sieci przy odczycie: Notice z „Spróbuj ponownie”, ponowienie wczytuje dane", async () => {
    const uzytkownik = userEvent.setup();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(EKRAN);
    const { container } = render(<EkranStartowy />);
    await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(przyciskiGlowne()).toHaveLength(0);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await poczekajNaFormularz();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it.each([403, 401])("odmowa %i przy odczycie: rola w tekście, zero danych w DOM", async (status) => {
    api.mockRejectedValue(blad(status, status === 403 ? "forbidden" : "unauthenticated"));
    const { container } = render(<EkranStartowy />);
    await screen.findByText(/administracji/, { selector: "p" });
    sprawdzSzablon(container);
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(container.textContent).not.toContain(EKRAN.program.title);
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("404 przy odczycie: stan pusty z opisem, bez formularza", async () => {
    api.mockRejectedValue(blad(404, "not_found"));
    const { container } = render(<EkranStartowy />);
    await screen.findByRole("heading", { level: 2, name: "Nie znaleziono ekranu" });
    sprawdzSzablon(container);
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
  });
});

describe("A-30 — podgląd", () => {
  it("podgląd na żywo: wpisany tekst widać od razu, przed zapisem i bez wołania serwera", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(EKRAN);
    render(<EkranStartowy />);
    await poczekajNaFormularz();

    const tytul = screen.getByLabelText(/^Tytuł sekcji o przebiegu programu/);
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Nowy tytuł");
    expect(
      within(podglad("Podgląd: przebieg programu")).getByRole("heading", { level: 3, name: "Nowy tytuł" }),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("HTML wpisany w treść jest tekstem: zero elementów script/img w podglądzie", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(EKRAN);
    render(<EkranStartowy />);
    await poczekajNaFormularz();

    const tresc = screen.getByLabelText(/^Treść o przebiegu programu/);
    await uzytkownik.clear(tresc);
    await uzytkownik.click(tresc);
    await uzytkownik.paste('<script>alert(1)</script><img src=x onerror=alert(2)>');
    const sekcja = podglad("Podgląd: przebieg programu");
    expect(sekcja.textContent).toContain("<script>alert(1)</script>");
    expect(sekcja.querySelector("script, img")).toBeNull();
  });

  it("adres filmu: https daje odnośnik z rel, inny schemat zostaje tekstem podpisu", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(EKRAN);
    render(<EkranStartowy />);
    await poczekajNaFormularz();

    const adres = screen.getByLabelText(/^Adres filmu w internecie/);
    await uzytkownik.click(adres);
    await uzytkownik.paste("https://example.org/film");
    const odnosnik = within(podglad("Podgląd: film")).getByRole("link", { name: "Otwórz film" });
    expect(odnosnik).toHaveAttribute("href", "https://example.org/film");
    expect(odnosnik).toHaveAttribute("rel", "noopener noreferrer");

    await uzytkownik.clear(adres);
    await uzytkownik.click(adres);
    await uzytkownik.paste("javascript:alert(1)");
    expect(within(podglad("Podgląd: film")).queryByRole("link")).toBeNull();
  });
});

describe("A-30 — zapis", () => {
  it("zmiana treści → PATCH z jedną sekcją → Toast, pola i podgląd z odpowiedzi serwera", async () => {
    const uzytkownik = userEvent.setup();
    const po = { ...EKRAN, program: { ...EKRAN.program, body: "Nowa treść." }, updated_at: "2026-09-30T11:00:00Z" };
    api.mockResolvedValueOnce(EKRAN).mockResolvedValueOnce(po);
    const { container } = render(<EkranStartowy />);
    await poczekajNaFormularz();

    const tresc = screen.getByLabelText(/^Treść o przebiegu programu/);
    await uzytkownik.clear(tresc);
    await uzytkownik.click(tresc);
    await uzytkownik.paste("Nowa treść.");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith("/admin/onboarding", {
      method: "PATCH",
      body: { program: { title: EKRAN.program.title, body: "Nowa treść." } },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Treść została zapisana i opublikowana.");
    expect(screen.getByText(/^Ostatnia zmiana: 30 września 2026.*13:00\.$/)).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("bez zmian: żadnego PATCH, Toast mówi, że nie ma czego opublikować", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(EKRAN);
    render(<EkranStartowy />);
    await poczekajNaFormularz();
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nie ma zmian do opublikowania.");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("422 na adresie filmu: błąd pod polem i w podsumowaniu, wpisana wartość zostaje", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(EKRAN).mockRejectedValueOnce(
      blad(422, "validation_failed", { "video.url": ["Podaj poprawny adres URL filmu."] }),
    );
    const { container } = render(<EkranStartowy />);
    await poczekajNaFormularz();
    const adres = screen.getByLabelText(/^Adres filmu w internecie/);
    await uzytkownik.click(adres);
    await uzytkownik.paste("nie-adres");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));

    await waitFor(() => expect(screen.getAllByText("Podaj poprawny adres URL filmu.").length).toBeGreaterThan(0));
    expect(screen.getAllByRole("alert").some((w) => /Popraw zaznaczone pola/.test(w.textContent ?? ""))).toBe(true);
    expect(screen.getByLabelText(/^Adres filmu w internecie/)).toHaveValue("nie-adres");
    sprawdzSzablon(container);
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("422 na polu w zwijanej sekcji rozwija ją z błędem", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(EKRAN).mockRejectedValueOnce(
      blad(422, "validation_failed", { "expectations.body": ["To pole jest wymagane."] }),
    );
    render(<EkranStartowy />);
    await poczekajNaFormularz();
    await uzytkownik.click(screen.getByRole("button", { name: /^Oczekiwania wobec uczestników/ }));
    const tresc = screen.getByLabelText(/^Treść o oczekiwaniach/);
    await uzytkownik.clear(tresc);
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));
    await waitFor(() => expect(screen.getByLabelText(/^Treść o oczekiwaniach/)).toHaveAttribute("aria-invalid", "true"));
  });

  it("422 na polu po ręcznym zwinięciu sekcji „Oczekiwania”: sekcja rozwinięta, komunikat przy polu widoczny", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(EKRAN).mockRejectedValueOnce(
      blad(422, "validation_failed", { "expectations.body": ["To pole jest wymagane."] }),
    );
    render(<EkranStartowy />);
    await poczekajNaFormularz();
    const naglowek = screen.getByRole("button", { name: /^Oczekiwania wobec uczestników/ });
    await uzytkownik.click(naglowek);
    await uzytkownik.clear(screen.getByLabelText(/^Treść o oczekiwaniach/));
    await uzytkownik.click(naglowek);
    expect(naglowek).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/^Treść o oczekiwaniach/)).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Oczekiwania wobec uczestników/ })).toHaveAttribute("aria-expanded", "true"),
    );
    expect(screen.getByLabelText(/^Treść o oczekiwaniach/)).toBeVisible();
    expect(screen.getByLabelText(/^Treść o oczekiwaniach/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("To pole jest wymagane.").length).toBeGreaterThan(0);
  });

  it("błąd sieci przy zapisie: Notice z „Spróbuj ponownie”, formularz zachowany, ponowienie zapisuje", async () => {
    const uzytkownik = userEvent.setup();
    api
      .mockResolvedValueOnce(EKRAN)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ...EKRAN, video: { ...EKRAN.video, title: "Nowy film" } });
    render(<EkranStartowy />);
    await poczekajNaFormularz();
    const tytul = screen.getByLabelText(/^Tytuł filmu powitalnego/);
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Nowy film");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));

    await screen.findByRole("alert");
    expect(screen.getByLabelText(/^Tytuł filmu powitalnego/)).toHaveValue("Nowy film");
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Treść została zapisana i opublikowana.");
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("403 przy zapisie (odczyt jest otwarty dla każdej roli): odmowa z rolą, zero pól i podglądu w DOM", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(EKRAN).mockRejectedValueOnce(blad(403, "forbidden"));
    const { container } = render(<EkranStartowy />);
    await poczekajNaFormularz();
    const tytul = screen.getByLabelText(/^Tytuł filmu powitalnego/);
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Zmiana");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));
    await screen.findByText(/administracji/, { selector: "p" });
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: /^Podgląd/ })).toBeNull();
    expect(container.textContent).not.toContain(EKRAN.program.title);
    sprawdzSzablon(container);
  });

  it("„Przywróć zapisane” cofa niezapisane zmiany bez wołania serwera", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValue(EKRAN);
    render(<EkranStartowy />);
    await poczekajNaFormularz();
    const tytul = screen.getByLabelText(/^Tytuł filmu powitalnego/);
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Inny");
    await uzytkownik.click(screen.getByRole("button", { name: "Przywróć zapisane" }));
    expect(screen.getByLabelText(/^Tytuł filmu powitalnego/)).toHaveValue(EKRAN.video.title);
    expect(api).toHaveBeenCalledTimes(1);
  });
});
