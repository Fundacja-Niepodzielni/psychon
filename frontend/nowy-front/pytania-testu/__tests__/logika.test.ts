import { describe, expect, it } from "vitest";
import {
  bledyZSerwera,
  dodajOdpowiedz,
  liczbaOdpowiedzi,
  liczbaPytan,
  moznaUsunacOdpowiedz,
  opisPytania,
  planZamiany,
  pustySzkic,
  skrot,
  szkicZPytania,
  usunOdpowiedz,
  walidujSzkic,
  zaznaczPoprawna,
  zdanieUsuniecia,
  zmieniony,
} from "../logika";
import { pytania } from "./atrapy";

describe("opisy listy", () => {
  it("odmiana: pytania i odpowiedzi po liczbie", () => {
    expect([0, 1, 2, 5, 12, 22].map(liczbaPytan)).toEqual(["0 pytań", "1 pytanie", "2 pytania", "5 pytań", "12 pytań", "22 pytania"]);
    expect([1, 2, 5].map(liczbaOdpowiedzi)).toEqual(["1 odpowiedź", "2 odpowiedzi", "5 odpowiedzi"]);
  });

  it("rodzaj i liczba odpowiedzi w wierszu; krótka treść ucina długie pytanie", () => {
    expect(opisPytania(pytania()[2])).toBe("Wybór jednej odpowiedzi · 3 odpowiedzi");
    const dlugie = "Słowo ".repeat(40);
    expect(skrot(dlugie).length).toBeLessThanOrEqual(120);
    expect(skrot(dlugie).endsWith("…")).toBe(true);
    expect(skrot("  Krótkie\npytanie  ")).toBe("Krótkie pytanie");
  });
});

describe("reguły odpowiedzi — jak w dotychczasowym formularzu", () => {
  it("nowe pytanie: dwie puste odpowiedzi, pierwsza poprawna", () => {
    expect(pustySzkic()).toEqual({ body: "", answers: [{ body: "", is_correct: true }, { body: "", is_correct: false }] });
  });

  it("zaznaczenie poprawnej zostawia dokładnie jedną", () => {
    expect(zaznaczPoprawna(pustySzkic(), 1).answers.map((a) => a.is_correct)).toEqual([false, true]);
  });

  it("przy dwóch odpowiedziach nie da się usunąć kolejnej; usunięcie poprawnej przenosi oznaczenie na pierwszą", () => {
    const dwie = pustySzkic();
    expect(moznaUsunacOdpowiedz(dwie)).toBe(false);
    expect(usunOdpowiedz(dwie, 0)).toBe(dwie);
    const trzy = zaznaczPoprawna(dodajOdpowiedz(dwie), 2);
    expect(moznaUsunacOdpowiedz(trzy)).toBe(true);
    expect(usunOdpowiedz(trzy, 2).answers.map((a) => a.is_correct)).toEqual([true, false]);
  });

  it("szkic z pytania niesie identyfikatory odpowiedzi; zmiana jest wykrywana", () => {
    const szkic = szkicZPytania(pytania()[0]);
    expect(szkic.answers.map((a) => a.id)).toEqual([210, 211]);
    expect(zmieniony(szkic, szkicZPytania(pytania()[0]))).toBe(false);
    expect(zmieniony(zaznaczPoprawna(szkic, 1), szkicZPytania(pytania()[0]))).toBe(true);
  });
});

describe("walidacja przed wysłaniem — te same zdania co dotychczas, przy polach", () => {
  it("pusta treść i puste odpowiedzi", () => {
    expect(walidujSzkic({ body: "  ", answers: [{ body: "", is_correct: true }, { body: "B", is_correct: false }] })).toEqual({
      body: "Treść pytania nie może być pusta.",
      odpowiedzi: { 0: "Każda odpowiedź musi mieć treść." },
    });
  });

  it("za mało odpowiedzi i nie dokładnie jedna poprawna", () => {
    expect(walidujSzkic({ body: "P", answers: [{ body: "A", is_correct: true }] }).answers).toBe("Pytanie musi mieć co najmniej 2 odpowiedzi.");
    expect(walidujSzkic({ body: "P", answers: [{ body: "A", is_correct: true }, { body: "B", is_correct: true }] }).answers).toBe("Zaznacz dokładnie jedną poprawną odpowiedź.");
    expect(walidujSzkic({ body: "P", answers: [{ body: "A", is_correct: false }, { body: "B", is_correct: false }] }).answers).toBe("Zaznacz dokładnie jedną poprawną odpowiedź.");
  });

  it("poprawny szkic nie ma błędów", () => {
    expect(walidujSzkic(szkicZPytania(pytania()[0]))).toEqual({ odpowiedzi: {} });
  });
});

describe("błędy pól z odpowiedzi serwera", () => {
  it("body, answers i answers.N.body / answers.N.is_correct trafiają do swoich pól", () => {
    expect(
      bledyZSerwera({
        body: ["Treść pytania może mieć najwyżej 2000 znaków."],
        answers: ["Zaznacz dokładnie jedną poprawną odpowiedź."],
        "answers.1.body": ["Treść odpowiedzi może mieć najwyżej 1000 znaków."],
        "answers.2.is_correct": ["Zaznacz, czy odpowiedź jest poprawna."],
        sequence_order: ["inne pole"],
      }),
    ).toEqual({
      body: "Treść pytania może mieć najwyżej 2000 znaków.",
      answers: "Zaznacz dokładnie jedną poprawną odpowiedź.",
      odpowiedzi: { 1: "Treść odpowiedzi może mieć najwyżej 1000 znaków.", 2: "Zaznacz, czy odpowiedź jest poprawna." },
    });
  });
});

describe("zdanie usunięcia", () => {
  it("mówi, co zniknie, z odmianą liczby odpowiedzi", () => {
    expect(zdanieUsuniecia(pytania()[2])).toBe(
      "Usuniesz treść pytania i 3 odpowiedzi, w tym odpowiedź poprawną. Tego nie da się cofnąć. Wyniki wcześniejszych podejść zostaną bez zmian.",
    );
  });
});

describe("zamiana sąsiednich pytań — plan zapisu przez wolne miejsce", () => {
  const zLukami = () => pytania().map((pytanie, indeks) => ({ ...pytanie, sequence_order: [3, 7, 12][indeks] }));

  it("„niżej”: najpierw na wolne miejsce za ostatnim, potem sąsiad na zwolnione, potem na miejsce sąsiada", () => {
    const plan = planZamiany(zLukami(), 0, 1);
    expect(plan?.kroki).toEqual([
      { idPytania: 41, pozycja: 13 },
      { idPytania: 42, pozycja: 3 },
      { idPytania: 41, pozycja: 7 },
    ]);
    expect(plan?.po.map((pytanie) => [pytanie.id, pytanie.sequence_order])).toEqual([
      [42, 3],
      [41, 7],
      [43, 12],
    ]);
  });

  it("„wyżej” z końca listy; na brzegu i poza listą — brak planu", () => {
    expect(planZamiany(zLukami(), 2, -1)?.kroki).toEqual([
      { idPytania: 43, pozycja: 13 },
      { idPytania: 42, pozycja: 12 },
      { idPytania: 43, pozycja: 7 },
    ]);
    expect(planZamiany(zLukami(), 0, -1)).toBeNull();
    expect(planZamiany(zLukami(), 2, 1)).toBeNull();
    expect(planZamiany(zLukami(), 5, 1)).toBeNull();
  });

  it("krótka treść z własną długością — do nazw strzałek", () => {
    expect(skrot("Słowo ".repeat(40), 60).length).toBeLessThanOrEqual(60);
  });
});
