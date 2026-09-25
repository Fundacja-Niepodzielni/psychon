/**
 * Dane wątku grupowego prowadzącego („prowadzący
 * prowadzi wątek grupowy, on też zarządza składem"). Ten moduł woła
 * `GET /threads`, `GET /threads/{thread}`, `POST /threads/{thread}/messages`
 * (odczyt/wysyłka — istniejące od dawna) oraz `POST /threads`,
 * `POST /threads/{thread}/members/{user}` i `DELETE` tej samej (założenie
 * wątku i skład — wyłącznie rola `instructor`, i wyłącznie właściciel TEGO
 * wątku dla składu; patrz komentarz w `routes/api/chat.php`).
 *
 * Autoryzacja per-wątek przy ODCZYCIE (wiadomości) NIE jest rolą — 404,
 * nigdy 403, dla wątku spoza własnej grupy. `GET /threads` samo zwraca tylko
 * wątki widoczne wywołującemu (wg roli z tokena), więc front nie filtruje
 * niczego pod kątem uprawnień — filtruje wyłącznie `type === "group"`, żeby
 * ten konkretny ekran pokazywał wątek grupowy, a nie też wątki indywidualne
 * z wolontariuszkami (inny ekran, poza tą pozycją). Założenie wątku i
 * zarządzanie składem WOLNO ROLĄ (`role:instructor`) — nieuprawnione
 * wywołanie dostaje 403, nie 404 (patrz `ThreadMemberController`).
 */
import { api, apiPaged, type PaginationMeta } from "@/lib/api";

export interface ChatPerson {
  id: number;
  first_name: string;
  last_name: string;
}

export interface ChatThread {
  id: number;
  type: "individual" | "group";
  supervisor: ChatPerson | null;
  volunteer: ChatPerson | null;
  updated_at: string | null;
}

export interface ChatMessage {
  id: number;
  thread_id: number;
  sender: ChatPerson | null;
  body: string;
  created_at: string | null;
}

/** Wątki grupowe widoczne prowadzącemu — w praktyce dokładnie jeden (własna grupa). */
export async function fetchInstructorGroupThreads(): Promise<ChatThread[]> {
  const { data } = await apiPaged<ChatThread>("/threads");
  return data.filter((thread) => thread.type === "group");
}

/**
 * Założenie własnego wątku grupowego (`routes/api/chat.php` —
 * `POST /threads`, wyłącznie rola `instructor`). Idempotentne po stronie
 * backendu: 200, gdy wątek już istniał, 201 dla nowego — front w obu
 * przypadkach po prostu odświeża listę.
 */
export function createInstructorGroupThread(): Promise<ChatThread> {
  return api<ChatThread>("/threads", { method: "POST" });
}

/**
 * Dodanie osoby do składu wątku grupowego — wyłącznie prowadzący będący
 * właścicielem tego wątku (`POST /threads/{id}/members/{user}`); inna rola
 * albo inny prowadzący dostaje 403.
 */
export function addThreadMember(threadId: number, userId: number): Promise<void> {
  return api<void>(`/threads/${threadId}/members/${userId}`, { method: "POST" });
}

/**
 * Usunięcie osoby ze składu wątku grupowego — te same reguły dostępu co
 * dodanie (`DELETE /threads/{id}/members/{user}`).
 */
export function removeThreadMember(threadId: number, userId: number): Promise<void> {
  return api<void>(`/threads/${threadId}/members/${userId}`, { method: "DELETE" });
}

/** Wiadomości jednego wątku, stronicowane (kontroler: `routes/api/chat.php:29`). */
export function fetchThreadMessages(
  threadId: number,
): Promise<{ data: ChatMessage[]; meta?: PaginationMeta }> {
  return apiPaged<ChatMessage>(`/threads/${threadId}`);
}

/** Wysłanie wiadomości do wątku (`routes/api/chat.php:30`). */
export function sendThreadMessage(
  threadId: number,
  body: string,
): Promise<ChatMessage> {
  return api<ChatMessage>(`/threads/${threadId}/messages`, {
    method: "POST",
    body: { body },
  });
}

export function formatThreadDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
