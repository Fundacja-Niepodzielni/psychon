/**
 * Dane pakietu H17 — pytania do prowadzącego.
 *
 * Kontrakt §2 opisuje trzy trasy pakietu (`POST /lessons/{id}/questions`,
 * `GET /instructor/questions`, `POST /instructor/questions/{id}/answer`).
 * `GET /lessons/{id}/questions` jest rozszerzeniem zgłoszonym strażnikowi
 * kontraktu — bez niego kryterium odbioru 3 („odpowiedź widoczna przy lekcji")
 * nie ma nośnika. Stan zgłoszenia: `DEMO/H17.md`.
 */
import { api, apiPaged, type PaginationMeta } from "@/lib/api";

/** Zasób pytającego: osoba odpowiadająca wyłącznie jako imię i nazwisko. */
export interface ParticipantQuestion {
  id: number;
  lesson_id: number;
  question: string;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionAsker {
  id: number;
  first_name: string;
  last_name: string;
}

export interface QuestionLesson {
  id: number;
  title: string;
  course: { id: number; slug: string; title: string };
}

/** Zasób skrzynki prowadzącego: dodatkowo autor pytania i lekcja z kursem. */
export interface InstructorQuestion extends ParticipantQuestion {
  answered_by: number | null;
  user: QuestionAsker;
  lesson: QuestionLesson;
}

export interface InstructorQuestionsPage {
  data: InstructorQuestion[];
  meta?: PaginationMeta;
}

/** Liczba nieodpowiedzianych w całej skrzynce — niezależna od filtra i strony. */
export function unansweredCount(meta: PaginationMeta | undefined): number {
  const value = meta?.extra?.unanswered;
  return typeof value === "number" ? value : 0;
}

export function askQuestion(
  lessonId: number,
  question: string,
): Promise<ParticipantQuestion> {
  return api<ParticipantQuestion>(`/lessons/${lessonId}/questions`, {
    method: "POST",
    body: { question },
  });
}

export async function fetchLessonQuestions(
  lessonId: number,
): Promise<ParticipantQuestion[]> {
  const { data } = await apiPaged<ParticipantQuestion>(
    `/lessons/${lessonId}/questions`,
  );
  return data;
}

export function fetchInstructorQuestions(
  options: { answered?: boolean; page?: number } = {},
): Promise<InstructorQuestionsPage> {
  const params = new URLSearchParams();
  if (options.answered !== undefined) {
    params.set("answered", options.answered ? "true" : "false");
  }
  if (options.page !== undefined) {
    params.set("page", String(options.page));
  }

  const query = params.toString();
  return apiPaged<InstructorQuestion>(
    `/instructor/questions${query ? `?${query}` : ""}`,
  );
}

export function answerQuestion(
  questionId: number,
  answer: string,
): Promise<InstructorQuestion> {
  return api<InstructorQuestion>(`/instructor/questions/${questionId}/answer`, {
    method: "POST",
    body: { answer },
  });
}

/** Data pytania w formacie czytelnym w panelu (PL, bez sekund). */
export function formatQuestionDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
