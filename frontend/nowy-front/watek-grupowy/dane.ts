/**
 * Dane ekranu „Wątek grupowy” (prowadzący). Te same żądania co stary komponent
 * `InstructorGroupThread` (spis: `../grupa-prowadzacego/POMIAR-STAREGO-EKRANU.md`), z tymi samymi
 * polami — żadnych nowych tras (`backend/routes/api/chat.php`):
 *  - `GET    /threads`                           — wątki widoczne prowadzącemu; ekran zostawia grupowe
 *  - `POST   /threads`                           — założenie własnego wątku grupowego
 *  - `GET    /threads/{id}`                      — wiadomości wątku, po 25 od najstarszej
 *  - `POST   /threads/{id}/messages`             — wysłanie wiadomości
 *  - `POST   /threads/{id}/members/{id osoby}`   — dodanie osoby do składu
 *  - `DELETE /threads/{id}/members/{id osoby}`   — usunięcie osoby ze składu
 *
 * Pierwsza strona wiadomości jest czytana dokładnie tak jak na starym ekranie (bez parametrów);
 * dalsze strony prosi o nie parametr `page` tej samej trasy. Odczyt i zapis biegną z przeglądarki —
 * ten sam powód co w `nowy-front/pulpit/dane.ts`.
 */
import { api, apiPaged, type PaginationMeta } from "@/lib/api/klient";
import type { ChatMessage, ChatThread } from "@/lib/chat";

export type { ChatMessage, ChatThread, PaginationMeta };

/** Limit znaków wiadomości — `StoreMessageRequest` (`max:5000`). */
export const LIMIT_WIADOMOSCI = 5000;

export interface StronaWiadomosci {
  data: ChatMessage[];
  meta?: PaginationMeta;
}

/** Wątki grupowe widoczne prowadzącemu — w praktyce jeden (własna grupa). */
export async function pobierzWatki(): Promise<ChatThread[]> {
  const { data } = await apiPaged<ChatThread>("/threads");
  return data.filter((watek) => watek.type === "group");
}

export function zalozWatek(): Promise<ChatThread> {
  return api<ChatThread>("/threads", { method: "POST" });
}

export function pobierzWiadomosci(idWatku: number, strona = 1): Promise<StronaWiadomosci> {
  return apiPaged<ChatMessage>(strona === 1 ? `/threads/${idWatku}` : `/threads/${idWatku}?page=${strona}`);
}

export function wyslijWiadomosc(idWatku: number, tresc: string): Promise<ChatMessage> {
  return api<ChatMessage>(`/threads/${idWatku}/messages`, { method: "POST", body: { body: tresc } });
}

export function dodajOsobe(idWatku: number, idOsoby: number): Promise<unknown> {
  return api(`/threads/${idWatku}/members/${idOsoby}`, { method: "POST" });
}

export function usunOsobe(idWatku: number, idOsoby: number): Promise<unknown> {
  return api(`/threads/${idWatku}/members/${idOsoby}`, { method: "DELETE" });
}
