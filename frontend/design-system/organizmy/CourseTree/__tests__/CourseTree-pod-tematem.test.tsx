import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseTree, type TematCourseTree } from "../CourseTree";

/**
 * Próby opcjonalnej właściwości drzewa kursu:
 *  1) `podTematem` — treść ekranu pod listą lekcji wskazanego tematu (np.
 *     formularz nowej lekcji), w sekcji tego tematu i tylko w niej;
 *  2) świadek: drzewo nie ma już trybu kolejności ani właściwości, która go
 *     bramkowała — zmiana kolejności jest zawsze dostępna strzałkami.
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

describe("CourseTree — brak trybu kolejności", () => {
  it("strzałki są dostępne od razu, bez przełącznika, także przy otwartej treści pod tematem", async () => {
    const wlasciwosci = akcje();
    render(
      <CourseTree
        tematy={TEMATY}
        {...wlasciwosci}
        podTematem={{ tematId: "t2", tresc: <p>Formularz nowej lekcji</p> }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Kolejność" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Powitanie” niżej" }));
    expect(wlasciwosci.onPrzenies).toHaveBeenCalledWith("t1", "l1", "t2", 0);
    expect(screen.getByText("Formularz nowej lekcji")).toBeInTheDocument();
  });
});
