/**
 * Pakiet H22 · dokumenty prawne — odczyt publiczny (bez tokenu).
 *
 * Rodzaje zamknięte po stronie backendu w `LegalDocumentVersion::TYPES`
 * (`backend/app/Models/LegalDocumentVersion.php:23`) — TRZY rodzaje
 * (`regulamin`, `polityka`, `klauzula-rodo`, ten ostatni dodany decyzją
 * właściciela D-26 z 18.09.2026: „Klauzula RODO (informacja o
 * przetwarzaniu)"). Front renderuje dokładnie to, co wystawia backend —
 * kolejny rodzaj to zmiana `LegalDocumentVersion::TYPES`, nie tego pliku
 * (ta lista ma się wtedy zmienić razem z backendem).
 *
 * Wywołanie: `GET /legal-documents/{type}/current` — trasa publiczna
 * (`backend/routes/api/h22.php:28`), przepuszczona przez bramkę CI
 * autoryzacji (wzorzec w `config/public_routes.php`); nieznany rodzaj albo
 * brak opublikowanej wersji → 404 (`LegalDocumentController::current`,
 * `backend/app/Http/Controllers/Api/V1/H22/LegalDocumentController.php:22-35`).
 */

import { api } from "@/lib/api";

export const LEGAL_DOCUMENT_TYPES = ["regulamin", "polityka", "klauzula-rodo"] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

/** Etykiety ekranowe — kolejność w `LEGAL_DOCUMENT_TYPES` decyduje o kolejności odnośników w stopce. */
export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  regulamin: "Regulamin",
  polityka: "Polityka prywatności",
  "klauzula-rodo": "Klauzula RODO (informacja o przetwarzaniu)",
};

/** Kształt zgodny z `PublicLegalDocumentResource`
 * (`backend/app/Http/Resources/H22/PublicLegalDocumentResource.php:18-26`). */
export interface LegalDocument {
  type: LegalDocumentType;
  version: string;
  /** Treść dokumentu — dziś zwykły tekst (placeholder w seederze: „Treść do
   * dostarczenia przez Fundację."), nie HTML ani Markdown — akapity dzieli
   * podwójny znak nowej linii. Front nie renderuje tego pola jako HTML. */
  content: string;
  /** ISO 8601 (`toIso8601ZuluString()`), `null` nigdy — zasób publiczny
   * zwraca wyłącznie wersje opublikowane. */
  published_at: string;
}

export function jestZnanymTypemDokumentu(typ: string): typ is LegalDocumentType {
  return (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(typ);
}

/** `GET /legal-documents/{type}/current` — bez tokenu, `api<T>()` sam pomija nagłówek `Authorization`, gdy sesji brak. */
export function fetchLegalDocument(type: LegalDocumentType): Promise<LegalDocument> {
  return api<LegalDocument>(`/legal-documents/${encodeURIComponent(type)}/current`);
}
