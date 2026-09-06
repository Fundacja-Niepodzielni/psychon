/**
 * Rejestr slotów strony kursu (#/panel/kursy/:slug — pakiet H05).
 *
 * Jak dodać swój slot (pakiet HXX):
 * 1. Utwórz plik `hXX-nazwa.tsx` obok tego pliku (wzór: h05-lesson-stub.tsx).
 * 2. Dodaj swój slot jedną linią do importów i jedną do listy poniżej.
 *
 * Dzięki temu H06 / H09 / H17 rozszerzają stronę kursu, nie edytując plików
 * należących do H05 — dokładnie tak, jak rejestr menu w `lib/menu/*`.
 */
import type { ComponentType } from "react";
import type { CourseDetail, LessonSummary } from "@/lib/courses";
import h05LessonStub from "./h05-lesson-stub";
import h06LessonLink from "./h06-lesson-link";
import h17LessonQuestions from "./h17-lesson-questions";

export type CoursePageRegion = "lesson" | "instructor" | "lesson-actions";

export interface CoursePageSlotProps {
  course: CourseDetail;
  /** Obecna dla regionów "lesson" i "lesson-actions". */
  lesson?: LessonSummary;
}

export interface CoursePageSlot {
  /** Identyfikator z prefiksem pakietu, np. "h06-lesson-player". */
  id: string;
  region: CoursePageRegion;
  /** Niższy renderuje się pierwszy. */
  order: number;
  Component: ComponentType<CoursePageSlotProps>;
}

export const coursePageSlots: CoursePageSlot[] = [
  h06LessonLink,
  h05LessonStub,
  h17LessonQuestions,
];

/** Wszystkie sloty regionu, rosnąco wg `order`. Regiony są addytywne. */
export function slotsForRegion(region: CoursePageRegion): CoursePageSlot[] {
  return coursePageSlots
    .filter((slot) => slot.region === region)
    .sort((a, b) => a.order - b.order);
}

/**
 * Region "lesson" ma jednego wykonawcę: renderowany jest slot o najniższym
 * `order`. Zaślepka H05 stoi na `order: 900`, więc H06 zastępuje ją, rejestrując
 * własny slot z niższą wartością — bez edytowania pliku H05.
 */
export function primarySlotForRegion(
  region: CoursePageRegion,
): CoursePageSlot | undefined {
  return slotsForRegion(region)[0];
}
