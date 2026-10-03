import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { KURS, lekcja, utworzSerwer, type AtrapaSerwera } from "@/nowy-front/kurs-administracji/__tests__/atrapa-serwera";

/**
 * Ekran kursu administracji w roli prowadzącego (`rola="instructor"`). Atrapa
 * stoi na funkcjach `api`/`apiPaged` obu modułów klienta, więc funkcje danych
 * ekranu wykonują się naprawdę, a próba czyta adres, metodę i ciało każdego
 * żądania. Mierzone: tylko trasy `/instructor/…`; „Opublikuj kurs” nieczynny
 * z wyglądu, z powodem; brak prowadzącego kursu, zaproszeń i usunięcia kursu.
 */

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

let serwer: AtrapaSerwera;
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});

const { KursAdministracji } = await import("@/nowy-front/kurs-administracji/KursAdministracji");
const { ApiError } = await import("@/lib/api/klient");

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" rola="instructor" />);
  await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" });
  return wynik;
}

function przyciskiPublikacji(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /Opublikuj kurs/ });
}

beforeEach(() => {
  serwer = utworzSerwer();
  back.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});

describe("ekran kursu prowadzącego — dane i trasy", () => {
  it("czyta wyłącznie trasy prowadzącego i stoi w jednym main", async () => {
    const { container } = await renderEkranu();

    expect(serwer.sciezkiGrupy("admin")).toEqual([]);
    expect(serwer.sciezkiGrupy("instructor")).toEqual(
      expect.arrayContaining(["/instructor/courses/4", "/instructor/courses/4/lessons", "/instructor/courses/4/topics"]),
    );
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("nie pyta o przypisania prowadzących ani stan nagrań; test kursu czyta jednym żądaniem trasy prowadzącego", async () => {
    await renderEkranu();
    // Chwila na dane dodatkowe, które ekran administracji czyta po pierwszym rysowaniu.
    await new Promise((gotowe) => setTimeout(gotowe, 50));

    const sciezki = serwer.wywolania.map((wywolanie) => wywolanie.sciezka);
    expect(sciezki.filter((sciezka) => sciezka.includes("/assignments"))).toEqual([]);
    expect(sciezki.filter((sciezka) => sciezka.includes("/tests"))).toEqual(["/instructor/courses/4/tests"]);
    expect(sciezki.filter((sciezka) => sciezka.includes("/video-status"))).toEqual([]);
  });

  it("test na koniec kursu: wiersz z odnośnikiem do pytań testu w panelu prowadzącego, z numerem kursu dla okruszka", async () => {
    await renderEkranu();
    expect(await screen.findByRole("heading", { level: 3, name: "Test na koniec kursu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Otwórz pytania" })).toHaveAttribute("href", "/prowadzacy/testy/31/pytania?kurs=4");
    expect(serwer.sciezkiGrupy("admin")).toEqual([]);
  });

  it("kurs bez testu: wiersz mówi to słowem, odnośnika nie ma", async () => {
    serwer = utworzSerwer({ test: null });
    await renderEkranu();
    expect(await screen.findByText("Kurs nie ma testu")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Otwórz pytania" })).toBeNull();
  });

  it("odczyt testu odrzucony przez serwer: wiersza testu nie ma, reszta ekranu bez zmian", async () => {
    serwer.nadpisz("GET", "/instructor/courses/4/tests", () => new ApiError({ status: 403, code: "forbidden", message: "" }));
    await renderEkranu();
    await new Promise((gotowe) => setTimeout(gotowe, 50));
    expect(screen.queryByRole("heading", { level: 3, name: "Test na koniec kursu" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeInTheDocument();
  });

  it("okruszki i nagłówek: lista kursów prowadzącego, „Szkic — zapisany”", async () => {
    await renderEkranu();

    const okruszki = screen.getByRole("navigation", { name: /okruszki|ścieżka/i });
    expect(within(okruszki).getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/prowadzacy/kursy");
    expect(screen.getByText("Szkic — zapisany")).toBeInTheDocument();
  });

  it("nowa lekcja w temacie idzie trasą prowadzącego", async () => {
    const uzytkownik = userEvent.setup();
    serwer.nadpisz("POST", "/instructor/courses/4/lessons", (cialo) => ({
      ...lekcja(150, (cialo as { title: string }).title),
      topic_id: (cialo as { topic_id: number }).topic_id,
    }));
    await renderEkranu();

    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj lekcję w temacie Wprowadzenie" }));
    await uzytkownik.type(
      screen.getByRole("textbox", { name: "Tytuł nowej lekcji w temacie Wprowadzenie" }),
      "Nowa lekcja{Enter}",
    );

    await waitFor(() =>
      expect(serwer.zapisy().map((zapis) => `${zapis.metoda} ${zapis.sciezka}`)).toContain(
        "POST /instructor/courses/4/lessons",
      ),
    );
    expect(serwer.sciezkiGrupy("admin")).toEqual([]);
  });
});

describe("ekran kursu prowadzącego — publikacja", () => {
  it("„Opublikuj kurs” jest nieczynny z wyglądu: kłódka, aria-disabled i widoczny powód", async () => {
    await renderEkranu();

    const przyciski = przyciskiPublikacji();
    expect(przyciski.length).toBeGreaterThan(0);
    for (const przycisk of przyciski) {
      expect(przycisk).toHaveAttribute("aria-disabled", "true");
      expect(przycisk.querySelector("svg")).not.toBeNull();
      const powod = document.getElementById(przycisk.getAttribute("aria-describedby") ?? "");
      expect(powod?.textContent).toBe("Kurs publikuje administracja.");
      expect(przycisk.closest("[data-nieczynny]")).not.toBeNull();
    }
    expect(screen.getAllByText("Kurs publikuje administracja.").length).toBe(przyciski.length);
  });

  it("kliknięcie nieczynnego przycisku niczego nie wysyła i nie pokazuje odmowy", async () => {
    const uzytkownik = userEvent.setup();
    await renderEkranu();

    for (const przycisk of przyciskiPublikacji()) await uzytkownik.click(przycisk);

    expect(serwer.zapisy()).toEqual([]);
    expect(screen.queryByText(/Nie udało się opublikować/)).toBeNull();
  });

  it("kurs opublikowany: „Podgląd jako uczestnik” jak w administracji", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true } });
    await renderEkranu();

    expect(screen.getAllByRole("link", { name: "Podgląd jako uczestnik" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Opublikuj kurs/ })).toBeNull();
  });
});

describe("ekran kursu prowadzącego — czego prowadzący nie ma", () => {
  it("brak wierszy „Prowadzący” i „Zaproszenia” w ustawieniach kursu", async () => {
    await renderEkranu();

    const karta = screen.getByRole("region", { name: "Ustawienia kursu" });
    const wiersze = Array.from(karta.querySelectorAll<HTMLButtonElement>("h3 > button[aria-expanded]"));
    expect(wiersze).toHaveLength(1);
    expect(wiersze[0]).toHaveTextContent("Opis i dane kursu");
    expect(screen.queryByRole("button", { name: /^Prowadzący/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Zaproszenia/ })).toBeNull();
    expect(document.querySelector('[data-wiersz="prowadzacy"]')).toBeNull();
    expect(document.querySelector('[data-wiersz="zaproszenia"]')).toBeNull();
  });

  it("brak usunięcia i cofnięcia publikacji kursu — szkic i kurs opublikowany", async () => {
    const { unmount } = await renderEkranu();
    expect(screen.queryByRole("button", { name: "Usuń kurs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usunięcie kursu" })).toBeNull();
    expect(screen.queryByText("Usunięcie kursu")).toBeNull();
    unmount();

    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true } });
    await renderEkranu();
    expect(screen.queryByRole("button", { name: "Usuń kurs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cofnij publikację" })).toBeNull();
    expect(screen.queryByText("Cofnięcie publikacji i usunięcie kursu")).toBeNull();
  });

  it("dane kursu: tylko tytuł i opis, zapis trasą prowadzącego z samymi tymi polami", async () => {
    const uzytkownik = userEvent.setup();
    await renderEkranu();

    await uzytkownik.click(screen.getByRole("button", { name: /Opis i dane kursu/ }));
    expect(screen.getByLabelText(/Tytuł kursu/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Opis kursu/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rodzaj/)).toBeNull();
    expect(screen.queryByLabelText(/Grupa/)).toBeNull();
    expect(screen.queryByLabelText(/Nazwa w adresie strony/)).toBeNull();

    const tytul = screen.getByLabelText(/Tytuł kursu/);
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Nowy tytuł");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz dane kursu" }));

    await waitFor(() => expect(serwer.zapisy()).toHaveLength(1));
    const [zapis] = serwer.zapisy();
    expect(zapis.metoda).toBe("PATCH");
    expect(zapis.sciezka).toBe("/instructor/courses/4");
    expect(Object.keys(zapis.cialo as object).sort()).toEqual(["description", "title"]);
    expect((zapis.cialo as { title: string }).title).toBe("Nowy tytuł");
  });
});

describe("ekran kursu administracji bez roli — bez zmian", () => {
  it("bez właściwości `rola` ekran czyta trasy administracji i ma czynne „Opublikuj kurs”", async () => {
    render(<KursAdministracji idKursu="4" />);
    await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" });

    expect(serwer.sciezkiGrupy("instructor")).toEqual([]);
    for (const przycisk of przyciskiPublikacji()) expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Kurs publikuje administracja.")).toBeNull();
    expect(screen.getByRole("button", { name: "Usunięcie kursu" })).toBeInTheDocument();
    // Dwa wiersze ustawień: panel „Zaproszenia” jest ukryty stałą ekranu
    // (`ZAPROSZENIA_W_USTAWIENIACH`) do czasu zaproszeń na kurs po MVP; administracja
    // nadal widzi „Prowadzący”, którego prowadzący kursu nie ma.
    const karta = screen.getByRole("region", { name: "Ustawienia kursu" });
    const wiersze = Array.from(karta.querySelectorAll<HTMLButtonElement>("h3 > button[aria-expanded]"));
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0]).toHaveTextContent("Opis i dane kursu");
    expect(wiersze[1]).toHaveTextContent("Prowadzący");
    expect(within(karta).queryByText("Zaproszenia")).toBeNull();
  });
});
