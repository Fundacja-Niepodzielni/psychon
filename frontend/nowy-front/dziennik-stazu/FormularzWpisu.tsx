"use client";

import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { KOLEJNOSC_FORM, NAZWY_FORM, type FormaDyzuru, type PolaWpisu } from "./dane";

/** Etykiety pól formularza wpisu — jedno miejsce dla ekranu i testów. */
export const ETYKIETY_POL = {
  date: "Data dyżuru",
  hours: "Liczba godzin",
  form: "Forma dyżuru",
  consultations_count: "Liczba konsultacji",
  description: "Opis dyżuru",
} as const;

/** Podpowiedzi pod polami: zakresy, które sprawdza serwer, powiedziane z góry. */
export const PODPOWIEDZI_POL = {
  date: "Nie później niż dziś.",
  hours: "Od 0,5 do 24 godz., co 0,5 godz.",
  consultations_count: "Wpisz 0, jeśli dyżur był bez konsultacji.",
  description: "Nie wpisuj danych osób konsultowanych.",
} as const;

interface WlasciwosciFormularzaWpisu {
  /** Przedrostek identyfikatorów pól — inny dla nowego wpisu i dla poprawki. */
  id: string;
  tytul: string;
  pola: PolaWpisu;
  bledy: Record<string, string[]> | undefined;
  zapisywanie: boolean;
  etykietaZapisz: string;
  etykietaAnuluj: string;
  onZmiana: <K extends keyof PolaWpisu>(klucz: K, wartosc: PolaWpisu[K]) => void;
  onZapisz: () => void;
  onAnuluj: () => void;
}

/**
 * Formularz wpisu na `FormSection`: pięć pól starego ekranu (data, godziny,
 * forma, konsultacje, opis), błędy przy polach z odpowiedzi 422 i
 * podsumowanie błędów z odnośnikami do pól (rysuje je sama sekcja). Zakresów
 * nie sprawdza klient — mówi o nich podpowiedź, a rozstrzyga serwer, tak jak
 * dotąd. W czasie zapisu pola są zablokowane, a przycisk mówi „Zapisywanie…”;
 * ponowne kliknięcie niczego nie wysyła (pilnuje wołający).
 */
export function FormularzWpisu({
  id,
  tytul,
  pola,
  bledy,
  zapisywanie,
  etykietaZapisz,
  etykietaAnuluj,
  onZmiana,
  onZapisz,
  onAnuluj,
}: WlasciwosciFormularzaWpisu) {
  const blad = (pole: keyof PolaWpisu) => bledy?.[pole]?.[0];

  const polaSekcji: PoleFormSection[] = [
    {
      id: `${id}-data`,
      etykieta: ETYKIETY_POL.date,
      rodzaj: "data",
      wymagane: true,
      zablokowany: zapisywanie,
      wartosc: pola.date,
      onZmiana: (wartosc) => onZmiana("date", wartosc),
      podpowiedz: PODPOWIEDZI_POL.date,
      blad: blad("date"),
    },
    {
      id: `${id}-godziny`,
      etykieta: ETYKIETY_POL.hours,
      rodzaj: "liczba",
      wymagane: true,
      zablokowany: zapisywanie,
      wartosc: pola.hours,
      onZmiana: (wartosc) => onZmiana("hours", wartosc),
      podpowiedz: PODPOWIEDZI_POL.hours,
      blad: blad("hours"),
    },
    {
      id: `${id}-forma`,
      etykieta: ETYKIETY_POL.form,
      rodzaj: "wybor",
      wymagane: true,
      zablokowany: zapisywanie,
      wartosc: pola.form,
      opcje: KOLEJNOSC_FORM.map((forma) => ({ wartosc: forma, etykieta: NAZWY_FORM[forma] })),
      onZmiana: (wartosc) => onZmiana("form", wartosc as FormaDyzuru),
      blad: blad("form"),
    },
    {
      id: `${id}-konsultacje`,
      etykieta: ETYKIETY_POL.consultations_count,
      rodzaj: "liczba",
      wymagane: true,
      zablokowany: zapisywanie,
      wartosc: pola.consultations_count,
      onZmiana: (wartosc) => onZmiana("consultations_count", wartosc),
      podpowiedz: PODPOWIEDZI_POL.consultations_count,
      blad: blad("consultations_count"),
    },
    {
      id: `${id}-opis`,
      etykieta: ETYKIETY_POL.description,
      rodzaj: "wieloliniowy",
      zablokowany: zapisywanie,
      wartosc: pola.description,
      onZmiana: (wartosc) => onZmiana("description", wartosc),
      podpowiedz: PODPOWIEDZI_POL.description,
      blad: blad("description"),
    },
  ];

  return (
    <FormSection
      fokusPrzyOtwarciu
      tytul={tytul}
      pola={polaSekcji}
      etykietaZapisz={zapisywanie ? "Zapisywanie…" : etykietaZapisz}
      etykietaAnuluj={etykietaAnuluj}
      onZapisz={onZapisz}
      onAnuluj={onAnuluj}
    />
  );
}
