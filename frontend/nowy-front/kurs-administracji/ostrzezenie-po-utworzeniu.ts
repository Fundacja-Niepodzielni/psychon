/**
 * Zdanie, które przechodzi z listy kursów na ekran świeżo utworzonego kursu:
 * kurs powstał, ale prowadzącego nie udało się do niego przypisać. Trzyma je
 * pamięć karty (`sessionStorage`), osobno dla każdego kursu — przejście na
 * ekran kursu jest zwykłą nawigacją, więc nie niesie stanu ekranu listy.
 * Bez pamięci karty (tryb prywatny, odmowa przeglądarki) zdanie po prostu
 * nie dociera; kurs i tak istnieje i można go uzupełnić na jego ekranie.
 */
export const ZDANIE_BRAKU_PROWADZACEGO =
  "Kurs został utworzony jako szkic, ale nie udało się przypisać do niego prowadzącego. Przypisz go w ustawieniach kursu, w wierszu „Prowadzący”.";

function klucz(idKursu: number | string): string {
  return `kurs-ostrzezenie-po-utworzeniu-${idKursu}`;
}

function pamiec(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function zapamietajOstrzezeniePoUtworzeniu(idKursu: number | string, zdanie: string): void {
  try {
    pamiec()?.setItem(klucz(idKursu), zdanie);
  } catch {
    // Pełna albo zablokowana pamięć: kurs jest utworzony, zdanie nie dotrze.
  }
}

export function odczytajOstrzezeniePoUtworzeniu(idKursu: number | string): string | null {
  try {
    return pamiec()?.getItem(klucz(idKursu)) ?? null;
  } catch {
    return null;
  }
}

export function zapomnijOstrzezeniePoUtworzeniu(idKursu: number | string): void {
  try {
    pamiec()?.removeItem(klucz(idKursu));
  } catch {
    // Nic do zdjęcia.
  }
}
