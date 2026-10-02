import { ApiError } from "@/lib/api/klient";
import type { Profil, ZadanieZapisuProfilu } from "./dane";

/** Stan pól formularza danych osobowych — same napisy, jak w polach tekstowych. */
export interface Formularz {
  first_name: string;
  last_name: string;
  phone: string;
  pesel: string;
  street: string;
  city: string;
  zip: string;
}

export type KluczPola = keyof Formularz;

export const PUSTY_FORMULARZ: Formularz = {
  first_name: "",
  last_name: "",
  phone: "",
  pesel: "",
  street: "",
  city: "",
  zip: "",
};

/** Etykiety widocznych pól (nazwa pola w podsumowaniu błędów jest tą samą etykietą). */
export const ETYKIETY_POL: Record<KluczPola, string> = {
  first_name: "Imię",
  last_name: "Nazwisko",
  phone: "Telefon",
  pesel: "PESEL",
  street: "Ulica i numer",
  city: "Miejscowość",
  zip: "Kod pocztowy",
};

/** Klucz błędu w odpowiedzi 422 → pole formularza (adres jest zagnieżdżony: `address.street`). */
const KLUCZE_BLEDOW: Record<string, KluczPola> = {
  first_name: "first_name",
  last_name: "last_name",
  phone: "phone",
  pesel: "pesel",
  "address.street": "street",
  "address.city": "city",
  "address.zip": "zip",
};

/** Identyfikator pola w dokumencie — cel odnośnika z podsumowania błędów. */
export function idPola(klucz: KluczPola): string {
  return `profil-${klucz.replace("_", "-")}`;
}

export function zProfilu(profil: Profil): Formularz {
  return {
    first_name: profil.first_name ?? "",
    last_name: profil.last_name ?? "",
    phone: profil.phone ?? "",
    pesel: profil.pesel ?? "",
    street: profil.address.street ?? "",
    city: profil.address.city ?? "",
    zip: profil.address.zip ?? "",
  };
}

/** Ciało `PATCH /me`: puste pola jako `null` (imię i nazwisko jadą tak, jak wpisano). */
export function doZadania(formularz: Formularz): ZadanieZapisuProfilu {
  return {
    first_name: formularz.first_name,
    last_name: formularz.last_name,
    phone: formularz.phone || null,
    pesel: formularz.pesel || null,
    address: {
      street: formularz.street || null,
      city: formularz.city || null,
      zip: formularz.zip || null,
    },
  };
}

/** Wynik nieudanego zapisu: zdanie do podsumowania, błędy przy polach, zdania bez pola. */
export interface BladZapisu {
  rodzaj: "pola" | "serwer";
  /** Zdanie w podsumowaniu (przy `pola`: „Popraw zaznaczone pola.”; przy `serwer`: zdanie błędu). */
  komunikat: string;
  pola: Partial<Record<KluczPola, string>>;
  /** Zdania serwera dotyczące kluczy, których formularz nie ma jako pola. */
  inne: string[];
}

export const KOMUNIKAT_POPRAW_POLA = "Popraw zaznaczone pola.";
export const KOMUNIKAT_BLEDU_ZAPISU = "Nie udało się zapisać zmian. Spróbuj ponownie.";

/**
 * Klasyfikacja błędu zapisu — jak na starej stronie: odpowiedź 422 z `errors` pokazuje
 * pierwszy komunikat każdego pola, inny błąd API — zdanie z serwera, każdy inny wyjątek
 * (brak odpowiedzi) — zdanie ogólne.
 */
export function sklasyfikujBladZapisu(wyjatek: unknown): BladZapisu {
  if (wyjatek instanceof ApiError && wyjatek.status === 422 && wyjatek.errors) {
    const pola: Partial<Record<KluczPola, string>> = {};
    const inne: string[] = [];
    for (const [klucz, komunikaty] of Object.entries(wyjatek.errors)) {
      const pole = KLUCZE_BLEDOW[klucz];
      const pierwszy = komunikaty[0];
      if (pierwszy === undefined) continue;
      if (pole === undefined) inne.push(pierwszy);
      else pola[pole] = pierwszy;
    }
    return { rodzaj: "pola", komunikat: KOMUNIKAT_POPRAW_POLA, pola, inne };
  }
  if (wyjatek instanceof ApiError) {
    return { rodzaj: "serwer", komunikat: wyjatek.message, pola: {}, inne: [] };
  }
  return { rodzaj: "serwer", komunikat: KOMUNIKAT_BLEDU_ZAPISU, pola: {}, inne: [] };
}

/** Pola z błędem, w kolejności, w jakiej stoją na ekranie. */
export function polaZBledem(pola: Partial<Record<KluczPola, string>>): KluczPola[] {
  return (Object.keys(ETYKIETY_POL) as KluczPola[]).filter((klucz) => pola[klucz] !== undefined);
}
