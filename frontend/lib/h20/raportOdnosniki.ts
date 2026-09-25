import type { ReportsPersonRow } from "@/lib/api/raport";

/**
 * Odnośnik od liczby na raporcie do listy osób (`/admin/uczestniczki`) z
 * filtrem, który *dokładnie* tę liczbę daje. `pasuje` i `query` opisują
 * ten sam warunek dwoma sposobami celowo: `pasuje` liczy wartość kafelka
 * z tej samej listy `people`, którą ekran już ma (bez drugiego zapytania),
 * `query` trafia do adresu linku — próba renderuje link i osobno filtruje
 * `people` przez `pasuje`, żeby sprawdzić, że oba dają tę samą liczbę
 * i że adres docelowy rzeczywiście niesie ten filtr (nie samo istnienie
 * odnośnika).
 */
export interface OdnosnikLiczby {
  etykieta: string;
  query: Record<string, string>;
  pasuje: (osoba: ReportsPersonRow) => boolean;
}

export const CEL_LISTY_OSOB = "/admin/uczestniczki";

export type KluczLiczby = "admitted" | "active" | "completed" | "certificates_issued" | "tests_passed";

/**
 * Cztery kafelki liczone z tej samej listy `people`, którą raport już
 * pokazuje — stąd każdy ma bezpieczny, sprawdzalny filtr. `hours_accepted_total`
 * i `consultations_total` NIE mają tu wpisu: to sumy, nie liczba osób —
 * żaden filtr listy osób nie odda sumy godzin jako własnej długości, więc
 * link do listy nie byłby „drogą do źródła" tej liczby, tylko pozorem.
 */
export const ODNOSNIKI_LICZB: Record<KluczLiczby, OdnosnikLiczby> = {
  admitted: {
    etykieta: "Wszystkie osoby przyjęte",
    query: {},
    pasuje: () => true,
  },
  active: {
    etykieta: "Osoby aktywne",
    query: { status: "active" },
    pasuje: (osoba) => osoba.status === "active",
  },
  completed: {
    etykieta: "Programy ukończone",
    query: { etap: "ukonczony" },
    pasuje: (osoba) => osoba.stage === "gotowa" || osoba.stage === "certyfikat",
  },
  certificates_issued: {
    etykieta: "Certyfikaty wydane",
    query: { certyfikat: "1" },
    pasuje: (osoba) => osoba.certificate_issued,
  },
  tests_passed: {
    etykieta: "Osoby z zaliczonym testem",
    query: { testy: "zaliczone" },
    pasuje: (osoba) => osoba.tests_passed > 0,
  },
};

/** Adres docelowy z zakodowanym filtrem — sam link, bez odczytu danych. */
export function adresListyOsob(klucz: KluczLiczby): string {
  const { query } = ODNOSNIKI_LICZB[klucz];
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return qs ? `${CEL_LISTY_OSOB}?${qs}` : CEL_LISTY_OSOB;
}

/** Liczba osób z `people`, którą dany filtr faktycznie daje — do porównania z kafelkiem. */
export function liczbaZFiltra(klucz: KluczLiczby, people: ReportsPersonRow[]): number {
  return people.filter(ODNOSNIKI_LICZB[klucz].pasuje).length;
}
