/**
 * H20 — dziennik działań w nowym wyglądzie (`nowy-front/dziennik-dzialan`).
 *
 * `GET /admin/audit` i `GET /admin/audit/export.csv` z filtrami:
 *  - `group` — grupa zdarzeń (`AuditLogMap::GROUPS` w zapleczu),
 *  - `subject_user_id` / `subject_search` — osoba, której wpis dotyczy (konto
 *    albo rzecz tej osoby), po identyfikatorze albo po imieniu i nazwisku,
 *  - `actor_search` — kto wykonał czynność, po imieniu i nazwisku,
 *  - `from` / `to` — zakres po czasie wpisu,
 *  - `page` / `per_page` — strony jak na innych listach administracji.
 * Dotychczasowe funkcje ekranu dziennika (`./h20.ts`) zostają bez zmian.
 */

import { apiPaged, baseUrl, type PaginationMeta } from "./klient";
import { downloadFile } from "./pliki";
import { zapytanie } from "./sciezka";

/** Klucze grup zdarzeń — ten sam słownik co w zapleczu. */
export type GrupaZdarzen = "konta" | "nabor" | "kursy" | "staz" | "superwizja" | "dokumenty" | "inne";

export interface OsobaDziennika {
  /** Konto osoby (odnośnik do karty) albo `null` — osoba ze zgłoszenia rekrutacyjnego bez konta. */
  id: number | null;
  first_name: string;
  last_name: string;
}

export interface WpisDziennika {
  id: number;
  /** Kod zdarzenia z rejestru (do słownika zdań). */
  action: string;
  group: { key: GrupaZdarzen; label: string };
  actor: { id: number; first_name: string; last_name: string } | null;
  /** „Kogo dotyczy”: osoba albo nazwa rzeczy (tytuł kursu…), nigdy typ techniczny i numer. */
  subject: { person: OsobaDziennika | null; label: string | null };
  /** Znacznik czasu UTC. */
  created_at: string;
}

export interface FiltrDziennikaApi {
  group?: GrupaZdarzen;
  subject_user_id?: number;
  subject_search?: string;
  actor_search?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

function parametry(filtr: FiltrDziennikaApi): string {
  return zapytanie({
    group: filtr.group,
    subject_user_id: filtr.subject_user_id,
    subject_search: filtr.subject_search,
    actor_search: filtr.actor_search,
    from: filtr.from,
    to: filtr.to,
    page: filtr.page,
    per_page: filtr.per_page,
  });
}

export function pobierzWpisyDziennika(
  filtr: FiltrDziennikaApi,
): Promise<{ data: WpisDziennika[]; meta?: PaginationMeta }> {
  return apiPaged<WpisDziennika>(`/admin/audit${parametry(filtr)}`);
}

/** Plik z wpisami spełniającymi filtr — wszystkie strony, kolumny ekranu. */
export function pobierzPlikDziennika(filtr: FiltrDziennikaApi): Promise<void> {
  const bezStron = { ...filtr, page: undefined, per_page: undefined };
  return downloadFile(`${baseUrl()}/admin/audit/export.csv${parametry(bezStron)}`, "dziennik-dzialan.csv");
}
