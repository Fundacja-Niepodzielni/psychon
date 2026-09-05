/**
 * Pakiet H10 · typy banku pytań w panelu administracji.
 *
 * Kształt 1:1 z `AdminTestQuestionController::present()` — pytanie niesie pełną
 * listę odpowiedzi wraz z flagą poprawności, bo panel opiekuna widzi klucz
 * (ekran uczestnika dostaje odpowiedzi bez `is_correct` z innej trasy).
 */

export interface TestAnswer {
  id: number;
  body: string;
  is_correct: boolean;
}

export interface TestQuestion {
  id: number;
  body: string;
  sequence_order: number;
  answers: TestAnswer[];
}

/** Odpowiedź w formularzu: `id` ma tylko ta, która już istnieje w bazie. */
export interface AnswerDraft {
  id?: number;
  body: string;
  is_correct: boolean;
}

export interface QuestionDraft {
  body: string;
  answers: AnswerDraft[];
}

/** Minimum wymagane przez `StoreTestQuestionRequest` (`answers.min:2`). */
export const MIN_ANSWERS = 2;

/** Nowe pytanie startuje z dwiema pustymi odpowiedziami i pierwszą poprawną. */
export function emptyDraft(): QuestionDraft {
  return {
    body: "",
    answers: [
      { body: "", is_correct: true },
      { body: "", is_correct: false },
    ],
  };
}

export function draftFrom(question: TestQuestion): QuestionDraft {
  return {
    body: question.body,
    answers: question.answers.map((answer) => ({
      id: answer.id,
      body: answer.body,
      is_correct: answer.is_correct,
    })),
  };
}

/**
 * Walidacja lokalna — ta sama reguła, którą serwer sprawdza w
 * `withValidator()`. Po co dwa razy: bez tego użytkownik traci wpisany
 * formularz na okrążenie sieciowe po komunikat, który znamy przed wysyłką.
 * Serwer i tak zostaje jedynym rozstrzygającym — 422 z API nadpisuje ten wynik.
 */
export function draftError(draft: QuestionDraft): string | null {
  if (draft.body.trim() === "") return "Treść pytania nie może być pusta.";

  if (draft.answers.length < MIN_ANSWERS) {
    return `Pytanie musi mieć co najmniej ${MIN_ANSWERS} odpowiedzi.`;
  }

  if (draft.answers.some((answer) => answer.body.trim() === "")) {
    return "Każda odpowiedź musi mieć treść.";
  }

  const correct = draft.answers.filter((answer) => answer.is_correct).length;
  if (correct !== 1) return "Zaznacz dokładnie jedną poprawną odpowiedź.";

  return null;
}
