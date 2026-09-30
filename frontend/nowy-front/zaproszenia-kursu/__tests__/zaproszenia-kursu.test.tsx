import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { KURS_BEZ_KOLEJNOSCI, KURS_NA_SCIEZCE, KURS_SPOTKANIE, STUDENCI, WOLONTARIUSZE, strona } from "./atrapy";

/**
 * Ekran „Zaproszenia na kurs” (`/nowy-front/admin/kursy/[id]/zaproszenia`):
 * każdy stan ma jeden `main` szablonu formularza z jego znacznikiem stylu,
 * a wysyłka i odpowiedzi 200/401/403/404/422/sieć są sprawdzane po ścieżce i
 * ciele żądania wysłanego do klienta API.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...args: unknown[]) => api(...args),
    apiPaged: (...args: unknown[]) => apiPaged(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { ZaproszeniaKursu } = await import("../ZaproszeniaKursu");

function bladApi(status: number, code: string, message: string, reszta: Record<string, unknown> = {}) {
  return new ApiError({ status, code, message, ...reszta });
}

/** Kurs z `GET /admin/courses/{id}` i osoby z `GET /admin/users` (po roli z zapytania). */
function ustawDane(kurs: unknown, wyslanie?: (cialo: unknown) => unknown) {
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: unknown }) => {
    if (opcje?.method === "POST") {
      if (!wyslanie) throw new Error("nieoczekiwany zapis");
      const wynik = wyslanie(opcje.body);
      if (wynik instanceof Error) throw wynik;
      return wynik;
    }
    if (kurs instanceof Error) throw kurs;
    return kurs;
  });
  apiPaged.mockImplementation(async (sciezka: string) =>
    sciezka.includes("role=student") ? strona(STUDENCI) : strona(WOLONTARIUSZE),
  );
}

function zapisy() {
  return api.mock.calls.filter(([, opcje]) => opcje?.method === "POST");
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function znacznikStylu(kontener: HTMLElement) {
  return kontener.querySelector("main")?.dataset.styleId;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
});

describe("Zaproszenia na kurs — stany ekranu na szablonie formularza", () => {
  it("ładowanie: szkielet, jeden main, znacznik szablonu, bez listy osób", () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("dane: osoby z obu ról po nazwisku, jeden main, jeden przycisk główny „Wyślij zaproszenia”, pusta lista zaproszonych", async () => {
    ustawDane(KURS_SPOTKANIE);
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    await screen.findByRole("checkbox", { name: /Marta Kowalska/ });
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.getAllByRole("checkbox").map((pole) => pole.parentElement?.textContent)).toEqual([
      "Filip Adamski · filip@demo.pl",
      "Marta Kowalska · marta@demo.pl",
      "Ewa Nowak · ewa@demo.pl",
    ]);
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Wyślij zaproszenia");
    expect(screen.getByText("Nikt nie jest jeszcze zaproszony")).toBeInTheDocument();
    expect(screen.getByText(/Spotkanie na żywo w internecie/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/webinar/i);
  });

  it("lista osób pobierana z filtrem aktywnych wolontariuszy i studentów", async () => {
    ustawDane(KURS_SPOTKANIE);
    render(<ZaproszeniaKursu idKursu="7" />);
    await screen.findByRole("checkbox", { name: /Marta Kowalska/ });
    const adresy = apiPaged.mock.calls.map(([sciezka]) => String(sciezka));
    expect(adresy).toHaveLength(2);
    expect(adresy.some((adres) => adres.includes("role=volunteer") && adres.includes("status=active"))).toBe(true);
    expect(adresy.some((adres) => adres.includes("role=student") && adres.includes("status=active"))).toBe(true);
  });

  it("kurs typu „kurs” bez miejsca w kolejności przyjmuje zaproszenia (reguła po miejscu w kolejności, nie po typie)", async () => {
    ustawDane(KURS_BEZ_KOLEJNOSCI);
    render(<ZaproszeniaKursu idKursu="9" />);
    expect(await screen.findByRole("checkbox", { name: /Marta Kowalska/ })).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
  });

  it("kurs z miejscem w kolejności programu: wyjaśnienie zamiast formularza, osoby nie są wczytywane", async () => {
    ustawDane(KURS_NA_SCIEZCE);
    const { container } = render(<ZaproszeniaKursu idKursu="8" />);
    expect(await screen.findByText("Ten kurs ma miejsce w kolejności programu")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it.each([403, 401])("odpowiedź %i na odczyt kursu: odmowa z nazwą roli, zero osób w DOM", async (status) => {
    ustawDane(bladApi(status, status === 401 ? "unauthenticated" : "forbidden", "Brak."));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    await screen.findByText(/administracji/);
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(apiPaged).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });

  it("404 na odczyt kursu: informacja o braku kursu i powrót, bez listy osób", async () => {
    ustawDane(bladApi(404, "not_found", "Nie znaleziono zasobu."));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("adres kursu, który nie jest liczbą: brak kursu bez żadnego zapytania", async () => {
    ustawDane(KURS_SPOTKANIE);
    const { container } = render(<ZaproszeniaKursu idKursu="abc" />);
    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(api).not.toHaveBeenCalled();
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it("błąd sieci przy odczycie kursu: komunikat i „Spróbuj ponownie”, które wczytuje kurs od nowa", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(new Error("sieć"));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wczytać kursu");
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikStylu(container)).toBe("szablon-formularz");

    ustawDane(KURS_SPOTKANIE);
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("checkbox", { name: /Marta Kowalska/ })).toBeInTheDocument();
  });
});

describe("Zaproszenia na kurs — lista osób", () => {
  it("błąd odczytu listy osób: komunikat w szablonie i „Spróbuj ponownie”", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE);
    apiPaged.mockRejectedValue(new Error("sieć"));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    expect(await screen.findByText("Nie udało się wczytać listy osób")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();

    apiPaged.mockImplementation(async () => strona(WOLONTARIUSZE));
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("checkbox", { name: /Marta Kowalska/ })).toBeInTheDocument();
  });

  it("403 na odczyt listy osób: odmowa, zero osób w DOM", async () => {
    ustawDane(KURS_SPOTKANIE);
    apiPaged.mockRejectedValue(bladApi(403, "forbidden", "Brak."));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    await screen.findByText(/administracji/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("pusta lista osób: „Brak osób spełniających filtr”", async () => {
    ustawDane(KURS_SPOTKANIE);
    apiPaged.mockImplementation(async () => strona([]));
    render(<ZaproszeniaKursu idKursu="7" />);
    expect(await screen.findByText("Brak osób spełniających filtr")).toBeInTheDocument();
  });

  it("wyszukiwanie: fraza trafia do zapytania o obie role", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE);
    render(<ZaproszeniaKursu idKursu="7" />);
    await screen.findByRole("checkbox", { name: /Marta Kowalska/ });
    apiPaged.mockClear();

    await uzytkownik.type(screen.getByLabelText("Szukaj osoby"), "nowak");
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    const adresy = apiPaged.mock.calls.map(([sciezka]) => decodeURIComponent(String(sciezka)));
    expect(adresy.every((adres) => adres.includes("search=nowak"))).toBe(true);
  });

  it("więcej osób niż strona: podpowiedź o zawężeniu wyszukiwania", async () => {
    ustawDane(KURS_SPOTKANIE);
    apiPaged.mockImplementation(async () => strona(WOLONTARIUSZE, 250));
    render(<ZaproszeniaKursu idKursu="7" />);
    expect(await screen.findByText(/Pokazano 4 z 500 osób/)).toBeInTheDocument();
  });
});

describe("Zaproszenia na kurs — wysyłka", () => {
  async function zaznacz(uzytkownik: ReturnType<typeof userEvent.setup>, ...nazwy: RegExp[]) {
    for (const nazwa of nazwy) {
      await uzytkownik.click(await screen.findByRole("checkbox", { name: nazwa }));
    }
  }

  it("200: ciało POST to dokładnie {user_ids}, potwierdzenie z odmianą, zaproszeni na liście, zaznaczenie wyczyszczone", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE, () => ({ invited: 2 }));
    render(<ZaproszeniaKursu idKursu="7" />);
    await zaznacz(uzytkownik, /Marta Kowalska/, /Ewa Nowak/);
    expect(screen.getByText("Zaznaczono: 2")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));

    await waitFor(() => expect(zapisy()).toHaveLength(1));
    expect(zapisy()[0]).toEqual(["/admin/courses/7/invite", { method: "POST", body: { user_ids: [17, 18] } }]);
    expect(await screen.findByRole("status")).toHaveTextContent("Zaproszono 2 osoby.");
    expect(screen.queryByText("Nikt nie jest jeszcze zaproszony")).toBeNull();
    const zaproszeni = screen.getByRole("region", { name: "Zaproszone osoby" });
    expect(zaproszeni).toHaveTextContent("Marta Kowalska");
    expect(zaproszeni).toHaveTextContent("Ewa Nowak");
    expect(screen.getByText("Zaznaczono: 0")).toBeInTheDocument();
  });

  it("bez zaznaczenia: komunikat przy wyborze osób i żadnego żądania", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE, () => ({ invited: 0 }));
    render(<ZaproszeniaKursu idKursu="7" />);
    await screen.findByRole("checkbox", { name: /Marta Kowalska/ });
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));
    expect(await screen.findByText("Wskaż co najmniej jedną osobę.")).toBeInTheDocument();
    expect(zapisy()).toHaveLength(0);
  });

  it("422 z polami: komunikat serwera przy wyborze osób, zaznaczenie zostaje", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE, () =>
      bladApi(422, "validation_failed", "Popraw zaznaczone pola.", {
        errors: { "user_ids.0": ["Nie znaleziono wskazanej osoby."] },
      }),
    );
    render(<ZaproszeniaKursu idKursu="7" />);
    await zaznacz(uzytkownik, /Marta Kowalska/);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));
    expect(await screen.findByText("Nie znaleziono wskazanej osoby.")).toBeInTheDocument();
    expect(screen.getByText("Zaznaczono: 1")).toBeInTheDocument();
  });

  it("422 conditions_not_met: komunikat serwera w powiadomieniu", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE, () =>
      bladApi(422, "conditions_not_met", "Zapraszać można wyłącznie na kursy poza główną ścieżką."),
    );
    render(<ZaproszeniaKursu idKursu="7" />);
    await zaznacz(uzytkownik, /Marta Kowalska/);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));
    expect(await screen.findByText("Nie można zaprosić na ten kurs")).toBeInTheDocument();
    expect(screen.getByText("Zapraszać można wyłącznie na kursy poza główną ścieżką.")).toBeInTheDocument();
  });

  it("403 przy wysyłce: odmowa, zero osób w DOM", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE, () => bladApi(403, "forbidden", "Brak."));
    const { container } = render(<ZaproszeniaKursu idKursu="7" />);
    await zaznacz(uzytkownik, /Marta Kowalska/);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));
    await screen.findByText(/administracji/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("404 przy wysyłce: informacja o braku kursu, formularz zostaje", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE, () => bladApi(404, "not_found", "Nie znaleziono zasobu."));
    render(<ZaproszeniaKursu idKursu="7" />);
    await zaznacz(uzytkownik, /Marta Kowalska/);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));
    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(screen.getByText("Nie znaleziono zasobu.")).toBeInTheDocument();
  });

  it("błąd sieci przy wysyłce: „Spróbuj ponownie” powtarza to samo żądanie, zaznaczenie zostaje", async () => {
    const uzytkownik = userEvent.setup();
    let proby = 0;
    ustawDane(KURS_SPOTKANIE, () => {
      proby += 1;
      return proby === 1 ? new Error("sieć") : { invited: 1 };
    });
    render(<ZaproszeniaKursu idKursu="7" />);
    await zaznacz(uzytkownik, /Marta Kowalska/);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zaproszenia" }));
    expect(await screen.findByText("Nie udało się wysłać zaproszeń")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(screen.getByText("Zaznaczono: 1")).toBeInTheDocument();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(zapisy()).toHaveLength(2));
    expect(zapisy()[1]).toEqual(zapisy()[0]);
    expect(await screen.findByRole("status")).toHaveTextContent("Zaproszono 1 osobę.");
  });

  it("„Wróć do listy” wraca bez żadnego zapisu", async () => {
    const uzytkownik = userEvent.setup();
    ustawDane(KURS_SPOTKANIE);
    render(<ZaproszeniaKursu idKursu="7" />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Wróć do listy" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(zapisy()).toHaveLength(0);
  });
});
