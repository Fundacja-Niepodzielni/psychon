/**
 * Dane wątku grupowego prowadzącego („prowadzący
 * prowadzi wątek grupowy"). Backend jest gotowy od dawna
 * (`backend/routes/api/chat.php`) — ten moduł jest pierwszym klientem
 * wywołującym `GET /threads`, `GET /threads/{thread}` i
 * `POST /threads/{thread}/messages` z panelu prowadzącego.
 *
 * Autoryzacja per-wątek NIE jest rolą (patrz komentarz w pliku tras) — 404,
 * nigdy 403, dla wątku spoza własnej grupy. `GET /threads` samo zwraca tylko
 * wątki widoczne wywołującemu (wg roli z tokena), więc front nie filtruje
 * niczego pod kątem uprawnień — filtruje wyłącznie `type === "group"`, żeby
 * ten konkretny ekran pokazywał wątek grupowy, a nie też wątki indywidualne
 * z wolontariuszkami (inny ekran, poza tą pozycją).
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
