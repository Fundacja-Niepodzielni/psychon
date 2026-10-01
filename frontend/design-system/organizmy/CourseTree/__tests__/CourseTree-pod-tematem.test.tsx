import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseTree, type TematCourseTree } from "../CourseTree";

/**
 * Próby dwóch opcjonalnych właściwości drzewa kursu:
 *  1) `podTematem` — treść ekranu pod listą lekcji wskazanego tematu (np.
 *     formularz nowej lekcji), w sekcji tego tematu i tylko w niej;
 *  2) `onPrzedTrybemKolejnosci` — ekran decyduje, czy tryb kolejności wolno
 *     włączyć (np. najpierw pyta o niezapisany formularz); wyłączenie trybu
 *     nie pyta nikogo.
 * Bez tych właściwości drzewo działa jak dotąd.
 */

const TEMATY: TematCourseTree[] = [
  { id: "t1", tytul: "Wprowadzenie", lekcje: [{ id: "l1", tytul: "Powitanie", czasMin: 12 }] },
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
    liczbaZmian: 0,
    pusty: { naglowek: "Brak tematów", tresc: "Dodaj pierwszy temat.", przycisk: { etykieta: "Dodaj temat", onClick: vi.fn() } },
  };
}

function przelacznik() {
  return screen.getByRole("button", { name: "Kolejność" });
}

describe("CourseTree — `podTematem`", () => {
  it("bez właściwości żaden temat nie ma dodatkowej treści", () => {
    const { container } = render(<CourseTree tematy={TEMATY} {...akcje()} />);
    expect(container.querySelector("[data-pod-tematem]")).toBeNull();
  });

  it("treść stoi w sekcji wskazanego tematu, za listą jego lekcji, i w żadnym innym temacie", () => {
    const { container } = render(
      <CourseTree tematy={TEMATY} {...akcje()} podTematem={{ tematId: "t2", tresc: <p>Formularz nowej lekcji</p> }} />,
    );

    const bloki = container.querySelectorAll<HTMLElement>("[data-pod-tematem]");
    expect(bloki).toHaveLength(1);
    expect(bloki[0].getAttribute("data-pod-tematem")).toBe("t2");
    expect(bloki[0].textContent).toBe("Formularz nowej lekcji");
    const sekcja = screen.getByRole("heading", { name: "Praktyka" }).closest("section")!;
    expect(sekcja.contains(bloki[0])).toBe(true);
    const lista = sekcja.querySelector("ol")!;
    expect(lista.compareDocumentPosition(bloki[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("identyfikator spoza tematów: nic się nie pokazuje", () => {
    const { container } = render(
      <CourseTree tematy={TEMATY} {...akcje()} podTematem={{ tematId: "t9", tresc: <p>Formularz</p> }} />,
    );
    expect(container.querySelector("[data-pod-tematem]")).toBeNull();
  });
});

describe("CourseTree — `onPrzedTrybemKolejnosci`", () => {
  it("bez właściwości przełącznik włącza tryb od razu", async () => {
    render(<CourseTree tematy={TEMATY} {...akcje()} />);
    await userEvent.click(przelacznik());
    expect(przelacznik()).toHaveAttribute("aria-pressed", "true");
  });

  it("z właściwością tryb włącza się dopiero, gdy ekran zawoła podaną funkcję", async () => {
    let wlacz: (() => void) | null = null;
    const przed = vi.fn((funkcja: () => void) => {
      wlacz = funkcja;
    });
    render(<CourseTree tematy={TEMATY} {...akcje()} onPrzedTrybemKolejnosci={przed} />);

    await userEvent.click(przelacznik());
    expect(przed).toHaveBeenCalledTimes(1);
    expect(przelacznik()).toHaveAttribute("aria-pressed", "false");

    const { act } = await import("@testing-library/react");
    act(() => wlacz?.());
    expect(przelacznik()).toHaveAttribute("aria-pressed", "true");
  });

  it("wyłączenie trybu nie pyta ekranu", async () => {
    const przed = vi.fn((funkcja: () => void) => funkcja());
    render(<CourseTree tematy={TEMATY} {...akcje()} onPrzedTrybemKolejnosci={przed} />);

    await userEvent.click(przelacznik());
    expect(przelacznik()).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(przelacznik());
    expect(przelacznik()).toHaveAttribute("aria-pressed", "false");
    expect(przed).toHaveBeenCalledTimes(1);
  });
});
