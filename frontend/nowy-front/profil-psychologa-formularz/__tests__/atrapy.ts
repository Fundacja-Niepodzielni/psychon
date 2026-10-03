/**
 * Atrapy odpowiedzi zaplecza dla testów ekranu „Profil psychologa”. Klucze są właściwościami
 * zasobu `PsychologistProfileResource`; dane wyłącznie demonstracyjne, te same co w teście
 * starej strony (`/panel/profil-psychologa`): specjalizacja „wsparcie w kryzysie”, nurt
 * „poznawczo-behawioralny”, miasto „Kraków”.
 */
import type { Wniosek } from "../dane";

export const DYPLOM = { id: 1, type: "dyplom" as const, uploaded_at: "2026-09-10T08:00:00Z" };
export const ZASWIADCZENIE = { id: 2, type: "niekaralnosc" as const, uploaded_at: "2026-09-11T08:00:00Z" };

/** Osoba, która jeszcze niczego nie zapisała: serwer zwraca pusty `draft` bez dat. */
export const WNIOSEK_PUSTY: Wniosek = {
  eligible: true,
  specializations: null,
  approach: null,
  city: null,
  bio: null,
  publication_consent_granted: false,
  status: "draft",
  return_reason: null,
  documents: [],
  created_at: null,
  updated_at: null,
};

export const WNIOSEK_ROBOCZY: Wniosek = {
  ...WNIOSEK_PUSTY,
  specializations: ["wsparcie w kryzysie"],
  approach: "poznawczo-behawioralny",
  city: "Kraków",
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

/** Roboczy z dyplomem: brakuje już tylko zgody na publikację (jej nie zapisuje się razem z polami). */
export const WNIOSEK_Z_DYPLOMEM: Wniosek = { ...WNIOSEK_ROBOCZY, documents: [DYPLOM] };

export const WNIOSEK_ZLOZONY: Wniosek = { ...WNIOSEK_Z_DYPLOMEM, status: "submitted", publication_consent_granted: true };

export const WNIOSEK_ODESLANY: Wniosek = {
  ...WNIOSEK_Z_DYPLOMEM,
  status: "returned",
  return_reason: "Uzupełnij opis nurtu i dodaj skan dyplomu w lepszej jakości.",
};

export const WNIOSEK_ZATWIERDZONY: Wniosek = { ...WNIOSEK_Z_DYPLOMEM, status: "accepted", publication_consent_granted: true };
export const WNIOSEK_OPUBLIKOWANY: Wniosek = { ...WNIOSEK_Z_DYPLOMEM, status: "published", publication_consent_granted: true };
export const WNIOSEK_WYCOFANY: Wniosek = { ...WNIOSEK_Z_DYPLOMEM, status: "withdrawn" };
export const WNIOSEK_BEZ_DOSTEPU: Wniosek = { ...WNIOSEK_PUSTY, eligible: false };
