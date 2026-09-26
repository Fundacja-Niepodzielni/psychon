/**
 * Wywołania panelu prowadzącego dla edycji treści własnego kursu —
 * `/instructor/courses/...` (H08 — opis kursu, lekcje, materiały) i
 * `/instructor/tests/...` / `/instructor/courses/{id}/tests` (H10 — test
 * wiedzy). Kto może edytować KTÓRY kurs, rozstrzyga backend (`CoursePolicy`)
 * — moduł nie duplikuje tej reguły, tylko woła trasy i przepuszcza błędy
 * (w tym 403) dalej jako `ApiError`.
 */

import { api } from "./klient";
import type { AdminCourse, AdminLesson, AdminMaterial } from "@/lib/h08/types";

/** Pola treści, które prowadzący może zmienić — bez publikacji i kolejności w ścieżce. */
export interface InstructorCourseContentPayload {
  title?: string;
  description?: string | null;
}

export function fetchInstructorCourse(courseId: number): Promise<AdminCourse> {
  return api<AdminCourse>(`/instructor/courses/${courseId}`);
}

export function updateInstructorCourse(
  courseId: number,
  payload: InstructorCourseContentPayload,
): Promise<AdminCourse> {
  return api<AdminCourse>(`/instructor/courses/${courseId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function fetchInstructorLessons(courseId: number): Promise<AdminLesson[]> {
  return api<AdminLesson[]>(`/instructor/courses/${courseId}/lessons`);
}

export interface InstructorLessonPayload {
  title: string;
  description?: string | null;
  sequence_order?: number | null;
  video_provider_id?: string | null;
  duration_seconds?: number;
}

export function createInstructorLesson(
  courseId: number,
  payload: InstructorLessonPayload,
): Promise<AdminLesson> {
  return api<AdminLesson>(`/instructor/courses/${courseId}/lessons`, {
    method: "POST",
    body: payload,
  });
}

export function updateInstructorLesson(
  lessonId: number,
  payload: Partial<InstructorLessonPayload>,
): Promise<AdminLesson> {
  return api<AdminLesson>(`/instructor/lessons/${lessonId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteInstructorLesson(
  lessonId: number,
): Promise<{ id: number; deleted: boolean }> {
  return api<{ id: number; deleted: boolean }>(`/instructor/lessons/${lessonId}`, {
    method: "DELETE",
  });
}

function materialFormData(file: File, name?: string): FormData {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  return form;
}

export function uploadInstructorMaterialForCourse(
  courseId: number,
  file: File,
  name?: string,
): Promise<AdminMaterial> {
  return api<AdminMaterial>(`/instructor/courses/${courseId}/materials`, {
    method: "POST",
    body: materialFormData(file, name),
  });
}

export function uploadInstructorMaterialForLesson(
  lessonId: number,
  file: File,
  name?: string,
): Promise<AdminMaterial> {
  return api<AdminMaterial>(`/instructor/lessons/${lessonId}/materials`, {
    method: "POST",
    body: materialFormData(file, name),
  });
}

export function deleteInstructorMaterial(
  materialId: number,
): Promise<{ id: number; deleted: boolean }> {
  return api<{ id: number; deleted: boolean }>(`/instructor/materials/${materialId}`, {
    method: "DELETE",
  });
}

/** Test wiedzy kursu widziany przez prowadzącego — bez banku pytań (poza zakresem). */
export interface InstructorTest {
  id: number;
  course_id: number;
  pass_threshold: number | null;
  attempts_limit: number | null;
  question_count: number;
  effective_pass_threshold: number;
  effective_attempts_limit: number;
}

export interface InstructorTestPayload {
  pass_threshold?: number | null;
  attempts_limit?: number | null;
  question_count?: number;
}

export function fetchInstructorTest(courseId: number): Promise<InstructorTest | null> {
  return api<InstructorTest | null>(`/instructor/courses/${courseId}/tests`);
}

export function createInstructorTest(
  courseId: number,
  payload: InstructorTestPayload,
): Promise<InstructorTest> {
  return api<InstructorTest>(`/instructor/courses/${courseId}/tests`, {
    method: "POST",
    body: payload,
  });
}

export function updateInstructorTest(
  testId: number,
  payload: InstructorTestPayload,
): Promise<InstructorTest> {
  return api<InstructorTest>(`/instructor/tests/${testId}`, {
    method: "PATCH",
    body: payload,
  });
}
