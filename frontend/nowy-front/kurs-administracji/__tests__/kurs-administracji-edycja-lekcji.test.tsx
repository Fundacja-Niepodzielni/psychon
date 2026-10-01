import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby edycji lekcji pod jej wierszem na ekranie kursu administracji (A-13):
 *  1) „Edytuj” otwiera formularz „Edycja lekcji” w tym samym elemencie listy,
 *     pod wierszem; fokus idzie na pierwsze pole (tytuł);
 *  2) lekcja ma JEDNĄ drogę edycji: w wierszu nie ma „Zmień nazwę”, a zapis
 *     to jedno `PATCH /admin/lessons/{id}` z pełnym ciałem — to samo żądanie,
 *     które wysyła ekran lekcji `/nowy-front/admin/lekcje/{id}` (próba w obie
 *     strony);
 *  3) zamknięcie („Anuluj”, Escape, porzucenie zmian) oddaje fokus przyciskowi
 *     „Edytuj” tego wiersza;
 *  4) zapis lekcji nie gubi niezapisanych zmian kolejności;
 *  5) adres zapisu lekcji administracji stoi w nowym froncie w jednym pliku.
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
const { LekcjaEdycja } = await import("@/nowy-front/lekcja-edycja/LekcjaEdycja");
const { ApiError } = await import("@/lib/api/klient");

const CIALO_PO_ZMIANIE = { title: "Lekcja B po zmianie", description: null, content: "", duration_seconds: 600 };

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function wiersz(container: HTMLElement, id: number) {
  return container.querySelector<HTMLElement>(`li[data-lekcja='${id}']`)!;
}

function edytuj(tytul: string) {
  return screen.getByRole("button", { name: `Edytuj lekcję „${tytul}”` });
}

async function otworz(container: HTMLElement, id: number, tytul: string) {
  await userEvent.click(edytuj(tytul));
  return within(wiersz(container, id)).findByRole("form", { name: "Edycja lekcji" });
}

async function wpiszTytul(formularz: HTMLElement, tytul: string) {
  const pole = within(formularz).getByLabelText(/^Tytuł lekcji/);
  await userEvent.clear(pole);
  await userEvent.type(pole, tytul);
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("edycja lekcji pod wierszem — otwarcie", () => {
  it("wiersz ma „Edytuj”, nie ma „Zmień nazwę”; formularz staje w tym samym elemencie listy, fokus na tytule", async () => {
    const { container } = await renderEkranu();
    expect(screen.queryByRole("button", { name: "Zmień nazwę" })).toBeNull();
    expect(edytuj("Lekcja B")).toHaveAttribute("aria-expanded", "false");

    const formularz = await otworz(container, 22, "Lekcja B");

    const li = wiersz(container, 22);
    const rozwiniecie = li.querySelector<HTMLElement>("[data-rozwiniecie-lekcji='22']")!;
    expect(li.lastElementChild).toBe(rozwiniecie);
    expect(rozwiniecie.contains(formularz)).toBe(true);
    expect(edytuj("Lekcja B")).toHaveAttribute("aria-expanded", "true");
    expect(edytuj("Lekcja B").getAttribute("aria-controls")).toBe(rozwiniecie.id);
    // Wiersz zostaje widoczny jako nagłówek formularza.
    expect(within(li).getByText("Lekcja B · 10 min")).toBeInTheDocument();

    const tytul = within(formularz).getByLabelText(/^Tytuł lekcji/) as HTMLInputElement;
    expect(tytul.value).toBe("Lekcja B");
    await waitFor(() => expect(document.activeElement).toBe(tytul));
    // Formularz czyta lekcję świeżo z listy lekcji kursu — trasą administracji.
    expect(serwer.wywolania.filter((w) => w.sciezka === "/admin/courses/4/lessons")).toHaveLength(2);
    expect(serwer.sciezkiGrupy("instructor")).toEqual([]);
    expect(serwer.zapisy()).toEqual([]);
  });

  it("naraz otwarty jest jeden formularz; „Edytuj” innej lekcji przenosi go pod jej wiersz", async () => {
    const { container } = await renderEkranu();
    await otworz(container, 22, "Lekcja B");
    await otworz(container, 23, "Lekcja C");

    expect(container.querySelectorAll("[data-rozwiniecie-lekcji]")).toHaveLength(1);
    expect(wiersz(container, 22).querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(edytuj("Lekcja B")).toHaveAttribute("aria-expanded", "false");
  });

  it("błąd odczytu lekcji: komunikat pod wierszem z „Zamknij”, drzewo zostaje", async () => {
    const { container } = await renderEkranu();
    serwer.nadpisz(
      "GET",
      "/admin/courses/4/lessons",
      () => new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }),
    );
    await userEvent.click(edytuj("Lekcja B"));

    const li = wiersz(container, 22);
    expect(await within(li).findByText("Nie udało się wczytać lekcji")).toBeInTheDocument();
    await userEvent.click(within(li).getByRole("button", { name: "Zamknij" }));
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Wprowadzenie" })).toBeInTheDocument();
  });
});

describe("edycja lekcji pod wierszem — jeden zapis", () => {
  it("„Zapisz lekcję” wysyła jedno PATCH /admin/lessons/{id} z pełnym ciałem; tytuł w wierszu się zmienia", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 22, "Lekcja B");
    await wpiszTytul(formularz, "Lekcja B po zmianie");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));

    expect(await within(wiersz(container, 22)).findByText("Lekcja B po zmianie · 10 min")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/lessons/22", metoda: "PATCH", cialo: CIALO_PO_ZMIANIE }]);
    expect(serwer.sciezkiGrupy("instructor")).toEqual([]);
    // Formularz zostaje otwarty, a przycisk wiersza niesie już nowy tytuł.
    expect(edytuj("Lekcja B po zmianie")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
  });

  it("w obie strony: formularz pod wierszem i ekran lekcji wysyłają to samo żądanie zapisu", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 22, "Lekcja B");
    await wpiszTytul(formularz, "Lekcja B po zmianie");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));
    await within(wiersz(container, 22)).findByText("Lekcja B po zmianie · 10 min");
    const zWiersza = serwer.zapisy();
    cleanup();

    serwer = utworzSerwer();
    serwer.nadpisz("GET", "/admin/lessons/22/video-status", () => ({ status: "no_video" }));
    render(<LekcjaEdycja idLekcji={22} idKursu={4} />);
    const pole = await screen.findByLabelText(/^Tytuł lekcji/);
    await userEvent.clear(pole);
    await userEvent.type(pole, "Lekcja B po zmianie");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    await screen.findByText("Lekcja została zapisana.");
    const zEkranuLekcji = serwer.zapisy();

    expect(zWiersza).toEqual([{ sciezka: "/admin/lessons/22", metoda: "PATCH", cialo: CIALO_PO_ZMIANIE }]);
    expect(zEkranuLekcji).toEqual(zWiersza);
  });

  it("odmowa zapisu (422): błąd na polu, wiersz bez zmian, formularz zostaje", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 22, "Lekcja B");
    serwer.nadpisz(
      "PATCH",
      "/admin/lessons/22",
      () =>
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { title: ["Tytuł jest za długi."] },
        }),
    );
    await wpiszTytul(formularz, "Lekcja B po zmianie");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));

    expect((await screen.findAllByText("Tytuł jest za długi.")).length).toBeGreaterThan(0);
    expect(within(wiersz(container, 22)).getByText("Lekcja B · 10 min")).toBeInTheDocument();
    expect(container.querySelector("[data-rozwiniecie-lekcji='22']")).not.toBeNull();
  });

  it("zapis lekcji nie gubi niezapisanej zmiany kolejności: pasek zapisu zostaje, układ idzie potem jednym żądaniem", async () => {
    const { container } = await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” na początek tematu „Praktyka”" }));
    const pasek = screen.getByRole("region", { name: "Niezapisane zmiany" });
    const trescPaska = pasek.textContent;

    const formularz = await otworz(container, 22, "Lekcja B");
    await wpiszTytul(formularz, "Lekcja B po zmianie");
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz lekcję" }));
    await within(wiersz(container, 22)).findByText("Lekcja B po zmianie · 10 min");

    // Lekcja dalej stoi w temacie „Praktyka” (zmiana kolejności żyje), licznik zmian ten sam.
    expect(wiersz(container, 22).closest("section")!.querySelector("h3")!.textContent).toBe("Praktyka");
    expect(screen.getByRole("region", { name: "Niezapisane zmiany" }).textContent).toBe(trescPaska);
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/lessons/22", metoda: "PATCH", cialo: CIALO_PO_ZMIANIE }]);

    await userEvent.click(
      within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }),
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull());
    expect(serwer.zapisy()).toEqual([
      { sciezka: "/admin/lessons/22", metoda: "PATCH", cialo: CIALO_PO_ZMIANIE },
      {
        sciezka: "/admin/courses/4/topics/reorder",
        metoda: "PATCH",
        cialo: { topics: [{ id: 7, lesson_ids: [21] }, { id: 8, lesson_ids: [22, 23] }] },
      },
    ]);
    expect(within(wiersz(container, 22)).getByText("Lekcja B po zmianie · 10 min")).toBeInTheDocument();
  });
});

describe("edycja lekcji pod wierszem — zamknięcie oddaje fokus przyciskowi „Edytuj”", () => {
  it("„Anuluj” bez zmian: formularz znika, fokus na „Edytuj” tego wiersza, nic nie zapisano", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 22, "Lekcja B");
    await userEvent.click(within(formularz).getByRole("button", { name: "Anuluj" }));

    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(edytuj("Lekcja B")));
    expect(edytuj("Lekcja B")).toHaveAttribute("aria-expanded", "false");
    expect(serwer.zapisy()).toEqual([]);
  });

  it("Escape bez zmian: to samo co „Anuluj”", async () => {
    const { container } = await renderEkranu();
    await otworz(container, 23, "Lekcja C");
    await userEvent.keyboard("{Escape}");

    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(edytuj("Lekcja C")));
  });

  it("ponowne „Edytuj” na otwartej lekcji zamyka formularz i zostawia fokus na przycisku", async () => {
    const { container } = await renderEkranu();
    await otworz(container, 22, "Lekcja B");
    await userEvent.click(edytuj("Lekcja B"));

    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(edytuj("Lekcja B")));
  });

  it("„Anuluj” po zmianie pyta o porzucenie; „Wróć do edycji” zostawia formularz, „Porzuć zmiany” zamyka i oddaje fokus", async () => {
    const { container } = await renderEkranu();
    const formularz = await otworz(container, 22, "Lekcja B");
    await wpiszTytul(formularz, "Niezapisany tytuł");
    await userEvent.click(within(formularz).getByRole("button", { name: "Anuluj" }));

    const okno = screen.getByRole("dialog", { name: "Porzucić niezapisane zmiany?" });
    await userEvent.click(within(okno).getByRole("button", { name: "Wróć do edycji" }));
    expect(container.querySelector("[data-rozwiniecie-lekcji='22']")).not.toBeNull();

    await userEvent.click(within(formularz).getByRole("button", { name: "Anuluj" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Porzucić niezapisane zmiany?" })).getByRole("button", {
        name: "Porzuć zmiany",
      }),
    );
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(edytuj("Lekcja B")));
    expect(within(wiersz(container, 22)).getByText("Lekcja B · 10 min")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([]);
  });
});

describe("kurs opublikowany", () => {
  it("nie ma przycisku głównego: zostaje „Cofnij publikację”, żadnego „Opublikuj kurs”", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true } });
    await renderEkranu();

    const glowne = Array.from(document.querySelectorAll("button")).filter((b) =>
      b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
    );
    expect(glowne).toEqual([]);
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Cofnij publikację" })).toHaveLength(1);
  });
});

describe("adres zapisu lekcji administracji", () => {
  function pliki(katalog: string): string[] {
    return readdirSync(katalog).flatMap((nazwa) => {
      const sciezka = join(katalog, nazwa);
      if (statSync(sciezka).isDirectory()) return nazwa === "__tests__" ? [] : pliki(sciezka);
      return /\.tsx?$/.test(nazwa) ? [sciezka] : [];
    });
  }

  it("żądanie PATCH na /admin/lessons/{id} buduje w nowym froncie jeden plik — dane „Edycji lekcji”", () => {
    const korzen = join(process.cwd(), "nowy-front");
    const zAdresem = pliki(korzen)
      .filter((plik) => {
        const kod = readFileSync(plik, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return /`\/admin\/lessons\/\$\{[^}]+\}`\s*,\s*\{\s*method:\s*"PATCH"/.test(kod);
      })
      .map((plik) => plik.slice(korzen.length + 1).replace(/\\/g, "/"));

    expect(zAdresem).toEqual(["lekcja-edycja/dane.ts"]);
    const zapis = readFileSync(join(korzen, "kurs-tematy", "zapis.ts"), "utf8");
    expect(zapis).toMatch(/import \{ zapiszLekcje \} from "@\/nowy-front\/lekcja-edycja\/dane";/);
    expect(zapis.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\/admin\/lessons\//);
  });
});
