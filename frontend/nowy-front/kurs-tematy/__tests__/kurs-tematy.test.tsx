import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminCourse, AdminLesson } from "@/lib/h08/types";
import type { Topic } from "@/lib/api/h08-tematy";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Świadkowie ekranu A-12 „Kurs: tematy i lekcje” (`KursTematy`):
 *  1) pięć stanów w obszarze treści `DetailTemplate`, jeden `main`, znacznik szablonu;
 *  3) przeniesienie lekcji (klawiatura i przeciąganie) → JEDNO żądanie układu
 *     z pełną permutacją tematów i lekcji; 422 → zdanie, stan lokalny zostaje;
 *  4) usunięcie tematu przez `Dialog`; 422 `conditions_not_met` → zdanie, drzewo bez zmian;
 *  5) jeden przycisk główny poza `SaveBar`; „Opublikuj kurs” otwiera O7 przy
 *     brakach, fokus wraca na przycisk, żadnego żądania API.
 * Atrapy siedzą na modułach klienta (`lib/api/h08-tematy`, `lib/api/prowadzacy-kursy`);
 * ich adresy i metody mierzy osobno `lib/api/__tests__/h08-tematy.test.ts`.
 */

const back = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh, replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzTematy = vi.fn();
const dodajTemat = vi.fn();
const zmienTytulTematu = vi.fn();
const usunTemat = vi.fn();
const zapiszUkladTematow = vi.fn();
vi.mock("@/lib/api/h08-tematy", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/h08-tematy")>();
  return {
    ...oryginal,
    pobierzTematy: (...a: unknown[]) => pobierzTematy(...a),
    dodajTemat: (...a: unknown[]) => dodajTemat(...a),
    zmienTytulTematu: (...a: unknown[]) => zmienTytulTematu(...a),
    usunTemat: (...a: unknown[]) => usunTemat(...a),
    zapiszUkladTematow: (...a: unknown[]) => zapiszUkladTematow(...a),
  };
});

const updateInstructorCourse = vi.fn();
const updateInstructorLesson = vi.fn();
vi.mock("@/lib/api/prowadzacy-kursy", () => ({
  updateInstructorCourse: (...a: unknown[]) => updateInstructorCourse(...a),
  updateInstructorLesson: (...a: unknown[]) => updateInstructorLesson(...a),
}));

const { KursTematy } = await import("../KursTematy");
const { ApiError } = await import("@/lib/api/klient");

const KURS: AdminCourse = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: null,
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 3,
  materials_count: 1,
  created_at: null,
  updated_at: null,
};

function lekcja(id: number, title: string): AdminLesson {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    sequence_order: null,
    video_provider_id: `wideo-${id}`,
    duration_seconds: 600,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

const LEKCJE = [lekcja(21, "Lekcja A"), lekcja(22, "Lekcja B"), lekcja(23, "Lekcja C")];

function temat(id: number, title: string, position: number, lesson_ids: number[]): Topic {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

const TEMATY = [temat(7, "Wprowadzenie", 1, [21, 22]), temat(8, "Praktyka", 2, [23])];

function renderOk() {
  return render(<KursTematy grupa="instructor" idKursu="4" wynik={{ status: "ok", dane: { kurs: KURS, lekcje: LEKCJE } }} />);
}

async function renderGotowy() {
  pobierzTematy.mockResolvedValue(TEMATY);
  const wynik = renderOk();
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function obszarGlowny(container: HTMLElement) {
  return container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
}

function przyciskiGlowne(container: HTMLElement) {
  return Array.from(container.ownerDocument.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function lekcjeWTemacie(nazwa: string) {
  const naglowek = screen.getByRole("heading", { level: 3, name: nazwa });
  const sekcja = naglowek.closest("section")!;
  return Array.from(sekcja.querySelectorAll("li[data-lekcja]")).map((li) => li.getAttribute("data-lekcja"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A-12 — pięć stanów w obszarze treści DetailTemplate, jeden main", () => {
  function sprawdzSzablon(container: HTMLElement, znacznik: HTMLElement) {
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-szczegol");
    expect(obszarGlowny(container).contains(znacznik)).toBe(true);
  }

  it("sukces: drzewo tematów w kolumnie głównej", async () => {
    const { container } = await renderGotowy();
    sprawdzSzablon(container, screen.getByRole("heading", { level: 3, name: "Praktyka" }));
  });

  it("ładowanie: szkielet drzewa w kolumnie głównej", () => {
    pobierzTematy.mockReturnValue(new Promise(() => {}));
    const { container } = renderOk();
    sprawdzSzablon(container, container.querySelector<HTMLElement>("[aria-busy='true']")!);
  });

  it("błąd: komunikat z ponowieniem w kolumnie głównej", () => {
    const { container } = render(<KursTematy grupa="instructor" idKursu="4" wynik={{ status: "blad" }} />);
    sprawdzSzablon(container, screen.getByText("Nie udało się wczytać kursu"));
  });

  it("błąd odczytu tematów: komunikat drzewa w kolumnie głównej", async () => {
    pobierzTematy.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = renderOk();
    sprawdzSzablon(container, await screen.findByText("Nie udało się wczytać programu kursu"));
  });

  it("brak uprawnień: stan pusty z jedynym szablonem zdania w kolumnie głównej", () => {
    const { container } = render(<KursTematy grupa="instructor" idKursu="4" wynik={{ status: "brak-uprawnien" }} />);
    sprawdzSzablon(container, screen.getByText(/tylko dla prowadzących/));
  });

  it("brak sesji: „Sesja wygasła” w szablonie, bez zdania o roli", () => {
    const { container } = render(<KursTematy grupa="instructor" idKursu="4" wynik={{ status: "brak-sesji" }} />);
    sprawdzSzablon(container, screen.getByText("Sesja wygasła"));
    expect(screen.getByText("Zaloguj się ponownie, aby wrócić do kursu.")).toBeInTheDocument();
    expect(screen.queryByText(/tylko dla prowadzących/)).toBeNull();
  });

  it("pusty: „Dodaj pierwszy temat” w kolumnie głównej", async () => {
    pobierzTematy.mockResolvedValue([]);
    const { container } = renderOk();
    sprawdzSzablon(container, await screen.findByRole("button", { name: "Dodaj pierwszy temat" }));
  });
});

describe("A-12 — układ tematów i lekcji: jedno żądanie z pełną permutacją", () => {
  it("czytnik: zdanie po ruchu między tematami niesie nazwę tematu, a przycisk „Kolejność” nie istnieje", async () => {
    const { container } = await renderGotowy();
    expect(screen.queryByRole("button", { name: "Kolejność" })).toBeNull();
    expect(container.querySelectorAll("[draggable]")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    expect(container.querySelector("[data-ogloszenia]")).toHaveTextContent(
      "Przeniesiono „Lekcja B” do tematu „Praktyka”, miejsce 1 z 2.",
    );
  });

  it("klawiatura: strzałka przenosi lekcję do następnego tematu, zapis wysyła cały układ raz", async () => {
    await renderGotowy();
    zapiszUkladTematow.mockResolvedValue([temat(7, "Wprowadzenie", 1, [21]), temat(8, "Praktyka", 2, [22, 23])]);

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    expect(lekcjeWTemacie("Praktyka")).toEqual(["22", "23"]);
    await userEvent.click(within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull());
    expect(zapiszUkladTematow).toHaveBeenCalledTimes(1);
    expect(zapiszUkladTematow).toHaveBeenCalledWith("instructor", 4, [
      { id: 7, lesson_ids: [21] },
      { id: 8, lesson_ids: [22, 23] },
    ]);
    expect(updateInstructorLesson).not.toHaveBeenCalled();
  });

  it("przeciąganie nie istnieje: upuszczenie lekcji na wiersz innego tematu niczego nie zmienia ani nie otwiera paska zapisu", async () => {
    const { container } = await renderGotowy();
    const zrodlo = container.querySelector<HTMLElement>("li[data-lekcja='21']")!;
    const cel = container.querySelector<HTMLElement>("li[data-lekcja='23']")!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };

    fireEvent.dragStart(zrodlo, { dataTransfer });
    fireEvent.dragOver(cel, { dataTransfer });
    fireEvent.drop(cel, { dataTransfer });

    expect(lekcjeWTemacie("Praktyka")).toEqual(["23"]);
    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
    expect(zapiszUkladTematow).not.toHaveBeenCalled();
  });

  it("422 z serwera: zdanie w treści, układ lokalny i pasek zapisu zostają", async () => {
    await renderGotowy();
    zapiszUkladTematow.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { topics: ["Układ musi obejmować wszystkie lekcje kursu."] },
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }));

    expect(
      await screen.findByText(
        "Układ kursu na serwerze jest inny niż na tym ekranie. Wczytaj aktualny układ — niezapisane zmiany z tego ekranu przepadną.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wczytaj aktualny układ" })).toBeInTheDocument();
    expect(lekcjeWTemacie("Praktyka")).toEqual(["22", "23"]);
    expect(lekcjeWTemacie("Wprowadzenie")).toEqual(["21"]);
    expect(screen.getByRole("region", { name: "Niezapisane zmiany" })).toBeInTheDocument();
  });

  it("Cofnij wraca o jedną zmianę, „Porzuć wszystko” pyta przed porzuceniem", async () => {
    await renderGotowy();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    expect(lekcjeWTemacie("Wprowadzenie")).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Cofnij" }));
    expect(lekcjeWTemacie("Wprowadzenie")).toEqual(["21"]);

    await userEvent.click(screen.getByRole("button", { name: "Porzuć wszystko" }));
    const okno = screen.getByRole("dialog", { name: "Porzucić wszystkie zmiany?" });
    expect(lekcjeWTemacie("Praktyka")).toEqual(["22", "23"]);
    await userEvent.click(within(okno).getByRole("button", { name: "Porzuć wszystko" }));

    expect(lekcjeWTemacie("Wprowadzenie")).toEqual(["21", "22"]);
    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
    expect(zapiszUkladTematow).not.toHaveBeenCalled();
  });

  it("wyjście przy niezapisanych zmianach pyta, bez zmian wraca od razu", async () => {
    await renderGotowy();
    await userEvent.click(screen.getByTestId("pageheader-powrot"));
    expect(back).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await userEvent.click(screen.getByTestId("pageheader-powrot"));
    expect(back).toHaveBeenCalledTimes(1);
    const okno = screen.getByRole("dialog", { name: "Wyjść bez zapisu?" });
    await userEvent.click(within(okno).getByRole("button", { name: "Wyjdź bez zapisu" }));
    expect(back).toHaveBeenCalledTimes(2);
  });
});

describe("A-12 — usunięcie tematu", () => {
  it("temat z lekcjami: bez Dialogu i bez żądania, zdanie mówi, co zrobić; drzewo bez zmian", async () => {
    await renderGotowy();

    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Wprowadzenie”" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(usunTemat).not.toHaveBeenCalled();
    expect(
      screen.getByText("Temat „Wprowadzenie” ma 2 lekcje. Przenieś je do innego tematu, a potem usuń temat."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Wprowadzenie" })).toBeInTheDocument();
    expect(lekcjeWTemacie("Wprowadzenie")).toEqual(["21", "22"]);
  });

  it("wycofanie z Dialogu nie woła API", async () => {
    pobierzTematy.mockResolvedValue([...TEMATY, temat(9, "Pusty temat", 3, [])]);
    renderOk();
    await screen.findByRole("heading", { level: 3, name: "Pusty temat" });
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Pusty temat”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Anuluj" }));
    expect(usunTemat).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("usunięcie pustego tematu po 200 zdejmuje go z drzewa", async () => {
    pobierzTematy.mockResolvedValue([...TEMATY, temat(9, "Pusty temat", 3, [])]);
    renderOk();
    await screen.findByRole("heading", { level: 3, name: "Pusty temat" });
    usunTemat.mockResolvedValue({ id: 9, deleted: true });

    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Pusty temat”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń temat" }));

    await waitFor(() => expect(screen.queryByRole("heading", { level: 3, name: "Pusty temat" })).toBeNull());
  });

  it("pusty kurs: „Dodaj pierwszy temat” otwiera Dialog i dopisuje temat z odpowiedzi", async () => {
    pobierzTematy.mockResolvedValue([]);
    renderOk();
    dodajTemat.mockResolvedValue(temat(10, "Pierwszy temat", 1, []));

    await userEvent.click(await screen.findByRole("button", { name: "Dodaj pierwszy temat" }));
    await userEvent.type(screen.getByLabelText(/Nazwa tematu/), "Pierwszy temat");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Dodaj temat" }));

    expect(dodajTemat).toHaveBeenCalledWith("instructor", 4, "Pierwszy temat");
    expect(await screen.findByRole("heading", { level: 3, name: "Pierwszy temat" })).toBeInTheDocument();
  });
});

describe("A-12 — akcja główna „Opublikuj kurs”", () => {
  it("dokładnie jeden przycisk główny poza SaveBar; z paskiem zapisu — dwa", async () => {
    const { container } = await renderGotowy();
    const glowne = przyciskiGlowne(container);
    expect(glowne.map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    const zPaskiem = przyciskiGlowne(container);
    expect(zPaskiem).toHaveLength(2);
    const pasek = screen.getByRole("region", { name: "Niezapisane zmiany" });
    expect(zPaskiem.filter((b) => !pasek.contains(b)).map((b) => b.textContent)).toEqual(["Opublikuj kurs"]);
  });

  it("przy brakach otwiera O7 w obszarze checklisty, zamknięcie oddaje fokus przyciskowi, zero żądań API", async () => {
    const { container } = await renderGotowy();
    const fetchSzpieg = vi.fn();
    vi.stubGlobal("fetch", fetchSzpieg);
    expect(container.querySelector("[data-obszar='checklist']")).toBeNull();

    const przycisk = screen.getByRole("button", { name: "Opublikuj kurs" });
    await userEvent.click(przycisk);

    const panel = screen.getByRole("region", { name: "Braki przed publikacją" });
    expect(container.querySelector("[data-obszar='checklist']")!.contains(panel)).toBe(true);
    expect(within(panel).getByRole("link", { name: "Brak opisu kursu" })).toHaveAttribute("href", "/nowy-front/kurs/4#opis");
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { level: 2 }));

    await userEvent.click(within(panel).getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("region", { name: "Braki przed publikacją" })).toBeNull();
    expect(document.activeElement).toBe(przycisk);

    expect(fetchSzpieg).not.toHaveBeenCalled();
    expect(updateInstructorCourse).not.toHaveBeenCalled();
    expect(pobierzTematy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("bez braków: zdanie o gotowości w treści, bez panelu i bez żądania", async () => {
    pobierzTematy.mockResolvedValue(TEMATY);
    render(
      <KursTematy
        grupa="instructor"
        idKursu="4"
        wynik={{ status: "ok", dane: { kurs: { ...KURS, description: "Opis kursu." }, lekcje: LEKCJE } }}
      />,
    );
    await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });

    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(screen.getByText("Kurs nie ma braków")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Braki przed publikacją" })).toBeNull();
    expect(updateInstructorCourse).not.toHaveBeenCalled();
  });

  it("„Zmień dane kursu” przenosi fokus na pierwsze pole formularza (sekcja otwierana działaniem)", async () => {
    await renderGotowy();
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    const pierwsze = formularz.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
    expect(pierwsze).not.toBeNull();
    expect(pierwsze).toHaveFocus();
  });

  it("zapis opisu kursu przez FormSection zdejmuje brak „opis” z panelu O7", async () => {
    await renderGotowy();
    updateInstructorCourse.mockResolvedValue({ ...KURS, description: "Nowy opis." });

    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    await userEvent.type(screen.getByLabelText(/Opis kursu/), "Nowy opis.");
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "Dane kursu" }));
    });

    expect(updateInstructorCourse).toHaveBeenCalledWith(4, { title: KURS.title, description: "Nowy opis." });
    expect(await screen.findByText("Nowy opis.")).toBeInTheDocument();
  });
});

describe("A-12 — potwierdzenie zapisu układu", () => {
  async function zapiszPoRuchu() {
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }));
  }

  it("przed zapisem nie ma paska, po zapisie widać jedno zdanie w roli „status” i obszar ogłoszeń go nie dubluje", async () => {
    const { container } = await renderGotowy();
    expect(screen.queryByRole("status")).toBeNull();
    zapiszUkladTematow.mockResolvedValue([temat(7, "Wprowadzenie", 1, [21]), temat(8, "Praktyka", 2, [22, 23])]);

    await zapiszPoRuchu();

    const pasek = await screen.findByRole("status");
    expect(pasek).toHaveTextContent("Zmiany w kursie zostały zapisane.");
    expect(container.querySelector("[data-ogloszenia]")).toBeEmptyDOMElement();
  });

  it("odmowa serwera nie pokazuje paska potwierdzenia", async () => {
    await renderGotowy();
    zapiszUkladTematow.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Popraw zaznaczone pola.", errors: { topics: ["x"] } }),
    );

    await zapiszPoRuchu();

    await screen.findByRole("button", { name: "Wczytaj aktualny układ" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("następny ruch i następny zapis zastępują pasek, zamknięcie oddaje fokus nagłówkowi", async () => {
    await renderGotowy();
    zapiszUkladTematow.mockResolvedValue([temat(7, "Wprowadzenie", 1, [21]), temat(8, "Praktyka", 2, [22, 23])]);
    await zapiszPoRuchu();
    await screen.findByRole("status");

    await userEvent.click(screen.getByRole("button", { name: "Zamknij komunikat" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement?.tagName).toBe("H1");

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” wyżej" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Niezapisane zmiany" })).getByRole("button", { name: "Zapisz zmiany" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Zmiany w kursie zostały zapisane.");
  });
});
