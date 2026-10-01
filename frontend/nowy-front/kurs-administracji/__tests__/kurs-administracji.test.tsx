import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { KURS, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby ekranu kursu administracji (A-12 z publikacją A-14 na jednej
 * stronie):
 *  1) kurs, lekcje i tematy czyta trasami `/admin/…`, nigdy `/instructor/…`;
 *  2) każda akcja stoi na ekranie RAZ — jedno „Opublikuj kurs”, jeden przycisk
 *     główny, jedno „Usuń kurs”, jedno „Wyślij zaproszenia”;
 *  3) „Usuń kurs” jest ostatnim blokiem ekranu i wymaga potwierdzenia;
 *  4) zaproszenia: blok pod drzewem tematów, otwierany przyciskiem drugorzędnym;
 *  5) stany: ładowanie, odmowa roli, błąd z ponowieniem — w jednym `main`.
 * Atrapa stoi na funkcjach `api`/`apiPaged` OBU modułów klienta (`@/lib/api`
 * i `@/lib/api/klient`).
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
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

const { KursAdministracji } = await import("../KursAdministracji");
const { ApiError } = await import("@/lib/api/klient");

const KURS_POZA_KOLEJNOSCIA = { ...KURS, type: "webinar" as const, sequence_order: null };

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function przyciski(nazwa: string) {
  return screen.queryAllByRole("button", { name: nazwa });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("ekran kursu administracji — dane wyłącznie z tras administracji", () => {
  it("czyta kurs, lekcje, tematy, przypisania i test trasami /admin, żadnej trasy prowadzącego", async () => {
    const { container } = await renderEkranu();

    expect(serwer.wywolania.map((w) => `${w.metoda} ${w.sciezka}`).sort()).toEqual([
      "GET /admin/courses/4",
      "GET /admin/courses/4/assignments",
      "GET /admin/courses/4/lessons",
      "GET /admin/courses/4/tests",
      "GET /admin/courses/4/topics",
      "GET /instructors?per_page=100",
    ]);
    expect(serwer.sciezkiGrupy("instructor")).toEqual([]);
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-szczegol");
    expect(screen.getByRole("heading", { level: 1, name: KURS.title })).toBeInTheDocument();
  });

  it("ładowanie: szkielet w tym samym szablonie, jeden main", () => {
    serwer.nadpisz("GET", "/admin/courses/4", () => new Promise(() => {}));
    const { container } = render(<KursAdministracji idKursu="4" />);
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Wczytywanie kursu" })).toBeInTheDocument();
  });

  it("odmowa roli (403): zdanie o administracji, bez drzewa i bez akcji kursu", async () => {
    serwer.nadpisz(
      "GET",
      "/admin/courses/4",
      () => new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }),
    );
    const { container } = render(<KursAdministracji idKursu="4" />);

    expect(await screen.findByText("Ta funkcja jest dostępna tylko dla administracji.")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(przyciski("Opublikuj kurs")).toEqual([]);
    expect(screen.queryByText("Usunięcie kursu (1)")).toBeNull();
  });

  it("błąd odczytu lekcji: komunikat zamiast pustego kursu, „Spróbuj ponownie” czyta jeszcze raz", async () => {
    serwer.nadpisz(
      "GET",
      "/admin/courses/4/lessons",
      () => new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }),
    );
    render(<KursAdministracji idKursu="4" />);
    expect(await screen.findByText("Nie udało się wczytać kursu")).toBeInTheDocument();
    expect(przyciski("Opublikuj kurs")).toEqual([]);

    serwer.nadpisz("GET", "/admin/courses/4/lessons", () => []);
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" })).toBeInTheDocument();
    expect(serwer.wywolania.filter((w) => w.sciezka === "/admin/courses/4")).toHaveLength(2);
  });

  it("identyfikator spoza liczb: błąd bez żadnego żądania", async () => {
    render(<KursAdministracji idKursu="abc" />);
    expect(await screen.findByText("Nie udało się wczytać kursu")).toBeInTheDocument();
    expect(serwer.wywolania).toEqual([]);
  });
});

describe("ekran kursu administracji — każda akcja stoi na ekranie raz", () => {
  it("jedno „Opublikuj kurs”, jeden przycisk główny, po jednym „Dodaj temat” i „Zmień dane kursu”", async () => {
    await renderEkranu();

    expect(przyciski("Opublikuj kurs")).toHaveLength(1);
    expect(przyciskiGlowne().map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);
    expect(przyciski("Dodaj temat")).toHaveLength(1);
    expect(przyciski("Zmień dane kursu")).toHaveLength(1);
    expect(przyciski("Cofnij publikację")).toEqual([]);
  });

  it("„Opublikuj kurs” z nagłówka wysyła PATCH z is_published i po sukcesie na ekranie nie zostaje żadne „Opublikuj kurs”", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(await screen.findByText("Opublikowany")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: true } }]);
    expect(przyciski("Opublikuj kurs")).toEqual([]);
    expect(przyciski("Cofnij publikację")).toHaveLength(1);
  });

  it("„Usuń kurs” jest jedno, w ostatnim bloku ekranu, za zwiniętą sekcją", async () => {
    const { container } = await renderEkranu();
    expect(przyciski("Usuń kurs")).toEqual([]);

    const naglowek = screen.getByRole("button", { name: "Usunięcie kursu (1)" });
    const kolumna = container.querySelector<HTMLElement>("[data-obszar='wspierajaca']")!;
    const bloki = Array.from(kolumna.firstElementChild!.children);
    expect(bloki[bloki.length - 1].contains(naglowek)).toBe(true);
    // Kolumna wspierająca stoi w dokumencie po kolumnie głównej, więc ostatni
    // jej blok jest ostatnim blokiem ekranu także w układzie jednej kolumny.
    const glowna = container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
    expect(glowna.compareDocumentPosition(kolumna) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(naglowek);
    expect(przyciski("Usuń kurs")).toHaveLength(1);
    expect(przyciskiGlowne().map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);
  });

  it("usunięcie wymaga potwierdzenia: wycofanie nie wysyła nic, potwierdzenie wysyła DELETE i pokazuje stan „kurs usunięty”", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Usunięcie kursu (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Usuń kurs" }));

    const okno = screen.getByRole("dialog", { name: "Usunąć kurs?" });
    expect(within(okno).getByText(`Kurs „${KURS.title}” zniknie z listy. Postęp uczestników zostaje zachowany.`)).toBeInTheDocument();
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(serwer.zapisy()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Usuń kurs" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Usunąć kurs?" })).getByRole("button", { name: "Usuń kurs" }),
    );

    expect(await screen.findByText("Kurs został usunięty")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "DELETE", cialo: undefined }]);
    expect(screen.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/admin/kursy");
    expect(przyciski("Opublikuj kurs")).toEqual([]);
  });

  it("odmowa usunięcia (422): zdanie serwera w oknie, kurs zostaje na ekranie", async () => {
    await renderEkranu();
    serwer.nadpisz(
      "DELETE",
      "/admin/courses/4",
      () =>
        new ApiError({
          status: 422,
          code: "conditions_not_met",
          message: "Kurs jest warunkiem kolejnych etapów.",
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Usunięcie kursu (1)" }));
    await userEvent.click(screen.getByRole("button", { name: "Usuń kurs" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Usunąć kurs?" })).getByRole("button", { name: "Usuń kurs" }),
    );

    expect(await screen.findByText("Kurs jest warunkiem kolejnych etapów.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: KURS.title })).toBeInTheDocument();
  });
});

describe("ekran kursu administracji — zaproszenia jako blok pod drzewem tematów", () => {
  it("kurs z miejscem w kolejności programu: zdanie zamiast formularza, bez przycisku zaproszeń", async () => {
    const { container } = await renderEkranu();
    const blok = container.querySelector<HTMLElement>("#zaproszenia")!;

    expect(container.querySelector("[data-obszar='glowna']")!.contains(blok)).toBe(true);
    expect(within(blok).getByRole("heading", { level: 2, name: "Zaproszenia na kurs" })).toBeInTheDocument();
    expect(within(blok).getByText("Ten kurs ma miejsce w kolejności programu")).toBeInTheDocument();
    expect(przyciski("Zaproś osoby")).toEqual([]);
    expect(przyciski("Wyślij zaproszenia")).toEqual([]);
    expect(serwer.wywolania.some((w) => w.sciezka.startsWith("/admin/users"))).toBe(false);
  });

  it("kurs poza kolejnością: blok stoi pod drzewem, formularz otwiera przycisk drugorzędny, zamknięcie oddaje mu fokus", async () => {
    serwer = utworzSerwer({ kurs: KURS_POZA_KOLEJNOSCIA });
    const { container } = await renderEkranu();
    const blok = container.querySelector<HTMLElement>("#zaproszenia")!;
    const drzewo = container.querySelector<HTMLElement>("#lekcje")!;
    expect(drzewo.compareDocumentPosition(blok) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(przyciski("Wyślij zaproszenia")).toEqual([]);
    expect(przyciskiGlowne().map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);
    const otworz = within(blok).getByRole("button", { name: "Zaproś osoby" });
    expect(otworz.className).toMatch(/outline/);

    await userEvent.click(otworz);
    expect(await within(blok).findByLabelText("Marta Demo · marta@demo.pl")).toBeInTheDocument();
    expect(przyciski("Wyślij zaproszenia")).toHaveLength(1);
    expect(przyciski("Opublikuj kurs")).toHaveLength(1);

    await userEvent.click(within(blok).getByRole("button", { name: "Zamknij" }));
    expect(przyciski("Wyślij zaproszenia")).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(within(blok).getByRole("button", { name: "Zaproś osoby" })));
  });

  it("wysłanie zaproszenia: jeden POST /admin/courses/{id}/invite z wybranymi osobami", async () => {
    serwer = utworzSerwer({ kurs: KURS_POZA_KOLEJNOSCIA });
    const { container } = await renderEkranu();
    const blok = container.querySelector<HTMLElement>("#zaproszenia")!;

    await userEvent.click(within(blok).getByRole("button", { name: "Zaproś osoby" }));
    await userEvent.click(await within(blok).findByLabelText("Marta Demo · marta@demo.pl"));
    await userEvent.click(within(blok).getByRole("button", { name: "Wyślij zaproszenia" }));

    expect(await screen.findByText("Zaproszono 1 osobę.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([
      { sciezka: "/admin/courses/4/invite", metoda: "POST", cialo: { user_ids: [17] } },
    ]);
  });
});
