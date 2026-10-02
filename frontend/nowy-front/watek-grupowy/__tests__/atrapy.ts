/**
 * Atrapy odpowiedzi zaplecza dla testów ekranu „Wątek grupowy”. Klucze są właściwościami zasobów
 * `GET /threads` i `GET /threads/{id}`; dane wyłącznie demonstracyjne, jak w testach starego ekranu
 * (prowadząca „Anna Prowadząca”, osoby „Kasia Wolna” i „Marta Demo”).
 */
import type { ChatMessage, ChatThread, PaginationMeta } from "../dane";

export const PROWADZACA = { id: 7, first_name: "Anna", last_name: "Prowadząca" };
export const KASIA = { id: 9, first_name: "Kasia", last_name: "Wolna" };

export const WATEK: ChatThread = {
  id: 5,
  type: "group",
  supervisor: PROWADZACA,
  volunteer: null,
  updated_at: "2026-10-01T10:30:00Z",
};

export const WATEK_BEZ_WIADOMOSCI: ChatThread = { ...WATEK, updated_at: null };

/** Wątek indywidualny — ekran zostawia tylko grupowe. */
export const WATEK_INDYWIDUALNY: ChatThread = { id: 6, type: "individual", supervisor: PROWADZACA, volunteer: KASIA, updated_at: null };

export const WIADOMOSC_1: ChatMessage = {
  id: 101,
  thread_id: 5,
  sender: KASIA,
  body: "Cześć grupo!",
  created_at: "2026-10-01T10:00:00Z",
};

export const WIADOMOSC_2: ChatMessage = {
  id: 102,
  thread_id: 5,
  sender: PROWADZACA,
  body: "Dzień dobry.\nSpotykamy się w środę.",
  created_at: "2026-10-01T10:30:00Z",
};

export const WIADOMOSC_BEZ_AUTORA: ChatMessage = { id: 103, thread_id: 5, sender: null, body: "<b>wiadomość</b>", created_at: null };

export function meta(zmiana: Partial<PaginationMeta> = {}): PaginationMeta {
  return { current_page: 1, per_page: 25, total: 2, last_page: 1, ...zmiana };
}
