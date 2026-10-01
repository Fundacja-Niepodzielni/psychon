import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseTree, type TematCourseTree } from "../CourseTree";

/**
 * Próby dwóch opcjonalnych właściwości drzewa kursu — `onEdytujLekcje`
 * i `rozwiniecie` (A-13: edycja lekcji pod jej wierszem):
 *  1) bez nich wiersz jest taki jak dotąd: „Zmień nazwę”, żadnego „Edytuj”,
 *     żadnego rozwinięcia;
 *  2) z `onEdytujLekcje`: „Edytuj” zamiast „Zmień nazwę”, nazwa dostępna
 *     z tytułem lekcji, `aria-expanded`, `aria-controls`;
 *  3) `rozwiniecie`: treść w TYM SAMYM elemencie listy, jako ostatnie dziecko
 *     (pod wierszem), kolejność w DOM równa kolejności na ekranie;
 *  4) strzałki kolejności działają także przy rozwiniętej lekcji.
 * Organizm nie zna formularza ani zapisu — próby podają mu zwykły tekst.
 */

const TEMATY: TematCourseTree[] = [
  {
    id: "t1",
    tytul: "Wprowadzenie",
    lekcje: [
      { id: "l1", tytul: "Powitanie", czasMin: 12 },
      { id: "l2", tytul: "Zasady programu", czasMin: 18 },
    ],
  },
  { id: "t2", tytul: "Praktyka", lekcje: [{ id: "l3", tytul: "Pierwsze zadanie", czasMin: 20 }] },
];

function akcje() {
  return {
    onPrzenies: vi.fn(),
    onDodajLekcje: vi.fn(),
    onZmienTytulLekcji: vi.fn(),
    onZapisz: vi.fn(),
    onCofnij: vi.fn(),
    onPorzucWszystko: vi.fn(),
    pusty: { naglowek: "Brak tematów", tresc: "Dodaj pierwszy temat.", przycisk: { etykieta: "Dodaj temat", onClick: vi.fn() } },
  };
}

function wiersz(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(`li[data-lekcja='${id}']`)!;
}

describe("CourseTree bez nowych właściwości", () => {
  it("wiersz ma „Zmień nazwę”, nie ma „Edytuj” ani rozwinięcia, żaden wiersz nie jest przeciągany", () => {
    const { container } = render(<CourseTree {...akcje()} tematy={TEMATY} liczbaZmian={0} />);

    expect(screen.getAllByRole("button", { name: "Zmień nazwę" })).toHaveLength(3);
    expect(container.querySelector("[data-edytuj-lekcje]")).toBeNull();
    expect(container.querySelector("[data-rozwiniecie-lekcji]")).toBeNull();
    expect(container.querySelectorAll("[draggable]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Kolejność" })).toBeNull();
  });

  it("samo `rozwiniecie` bez `onEdytujLekcje` nie odbiera wierszowi „Zmień nazwę”", () => {
    render(<CourseTree {...akcje()} tematy={TEMATY} liczbaZmian={0} rozwiniecie={{ lekcjaId: "l1", tresc: <p>Treść</p> }} />);
    expect(screen.getAllByRole("button", { name: "Zmień nazwę" })).toHaveLength(3);
  });
});

describe("CourseTree z `onEdytujLekcje`", () => {
  it("„Edytuj” zastępuje „Zmień nazwę”: jedna droga edycji lekcji, nazwa dostępna z tytułem lekcji", async () => {
    const onEdytujLekcje = vi.fn();
    const wlasciwosci = akcje();
    render(<CourseTree {...wlasciwosci} tematy={TEMATY} liczbaZmian={0} onEdytujLekcje={onEdytujLekcje} />);

    expect(screen.queryByRole("button", { name: "Zmień nazwę" })).toBeNull();
    const edytuj = screen.getByRole("button", { name: "Edytuj lekcję „Zasady programu”" });
    expect(edytuj).toHaveTextContent("Edytuj");
    expect(edytuj).toHaveAttribute("aria-expanded", "false");
    expect(edytuj).not.toHaveAttribute("aria-controls");

    await userEvent.click(edytuj);
    expect(onEdytujLekcje).toHaveBeenCalledTimes(1);
    expect(onEdytujLekcje).toHaveBeenCalledWith("t1", "l2");
    // Organizm tylko zgłasza kliknięcie: nie otwiera pola tytułu i nie woła zmiany tytułu.
    expect(screen.queryByLabelText("Tytuł lekcji")).toBeNull();
    expect(wlasciwosci.onZmienTytulLekcji).not.toHaveBeenCalled();
  });

  it("rozwinięcie stoi w tym samym elemencie listy, pod wierszem; „Edytuj” wskazuje je przez aria-controls", () => {
    const { container } = render(
      <CourseTree
        {...akcje()}
        tematy={TEMATY}
        liczbaZmian={0}
        onEdytujLekcje={vi.fn()}
        rozwiniecie={{ lekcjaId: "l2", tresc: <p>Formularz lekcji</p> }}
      />,
    );

    const li = wiersz(container, "l2");
    const rozwiniecie = within(li).getByText("Formularz lekcji").parentElement!;
    expect(rozwiniecie.getAttribute("data-rozwiniecie-lekcji")).toBe("l2");
    expect(rozwiniecie.parentElement).toBe(li);
    expect(li.lastElementChild).toBe(rozwiniecie);
    expect(container.querySelectorAll("[data-rozwiniecie-lekcji]")).toHaveLength(1);

    const edytuj = within(li).getByRole("button", { name: "Edytuj lekcję „Zasady programu”" });
    expect(edytuj).toHaveAttribute("aria-expanded", "true");
    expect(edytuj.getAttribute("aria-controls")).toBe(rozwiniecie.id);
    // Kolejność w DOM = kolejność na ekranie: przycisk wiersza przed treścią rozwinięcia.
    expect(edytuj.compareDocumentPosition(rozwiniecie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Następna lekcja stoi w dokumencie dopiero po rozwinięciu.
    expect(rozwiniecie.compareDocumentPosition(wiersz(container, "l3")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(wiersz(container, "l1")).getByRole("button", { name: "Edytuj lekcję „Powitanie”" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("strzałki przeniesienia działają przy rozwiniętej lekcji, a wiersze nie mają uchwytu przeciągania", async () => {
    const wlasciwosci = akcje();
    const { container } = render(
      <CourseTree
        {...wlasciwosci}
        tematy={TEMATY}
        liczbaZmian={0}
        onEdytujLekcje={vi.fn()}
        rozwiniecie={{ lekcjaId: "l2", tresc: <p>Formularz lekcji</p> }}
      />,
    );

    expect(container.querySelectorAll("[draggable]")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Zasady programu” niżej" }));
    expect(wlasciwosci.onPrzenies).toHaveBeenCalledWith("t1", "l2", "t2", 0);
  });

  it("otwarte rozwinięcie i „Edytuj” zostają w DOM po kliknięciu strzałki", async () => {
    const { container } = render(
      <CourseTree
        {...akcje()}
        tematy={TEMATY}
        liczbaZmian={0}
        onEdytujLekcje={vi.fn()}
        rozwiniecie={{ lekcjaId: "l1", tresc: <p>Formularz lekcji</p> }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Powitanie” niżej" }));
    expect(screen.getByText("Formularz lekcji")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-edytuj-lekcje]")).toHaveLength(3);
  });
});

describe("CourseTree — kolejność tylko strzałkami (świadek strukturalny)", () => {
  it("nie ma uchwytu przeciągania, przełącznika „Kolejność” ani znacznika trybu", () => {
    const { container } = render(<CourseTree {...akcje()} tematy={TEMATY} liczbaZmian={0} />);
    expect(container.querySelectorAll("[draggable]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Kolejność" })).toBeNull();
    expect(container.querySelector("[data-tryb-kolejnosci]")).toBeNull();
  });

  it("strzałki stoją w wierszu przed numerem, po dwie na lekcję, z nazwami niosącymi tytuł", () => {
    const { container } = render(<CourseTree {...akcje()} tematy={TEMATY} liczbaZmian={0} />);
    const li = wiersz(container, "l2");
    const wyzej = within(li).getByRole("button", { name: "Przenieś „Zasady programu” wyżej" });
    const nizej = within(li).getByRole("button", { name: "Przenieś „Zasady programu” niżej" });
    expect(container.querySelectorAll("[data-strzalka]")).toHaveLength(6);
    expect(wyzej.compareDocumentPosition(nizej) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(li.firstElementChild!.contains(wyzej)).toBe(true);
    expect(li.firstElementChild!.contains(nizej)).toBe(true);
    expect(li.children[1].textContent).toContain("2");
  });

  it("skrajne strzałki całego drzewa mają aria-disabled i zostają w kolejności fokusu", async () => {
    const wlasciwosci = akcje();
    render(<CourseTree {...wlasciwosci} tematy={TEMATY} liczbaZmian={0} />);
    const pierwsza = screen.getByRole("button", { name: "Przenieś „Powitanie” wyżej" });
    const ostatnia = screen.getByRole("button", { name: "Przenieś „Pierwsze zadanie” niżej" });
    for (const strzalka of [pierwsza, ostatnia]) {
      expect(strzalka).toHaveAttribute("aria-disabled", "true");
      expect(strzalka).not.toBeDisabled();
      strzalka.focus();
      expect(strzalka).toHaveFocus();
      await userEvent.click(strzalka);
    }
    expect(wlasciwosci.onPrzenies).not.toHaveBeenCalled();
  });

  it("strzałka na brzegu tematu przenosi lekcję do sąsiedniego tematu", async () => {
    const wlasciwosci = akcje();
    render(<CourseTree {...wlasciwosci} tematy={TEMATY} liczbaZmian={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Pierwsze zadanie” wyżej" }));
    expect(wlasciwosci.onPrzenies).toHaveBeenCalledWith("t2", "l3", "t1", 2);
  });
});
