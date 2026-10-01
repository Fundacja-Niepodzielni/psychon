import { ApiError } from "@/lib/api/klient";
import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import type { KursProwadzacego } from "./dane";

/**
 * Logika ekranu „Moje kursy” bez Reacta: klasyfikacja błędu odczytu i wiersze
 * listy. Strona kursu prowadzącego to istniejąca trasa produktu
 * `app/(prowadzacy)/prowadzacy/kursy/[id]/page.tsx`.
 */

/** Adres strony kursu prowadzącego. */
export function adresKursu(id: number): string {
  return `/prowadzacy/kursy/${id}`;
}

/** 401 albo 403 `forbidden` — inna rola niż prowadzący; wszystko inne to błąd odczytu. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || (blad.status === 403 && blad.code === "forbidden"));
}

/** Komunikat z koperty błędu serwera (`error.message`); `undefined`, gdy koperty nie ma (np. brak połączenia). */
export function komunikatKoperty(blad: unknown): string | undefined {
  return blad instanceof ApiError && blad.message.trim() !== "" ? blad.message : undefined;
}

export function opisPozycji(pozycja: number | null): string {
  return pozycja === null ? "Poza kolejnością programu" : `Kurs ${pozycja} w programie`;
}

/** Wiersze `RecordList`: tytuł kursu, pozycja w programie, akcja „Otwórz” jako odnośnik (nazwa dla czytnika: „Otwórz kurs: …”). */
export function wierszeKursow(kursy: KursProwadzacego[]): WierszRecordList[] {
  return kursy.map((kurs) => ({
    id: String(kurs.id),
    tytul: kurs.title,
    podpowiedz: opisPozycji(kurs.sequence_order),
    akcja: { etykieta: "Otwórz", etykietaDostepna: `Otwórz kurs: ${kurs.title}`, href: adresKursu(kurs.id) },
  }));
}
