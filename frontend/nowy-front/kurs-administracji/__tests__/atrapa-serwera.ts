import type { Topic } from "@/lib/api/h08-tematy";
import type { AdminUserListItem } from "@/lib/api/h18";
import type { AdminCourse } from "@/lib/h08/types";
import type { LekcjaAdmin } from "@/nowy-front/lekcja-edycja/dane";

/**
 * Atrapa zaplecza dla prób ekranu kursu: stoi ZA funkcjami `api` i `apiPaged`
 * wspólnego klienta, więc prawdziwe funkcje danych sekcji (tematy, publikacja,
 * zaproszenia, lekcje) wykonują się naprawdę i próba czyta adres, metodę
 * i ciało każdego żądania. Zna trasy obu grup — administracji i prowadzącego
 * — w tym samym kształcie, żeby próba widziała, którą grupą ekran naprawdę
 * rozmawia. Żądanie spoza listy kończy się błędem: próba nie przechodzi po
 * cichu na trasie, której nie zna.
 */

export interface Wywolanie {
  sciezka: string;
  metoda: string;
  cialo: unknown;
}

export const KURS: AdminCourse = {
  id: 4,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  description: "Opis kursu.",
  type: "course",
  product_group: "psychon",
  sequence_order: 2,
  edition_id: 1,
  is_published: false,
  lessons_count: 3,
  materials_count: 1,
  created_at: null,
  updated_at: null,
};

export function lekcja(id: number, title: string): LekcjaAdmin {
  return {
    id,
    course_id: 4,
    title,
    description: null,
    content: null,
    sequence_order: null,
    topic_id: null,
    topic_position: null,
    video_provider_id: `wideo-${id}`,
    duration_seconds: 600,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

export const LEKCJE = [lekcja(21, "Lekcja A"), lekcja(22, "Lekcja B"), lekcja(23, "Lekcja C")];

export function temat(id: number, title: string, position: number, lesson_ids: number[]): Topic {
  return { id, course_id: 4, title, position, lesson_ids, created_at: null, updated_at: null };
}

export const TEMATY = [temat(7, "Wprowadzenie", 1, [21, 22]), temat(8, "Praktyka", 2, [23])];

export const OSOBY: AdminUserListItem[] = [
  {
    id: 17,
    first_name: "Marta",
    last_name: "Demo",
    email: "marta@demo.pl",
    role: "volunteer",
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-08-01T08:00:00Z",
  },
];

interface StanSerwera {
  kurs?: AdminCourse;
  lekcje?: LekcjaAdmin[];
  tematy?: Topic[];
  osoby?: AdminUserListItem[];
}

type Nadpisanie = (cialo: unknown) => unknown;

export function utworzSerwer(poczatek: StanSerwera = {}) {
  let kurs = poczatek.kurs ?? KURS;
  let lekcje = poczatek.lekcje ?? LEKCJE;
  let tematy = poczatek.tematy ?? TEMATY;
  const osoby = poczatek.osoby ?? OSOBY;
  const wywolania: Wywolanie[] = [];
  const nadpisania = new Map<string, Nadpisanie>();

  function domyslnie(metoda: string, sciezka: string, cialo: unknown): unknown {
    const dopasuj = (wzorzec: RegExp) => wzorzec.exec(sciezka);
    if (metoda === "GET" && sciezka === "/me") return { id: 1, role: "project_manager" };
    if (dopasuj(/^\/(admin|instructor)\/courses\/4$/)) {
      if (metoda === "GET") return kurs;
      if (metoda === "PATCH") {
        kurs = { ...kurs, ...(cialo as Partial<AdminCourse>) };
        return kurs;
      }
      if (metoda === "DELETE" && sciezka.startsWith("/admin/")) return { id: 4, deleted: true };
    }
    if (metoda === "GET" && dopasuj(/^\/(admin|instructor)\/courses\/4\/lessons$/)) return lekcje;
    if (metoda === "GET" && dopasuj(/^\/(admin|instructor)\/courses\/4\/topics$/)) return tematy;
    if (metoda === "POST" && dopasuj(/^\/(admin|instructor)\/courses\/4\/topics$/)) {
      const nowy = temat(99, (cialo as { title: string }).title, tematy.length + 1, []);
      tematy = [...tematy, nowy];
      return nowy;
    }
    if (metoda === "PATCH" && dopasuj(/^\/(admin|instructor)\/courses\/4\/topics\/reorder$/)) {
      const uklad = (cialo as { topics: { id: number; lesson_ids: number[] }[] }).topics;
      tematy = uklad.map((wpis, indeks) => {
        const dotychczasowy = tematy.find((kandydat) => kandydat.id === wpis.id)!;
        return { ...dotychczasowy, position: indeks + 1, lesson_ids: wpis.lesson_ids };
      });
      return tematy;
    }
    const zapisLekcji = dopasuj(/^\/(admin|instructor)\/lessons\/(\d+)$/);
    if (metoda === "PATCH" && zapisLekcji) {
      const id = Number(zapisLekcji[2]);
      lekcje = lekcje.map((wpis) => (wpis.id === id ? { ...wpis, ...(cialo as Partial<LekcjaAdmin>) } : wpis));
      return lekcje.find((wpis) => wpis.id === id);
    }
    if (metoda === "POST" && sciezka === "/admin/courses/4/invite") {
      return { invited: (cialo as { user_ids: number[] }).user_ids.length };
    }
    throw new Error(`atrapa serwera: nieoczekiwane żądanie ${metoda} ${sciezka}`);
  }

  async function api(sciezka: string, opcje: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const metoda = opcje.method ?? "GET";
    wywolania.push({ sciezka, metoda, cialo: opcje.body });
    const nadpisanie = nadpisania.get(`${metoda} ${sciezka}`);
    const wynik = nadpisanie ? nadpisanie(opcje.body) : domyslnie(metoda, sciezka, opcje.body);
    if (wynik instanceof Error) throw wynik;
    return wynik;
  }

  async function apiPaged(sciezka: string): Promise<unknown> {
    wywolania.push({ sciezka, metoda: "GET", cialo: undefined });
    if (!sciezka.startsWith("/admin/users")) {
      throw new Error(`atrapa serwera: nieoczekiwane żądanie listy ${sciezka}`);
    }
    const rola = /[?&]role=([a-z_]+)/.exec(sciezka)?.[1];
    const dane = rola ? osoby.filter((osoba) => osoba.role === rola) : osoby;
    return { data: dane, meta: { current_page: 1, per_page: 100, total: dane.length, last_page: 1 } };
  }

  return {
    api,
    apiPaged,
    wywolania,
    /** Zastępuje odpowiedź jednego żądania; zwrócony `Error` zostaje rzucony. */
    nadpisz(metoda: string, sciezka: string, odpowiedz: Nadpisanie) {
      nadpisania.set(`${metoda} ${sciezka}`, odpowiedz);
    },
    /** Żądania zapisu (wszystko poza GET), w kolejności wysłania. */
    zapisy(): Wywolanie[] {
      return wywolania.filter((wywolanie) => wywolanie.metoda !== "GET");
    },
    /** Ścieżki żądań, które trafiły w trasy wskazanej grupy. */
    sciezkiGrupy(grupa: "admin" | "instructor"): string[] {
      return wywolania.map((wywolanie) => wywolanie.sciezka).filter((sciezka) => sciezka.startsWith(`/${grupa}/`));
    },
  };
}

export type AtrapaSerwera = ReturnType<typeof utworzSerwer>;
