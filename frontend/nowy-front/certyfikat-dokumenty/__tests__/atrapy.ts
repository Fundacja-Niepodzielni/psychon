/**
 * Atrapy odpowiedzi zaplecza dla testów ekranów „Certyfikat” i „Dokumenty”. Dane
 * wyłącznie demonstracyjne, te same co w testach starych ekranów (`/panel/certyfikat`,
 * `/panel/dokumenty`): numer dokumentu `NP/PW/2026/003`, godziny `41.5` z `72`.
 */
import type { DocumentAvailableTypes, DocumentDto, ListaDokumentow, WarunkiCertyfikatu } from "../dane";

export const WARUNKI_NIESPELNIONE: WarunkiCertyfikatu = {
  eligible: false,
  conditions: [
    { key: "courses", label: "Wszystkie etapy i testy", done: 1, required: 10, met: false },
    { key: "internship", label: "Godziny stażu", done: "41.5", required: "72", met: false },
    { key: "supervision", label: "Obecności na superwizjach", done: 5, required: 6, met: false },
    { key: "workshop", label: "Warsztat stacjonarny", met: false },
  ],
  passed_tests_count: 2,
};

export const WARUNKI_SPELNIONE: WarunkiCertyfikatu = {
  eligible: true,
  conditions: [
    { key: "courses", label: "Wszystkie etapy i testy", done: 10, required: 10, met: true },
    { key: "internship", label: "Godziny stażu", done: "72", required: "72", met: true },
    { key: "supervision", label: "Obecności na superwizjach", done: 6, required: 6, met: true },
    { key: "workshop", label: "Warsztat stacjonarny", met: true },
  ],
  passed_tests_count: 10,
};

export const DOKUMENT_POROZUMIENIE: DocumentDto = {
  id: 3,
  type: "volunteer_agreement",
  number: "NP/PW/2026/003",
  generated_at: "2026-09-10T08:00:00Z",
  signature_status: "none",
  download_url: "/documents/3/download",
};

export const TYPY_ZASWIADCZENIE_NIEDOSTEPNE: DocumentAvailableTypes = {
  volunteer_agreement: { available: false, reason: "already_generated", document_id: 3 },
  internship_certificate: {
    available: false,
    reason: "conditions_not_met",
    hours_accepted: "41.5",
    hours_required: "72",
  },
};

export const TYPY_ZASWIADCZENIE_DOSTEPNE: DocumentAvailableTypes = {
  volunteer_agreement: { available: false, reason: "already_generated", document_id: 3 },
  internship_certificate: { available: true },
};

export const TYPY_BRAK_PROFILU: DocumentAvailableTypes = {
  volunteer_agreement: { available: false, reason: "profile_incomplete", missing_fields: ["phone", "pesel", "address_street"] },
  internship_certificate: { available: false, reason: "profile_incomplete", missing_fields: ["pesel"] },
};

export const DOKUMENTY_Z_LISTA: ListaDokumentow = {
  documents: [DOKUMENT_POROZUMIENIE],
  availableTypes: TYPY_ZASWIADCZENIE_NIEDOSTEPNE,
};

export const DOKUMENTY_PUSTE: ListaDokumentow = {
  documents: [],
  availableTypes: TYPY_BRAK_PROFILU,
};
