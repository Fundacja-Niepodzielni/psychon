/**
 * Dane ekranu „Profil psychologa” uczestnika. Te same żądania co stary komponent
 * `PsychologistProfileForm` (spis: `POMIAR-STAREGO-EKRANU.md`), z tymi samymi polami —
 * żadnych nowych tras (`backend/routes/api/h15.php`):
 *  - `GET  /psychologist-profile`
 *  - `PATCH /psychologist-profile`
 *  - `POST /psychologist-profile/documents` (multipart)
 *  - `POST /psychologist-profile/submit`
 *  - `POST /psychologist-profile/consent/withdraw`
 *
 * Kształt wniosku: `PsychologistProfileResource`
 * (`backend/app/Http/Resources/H15/PsychologistProfileResource.php`). Odczyt i zapis biegną
 * z przeglądarki — ten sam powód co w `nowy-front/pulpit/dane.ts`.
 */
import { api } from "@/lib/api/klient";
import type { ProfileDocumentType, PsychologistProfile } from "@/lib/h15/types";

export type { ProfileDocumentType };

/** Stan wniosku jako napis: serwer zna też `published`, którego typ ze starego ekranu nie ma. */
export type Wniosek = Omit<PsychologistProfile, "status"> & { status: string };

/** Pola tekstowe formularza tak, jak stoją w polach (specjalizacje jako jeden tekst). */
export interface FormularzWniosku {
  specjalizacje: string;
  nurt: string;
  miasto: string;
  opis: string;
}

export const PUSTY_FORMULARZ: FormularzWniosku = { specjalizacje: "", nurt: "", miasto: "", opis: "" };

export function formularzZWniosku(wniosek: Wniosek): FormularzWniosku {
  return {
    specjalizacje: (wniosek.specializations ?? []).join(", "),
    nurt: wniosek.approach ?? "",
    miasto: wniosek.city ?? "",
    opis: wniosek.bio ?? "",
  };
}

/** Ciało `PATCH /psychologist-profile`: lista z tekstu rozdzielonego przecinkami, puste pola jako `null`. */
export function cialoZapisu(formularz: FormularzWniosku) {
  return {
    specializations: formularz.specjalizacje
      .split(",")
      .map((wartosc) => wartosc.trim())
      .filter(Boolean),
    approach: formularz.nurt || null,
    city: formularz.miasto || null,
    bio: formularz.opis || null,
  };
}

export function pobierzWniosek(): Promise<Wniosek> {
  return api<Wniosek>("/psychologist-profile");
}

export function zapiszWniosek(formularz: FormularzWniosku): Promise<Wniosek> {
  return api<Wniosek>("/psychologist-profile", { method: "PATCH", body: cialoZapisu(formularz) });
}

/** Dodaje załącznik i czyta wniosek od nowa — jak stary ekran. */
export async function dodajZalacznik(typ: ProfileDocumentType, plik: File): Promise<Wniosek> {
  const dane = new FormData();
  dane.append("type", typ);
  dane.append("file", plik);
  await api("/psychologist-profile/documents", { method: "POST", body: dane });
  return pobierzWniosek();
}

export function zlozWniosek(zgoda: boolean): Promise<Wniosek> {
  return api<Wniosek>("/psychologist-profile/submit", { method: "POST", body: { publication_consent: zgoda } });
}

export function wycofajZgode(): Promise<Wniosek> {
  return api<Wniosek>("/psychologist-profile/consent/withdraw", { method: "POST" });
}
