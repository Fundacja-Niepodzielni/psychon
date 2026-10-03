import { odmien } from "@/nowy-front/wspolne/odmiana";
import type { DaneTestu, PodejscieZHistorii, PytanieTestu, WynikPodejscia } from "./dane";

/**
 * Czysta logika ekranu testu końcowego: liczniki podejść, zdania z odmianą
 * liczebników i stan jedynego zielonego przycisku w każdym stanie ekranu.
 * Wszystko z pól odczytu testu i wyniku podejścia — limit podejść i próg
 * zaliczenia pochodzą z zaplecza, ekran ich nie zakłada.
 */

/** Liczba z rzeczownikiem w poprawnej formie: „1 pytanie”, „2 pytania”, „5 pytań”. */
export function zLiczba(liczba: number, jeden: string, kilka: string, wiele: string): string {
  return `${liczba} ${odmien(liczba, jeden, kilka, wiele)}`;
}

/** Ile podejść zostało przed rozpoczęciem testu (nigdy mniej niż 0). */
export function pozostalePodejscia(test: Pick<DaneTestu, "attempts_used" | "attempts_limit">): number {
  return Math.max(0, test.attempts_limit - test.attempts_used);
}

/** Ile podejść zostało po wyniku podejścia — tak samo jak na dotychczasowym ekranie: limit minus numer podejścia. */
export function pozostaloPoWyniku(test: Pick<DaneTestu, "attempts_limit">, wynik: Pick<WynikPodejscia, "attempt_number">): number {
  return Math.max(0, test.attempts_limit - wynik.attempt_number);
}

/** „Zostało Ci 1 podejście”, „Zostały Ci 2 podejścia”, „Zostało Ci 5 podejść” — czasownik zgodny z liczebnikiem. */
export function zostaloPodejsc(liczba: number): string {
  const czasownik = odmien(liczba, "Zostało", "Zostały", "Zostało");
  return `${czasownik} Ci ${zLiczba(liczba, "podejście", "podejścia", "podejść")}`;
}

/** Zdanie dla stanu bez podejść; to samo przy starcie testu i po ostatnim niezaliczonym wyniku. */
export const ZDANIE_BRAKU_PODEJSC = "Skontaktuj się z zespołem programu, żeby zresetować limit podejść.";

/** Zdanie o tym, jak przebiega test (to samo zobowiązanie co na dotychczasowym ekranie). */
export const ZDANIE_PRZEBIEGU =
  "Pytania pokazują się po kolei, bez możliwości cofania. Po ostatniej odpowiedzi test sprawdza się sam.";

export const ZDANIE_PODGLADU_TESTU = "W trybie podglądu odpowiedzi nie są wysyłane.";

/** Stan jedynego zielonego przycisku: napis, czy jest czynny i zdanie obok (zawsze — także dla czynnego). */
export interface PrzyciskGlowny {
  etykieta: string;
  czynny: boolean;
  zdanie: string;
}

/** Zdanie przy przycisku, gdy test jest zaliczony — po wyniku i przy wejściu na zaliczony test. */
export const ZDANIE_ZALICZONEGO = "Test zaliczony.";

/** Przycisk powrotu po zaliczeniu: zaliczony test nie ma „Rozpocznij” ani „Podejdź ponownie”. */
const PRZYCISK_ZALICZONEGO: PrzyciskGlowny = { etykieta: "Wróć do kursu", czynny: true, zdanie: ZDANIE_ZALICZONEGO };

/**
 * Przycisk „Rozpocznij test”: czynny, gdy zostało podejście i test ma pytania.
 * Test już zaliczony (pole `passed` z odczytu testu) nie daje „Rozpocznij” —
 * przycisk prowadzi z powrotem do kursu, a zaplecze i tak odmówiłoby podejścia.
 */
export function przyciskStartu(test: DaneTestu): PrzyciskGlowny {
  if (test.passed) return PRZYCISK_ZALICZONEGO;
  const zostalo = pozostalePodejscia(test);
  if (zostalo === 0) {
    return {
      etykieta: "Rozpocznij test",
      czynny: false,
      zdanie: `Wykorzystano wszystkie podejścia: ${test.attempts_used} z ${test.attempts_limit}. ${ZDANIE_BRAKU_PODEJSC}`,
    };
  }
  if (test.questions.length === 0) {
    return { etykieta: "Rozpocznij test", czynny: false, zdanie: "Ten test nie ma jeszcze pytań." };
  }
  return { etykieta: "Rozpocznij test", czynny: true, zdanie: `${zostaloPodejsc(zostalo)} z ${test.attempts_limit}.` };
}

export interface OpcjePrzyciskuPytania {
  /** Czy bieżące pytanie ma zaznaczoną odpowiedź. */
  odpowiedziane: boolean;
  ostatnie: boolean;
  wysylanie: boolean;
  podglad: boolean;
}

/**
 * Przycisk w trakcie testu: „Następne pytanie” albo na ostatnim pytaniu
 * „Zakończ i sprawdź”. Bez zaznaczonej odpowiedzi jest nieczynny — tak samo jak
 * na dotychczasowym ekranie — a zdanie obok mówi dlaczego.
 */
export function przyciskPytania({ odpowiedziane, ostatnie, wysylanie, podglad }: OpcjePrzyciskuPytania): PrzyciskGlowny {
  if (wysylanie) return { etykieta: "Wysyłanie…", czynny: false, zdanie: "Sprawdzamy Twoje odpowiedzi." };
  if (!ostatnie) {
    return odpowiedziane
      ? { etykieta: "Następne pytanie", czynny: true, zdanie: "Do tego pytania nie wrócisz po przejściu dalej." }
      : { etykieta: "Następne pytanie", czynny: false, zdanie: "Zaznacz odpowiedź, żeby przejść dalej." };
  }
  if (podglad) return { etykieta: "Zakończ i sprawdź", czynny: false, zdanie: ZDANIE_PODGLADU_TESTU };
  return odpowiedziane
    ? { etykieta: "Zakończ i sprawdź", czynny: true, zdanie: "Przed wysłaniem poprosimy Cię o potwierdzenie." }
    : { etykieta: "Zakończ i sprawdź", czynny: false, zdanie: "Zaznacz odpowiedź, żeby zakończyć test." };
}

/** Przycisk po wyniku: zaliczony — powrót do kursu; niezaliczony — kolejne podejście, nieczynne bez podejść. */
export function przyciskWyniku(test: DaneTestu, wynik: WynikPodejscia): PrzyciskGlowny {
  if (wynik.passed) return PRZYCISK_ZALICZONEGO;
  const zostalo = pozostaloPoWyniku(test, wynik);
  if (zostalo === 0) return { etykieta: "Podejdź ponownie", czynny: false, zdanie: `Nie masz już podejść. ${ZDANIE_BRAKU_PODEJSC}` };
  return { etykieta: "Podejdź ponownie", czynny: true, zdanie: `${zostaloPodejsc(zostalo)} z ${test.attempts_limit}.` };
}

/** Zdanie wyniku pod liczbą procent. */
export function zdanieWyniku(test: DaneTestu, wynik: WynikPodejscia): string {
  if (wynik.passed) return "Gratulacje — kolejny etap ścieżki został odblokowany.";
  const zostalo = pozostaloPoWyniku(test, wynik);
  return zostalo === 0
    ? `Test niezaliczony. Nie masz już podejść. ${ZDANIE_BRAKU_PODEJSC}`
    : `Test niezaliczony. ${zostaloPodejsc(zostalo)}.`;
}

/** Liczba pytań z zaznaczoną odpowiedzią (tylko pytania tego testu). */
export function liczbaOdpowiedzi(pytania: PytanieTestu[], odpowiedzi: Record<number, number>): number {
  return pytania.filter((pytanie) => odpowiedzi[pytanie.id] !== undefined).length;
}

/**
 * Treść okna przed wysłaniem. Pominąć pytania się nie da (przejście dalej
 * wymaga zaznaczenia), więc okno nie liczy pytań bez odpowiedzi — mówi tylko,
 * że wysłania nie da się cofnąć.
 */
export const ZDANIE_POTWIERDZENIA = "Po wysłaniu nie zmienisz odpowiedzi.";

/** Wynik do pokazania przy zaliczonym teście: ostatnie zaliczone podejście z historii albo `null`. */
export function zaliczonePodejscie(historia: PodejscieZHistorii[]): PodejscieZHistorii | null {
  for (let indeks = historia.length - 1; indeks >= 0; indeks -= 1) {
    if (historia[indeks].passed) return historia[indeks];
  }
  return null;
}

/** Zdanie stanu „test zamknięty lekcjami”; bez odczytu kursu — zdanie ogólne. */
export function zdanieLekcji(nieukonczone: number | null): string {
  if (nieukonczone === null || nieukonczone <= 0) return "Ukończ wszystkie lekcje kursu, a test się otworzy.";
  const czasownik = odmien(nieukonczone, "Została", "Zostały", "Zostało");
  return `${czasownik} Ci ${zLiczba(nieukonczone, "lekcja", "lekcje", "lekcji")} do ukończenia. Test otworzy się po ostatniej z nich.`;
}

/** Pytania z błędną odpowiedzią w kolejności testu (identyfikatory spoza testu są pomijane). */
export function pytaniaZBledem(pytania: PytanieTestu[], wynik: WynikPodejscia): PytanieTestu[] {
  const bledne = new Set(wynik.wrong_question_ids);
  return pytania.filter((pytanie) => bledne.has(pytanie.id));
}
