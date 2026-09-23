/**
 * H10 — reset limitu podejść do testu.
 */

import { api } from "./klient";

export interface TestAttemptsReset {
  test_id: number;
  user_id: number;
  cleared: number;
  attempts_used: number;
  attempts_limit: number;
}

/**
 * Reset limitu podejść (H10 · POST /admin/tests/{test}/users/{user}/reset-attempts).
 * Powód jest obowiązkowy — serwer go zapisuje w dzienniku audytu i odrzuca
 * żądanie bez niego (422); ekran wysyła je tylko, gdy pole jest wypełnione.
 */
export function resetTestAttempts(
  testId: number,
  userId: number,
  reason: string,
): Promise<TestAttemptsReset> {
  return api<TestAttemptsReset>(
    `/admin/tests/${testId}/users/${userId}/reset-attempts`,
    { method: "POST", body: { reason } },
  );
}
