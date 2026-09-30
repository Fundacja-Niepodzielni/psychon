import type { Wniosek } from "../dane";

/**
 * Atrapa odpowiedzi `GET /admin/profiles/{id}` — klucze dokładnie z
 * `AdminPsychologistProfileResource::toArray` (test kluczy czyta ten plik zaplecza).
 */
export const WNIOSEK: Wniosek = {
  id: 12,
  user: { id: 17, first_name: "Ewa", last_name: "Przykładowa" },
  specializations: ["interwencja kryzysowa", "terapia poznawczo-behawioralna"],
  approach: "poznawczo-behawioralne",
  city: "Gdańsk",
  bio: "Pracuję z osobami dorosłymi.\nDrugi wiersz opisu.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [
    {
      id: 5,
      type: "dyplom",
      uploaded_at: "2026-09-10T08:00:00Z",
      download_url: "http://localhost:8000/api/v1/admin/profiles/12/documents/5?signature=abc",
    },
    {
      id: 6,
      type: "niekaralnosc",
      uploaded_at: "2026-09-11T08:00:00Z",
      download_url: "http://localhost:8000/api/v1/admin/profiles/12/documents/6?signature=def",
    },
  ],
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-11T08:00:00Z",
};

export const WNIOSEK_ZAAKCEPTOWANY: Wniosek = {
  ...WNIOSEK,
  status: "accepted",
  decided_at: "2026-09-12T09:00:00Z",
};

export const WNIOSEK_ODESLANY: Wniosek = {
  ...WNIOSEK,
  status: "returned",
  return_reason: "Uzupełnij opis podejścia.",
  decided_at: "2026-09-12T09:00:00Z",
};
