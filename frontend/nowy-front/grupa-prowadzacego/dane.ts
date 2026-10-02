/**
 * Dane ekranu „Moja grupa” (prowadzący). Te same żądania co stary komponent `InstructorGroup`
 * (spis: `POMIAR-STAREGO-EKRANU.md`), z tymi samymi polami — żadnych nowych tras
 * (`backend/routes/api/h12.php`):
 *  - `GET   /instructor/group`                  — osoby grupy z postępem i terminy z zapisami
 *  - `GET   /instructor/reliability`            — rzetelność nauki osób grupy (sekcja niezależna)
 *  - `POST  /instructor/slots`                  — nowy termin superwizji
 *  - `PATCH /instructor/slots/{id}/attendance`  — obecności osób zapisanych na termin
 *  - `POST  /instructor/cases`                  — sprawa zgłaszana administracji
 *
 * O osobie ekran pokazuje wyłącznie imię, nazwisko i postęp w nauce. Odczyt i zapis biegną
 * z przeglądarki — ten sam powód co w `nowy-front/pulpit/dane.ts`.
 */
import { api, apiPaged } from "@/lib/api/klient";
import type { Attendance, GroupMember, InstructorGroup, InstructorSlot } from "@/lib/h12/types";

export type { Attendance, GroupMember, InstructorGroup, InstructorSlot };

/** Osoba z sekcji rzetelności (`GET /instructor/reliability`): bez adresu e-mail i szczegółów lekcji. */
export interface OsobaRzetelnosci {
  id: number;
  first_name: string;
  last_name: string;
  reliability_percent: string | null;
  below_threshold: boolean;
}

/** Pola formularza terminu tak, jak stoją w polach. */
export interface FormularzTerminu {
  /** Wartość pola daty i godziny przeglądarki (`RRRR-MM-DDTGG:MM`, czas lokalny). */
  start: string;
  czas: string;
  miejsca: string;
  miejsce: string;
}

export const DOMYSLNY_TERMIN: FormularzTerminu = { start: "", czas: "90", miejsca: "3", miejsce: "" };

export interface FormularzSprawy {
  /** Identyfikator osoby jako tekst z listy; pusty to sprawa ogólna. */
  osoba: string;
  temat: string;
  opis: string;
}

export const PUSTA_SPRAWA: FormularzSprawy = { osoba: "", temat: "", opis: "" };

/** Limity z żądań serwera: temat 255 znaków, opis 5000 znaków. */
export const LIMIT_TEMATU = 255;
export const LIMIT_OPISU = 5000;

export function pobierzGrupe(): Promise<InstructorGroup> {
  return api<InstructorGroup>("/instructor/group");
}

export async function pobierzRzetelnosc(): Promise<OsobaRzetelnosci[]> {
  const odpowiedz = await apiPaged<OsobaRzetelnosci>("/instructor/reliability");
  return odpowiedz.data;
}

/** Czas z pola daty i godziny (lokalny) jako ISO UTC — tak jak na starym ekranie. */
export function startJakoIso(start: string): string {
  return new Date(start).toISOString();
}

export function utworzTermin(formularz: FormularzTerminu): Promise<InstructorSlot> {
  return api<InstructorSlot>("/instructor/slots", {
    method: "POST",
    body: {
      starts_at: startJakoIso(formularz.start),
      duration_minutes: Number(formularz.czas),
      seats_limit: Number(formularz.miejsca),
      location_or_link: formularz.miejsce || null,
    },
  });
}

/** `wartosci`: identyfikator osoby → obecność; tylko osoby, które mają wartość. */
export function zapiszObecnosci(idTerminu: number, wartosci: Record<string, Attendance>): Promise<InstructorSlot> {
  return api<InstructorSlot>(`/instructor/slots/${idTerminu}/attendance`, {
    method: "PATCH",
    body: { attendance: wartosci },
  });
}

export function zglosSprawe(formularz: FormularzSprawy): Promise<unknown> {
  return api("/instructor/cases", {
    method: "POST",
    body: {
      subject: formularz.temat,
      body: formularz.opis,
      volunteer_id: formularz.osoba ? Number(formularz.osoba) : null,
    },
  });
}
