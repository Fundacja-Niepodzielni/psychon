import type { AttendanceWindow } from "@/lib/courses";
import type { KursUczestnika } from "../kurs-uczestnika/dane";
import { oknoObecnosci } from "../kurs-uczestnika/webinar";
import { jestWebinarem, type KursSciezki } from "./nastepny-krok";

/**
 * Wybór webinaru do karty na pulpicie uczestnika (czysta logika). Karta
 * pokazuje jeden, najbliższy nieukończony webinar ścieżki; kolejność ustala
 * okno obecności według zegara: otwarte (wcześniejszy początek pierwszy) →
 * nadchodzące (wcześniejszy termin pierwszy) → zamknięte z nagraniem (nowszy
 * pierwszy) → zamknięte bez nagrania (nowszy pierwszy).
 */

/** Webinary ze ścieżki, które nie są ukończone — dla nich pulpit czyta szczegóły. */
export function webinaryDoWykonania(kursy: KursSciezki[]): KursSciezki[] {
  return kursy.filter((kurs) => jestWebinarem(kurs) && kurs.status !== "completed");
}

function czas(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const wynik = Date.parse(iso);
  return Number.isNaN(wynik) ? null : wynik;
}

function ukonczony(webinar: KursUczestnika): boolean {
  return webinar.status === "completed" || (typeof webinar.attended_at === "string" && webinar.attended_at !== "");
}

/** Miejsce w kolejności: 0 otwarte, 1 nadchodzące (i okno nieznane), 2 zamknięte z nagraniem, 3 zamknięte bez nagrania. */
function ranga(okno: AttendanceWindow | null, maNagranie: boolean): number {
  if (okno === "open") return 0;
  if (okno === "closed") return maNagranie ? 2 : 3;
  return 1;
}

export function wybierzNajblizszyWebinar(webinary: KursUczestnika[], teraz: number): KursUczestnika | null {
  const kandydaci = webinary
    .filter((webinar) => !ukonczony(webinar))
    .map((webinar) => {
      const okno = oknoObecnosci(
        { serwer: webinar.attendance_window, startsAt: webinar.starts_at, zamyka: webinar.attendance_closes_at },
        teraz,
      );
      return { webinar, ranga: ranga(okno, typeof webinar.recording_lesson_id === "number"), start: czas(webinar.starts_at) };
    });
  if (kandydaci.length === 0) return null;
  kandydaci.sort((a, b) => {
    if (a.ranga !== b.ranga) return a.ranga - b.ranga;
    const odwrotnie = a.ranga >= 2 ? -1 : 1;
    const startA = a.start ?? Number.POSITIVE_INFINITY * odwrotnie;
    const startB = b.start ?? Number.POSITIVE_INFINITY * odwrotnie;
    if (startA !== startB) return startA < startB ? -odwrotnie : odwrotnie;
    return a.webinar.id - b.webinar.id;
  });
  return kandydaci[0].webinar;
}
