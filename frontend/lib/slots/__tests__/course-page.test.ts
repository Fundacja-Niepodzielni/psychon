import { describe, expect, it } from "vitest";
import {
  coursePageSlots,
  primarySlotForRegion,
  slotsForRegion,
} from "@/lib/slots/course-page";

/**
 * Rejestr slotów strony kursu. Mierzalna wartość: KTÓRY slot wygrywa region
 * i wg jakiej liczby `order` — bo to ta liczba decyduje, czy uczestniczka
 * zobaczy odtwarzacz H06, czy zaślepkę H05.
 */
describe("slotsForRegion", () => {
  it("zwraca sloty regionu rosnąco wg order", () => {
    const lekcja = slotsForRegion("lesson");

    expect(lekcja.map((s) => s.order)).toEqual([100, 900]);
    expect(lekcja.map((s) => s.id)).toEqual(["h06-lesson-link", "h05-lesson-stub"]);
  });

  it("KONTROLA NEGATYWNA: nie przepuszcza slotów z innych regionów", () => {
    // Filtr, który przepuszcza za dużo, daje ekran z elementem „obecnym”
    // i dlatego zielony w teście obecności — a merytorycznie błędny.
    const akcje = slotsForRegion("lesson-actions");

    expect(akcje.map((s) => s.id)).toEqual(["h17-lesson-questions"]);
    expect(akcje.every((s) => s.region === "lesson-actions")).toBe(true);
  });

  it("region bez zarejestrowanych slotów daje pustą listę", () => {
    expect(slotsForRegion("instructor")).toEqual([]);
  });

  it("KONTROLA NEGATYWNA: nie modyfikuje rejestru globalnego", () => {
    const przed = coursePageSlots.map((s) => s.id);

    slotsForRegion("lesson");

    expect(coursePageSlots.map((s) => s.id)).toEqual(przed);
  });
});

describe("primarySlotForRegion", () => {
  it("wybiera slot o NAJNIŻSZEJ wartości order, nie pierwszy zarejestrowany", () => {
    // Zaślepka H05 stoi na 900 i jest zarejestrowana PO H06 na 100.
    // Gdyby wybór szedł kolejnością rejestracji, wygrałaby zaślepka.
    const glowny = primarySlotForRegion("lesson");

    expect(glowny?.id).toBe("h06-lesson-link");
    expect(glowny?.order).toBe(100);
  });

  it("region bez slotów zwraca undefined, nie rzuca", () => {
    expect(primarySlotForRegion("instructor")).toBeUndefined();
  });
});
