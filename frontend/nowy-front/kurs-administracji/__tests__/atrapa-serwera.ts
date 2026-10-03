import type { Topic } from "@/lib/api/h08-tematy";
import type { AdminUserListItem } from "@/lib/api/h18";
import type { AdminCourse } from "@/lib/h08/types";
import type { LekcjaAdmin } from "@/nowy-front/lekcja-edycja/dane";

/**
 * Atrapa zaplecza dla prób ekranu kursu: stoi ZA funkcjami `api` i `apiPaged`
 * wspólnego klienta, więc prawdziwe funkcje danych sekcji (tematy, publikacja,
 * zaproszenia, lekcje, materiały, przypisania, test z progiem) wykonują się naprawdę i próba czyta adres, metodę
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

/** Lekcja z polami stanu nagrania, które podaje serwer; domyślnie nagranie gotowe. */
export function lekcjaZeStanem(id: number, title: string, stan: Partial<LekcjaAdmin> = {}): LekcjaAdmin {
  return {
    ...lekcja(id, title),
    video_status: "ready",
    video_status_at: "2026-10-01T12:00:00Z",
    video_ready: true,
    video_pending: false,
    ...stan,
  };
}

/** Lekcja bez nagrania i bez treści, w kształcie serwera ze stanem nagrania. */
export const BEZ_NAGRANIA: Partial<LekcjaAdmin> = {
  video_provider_id: null,
  video_status: "none",
  video_status_at: null,
  video_ready: false,
  video_pending: false,
};

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

export const PROWADZACY = [
  { id: 5, first_name: "Joanna", last_name: "Demo" },
  { id: 6, first_name: "Adam", last_name: "Demo" },
];

/** Osoby z rolą prowadzącego, które nie mają zapisanej wizytówki — dane zmyślone. */
export const PROWADZACY_BEZ_WIZYTOWKI = [
  { id: 7, first_name: "Ewa", last_name: "Brzeska" },
  { id: 8, first_name: "Piotr", last_name: "Cichy" },
];

function osobaProwadzaca(osoba: { id: number; first_name: string; last_name: string }): AdminUserListItem {
  return {
    ...osoba,
    email: `prowadzacy-${osoba.id}@demo.pl`,
    role: "instructor",
    status: "active",
    product_group: "psychon",
    access_expires_at: null,
    program_completed_at: null,
    created_at: "2026-08-01T08:00:00Z",
  };
}

/** Lista osób serwera: uczestniczka oraz wszystkie aktywne osoby z rolą prowadzącego. */
export const OSOBY_Z_PROWADZACYMI: AdminUserListItem[] = [
  ...OSOBY,
  ...[...PROWADZACY, ...PROWADZACY_BEZ_WIZYTOWKI].map(osobaProwadzaca),
];

export interface PrzypisanieAtrapy {
  id: number;
  course_id: number;
  lesson_id: number | null;
  instructor: { id: number; first_name: string; last_name: string };
}

interface StanSerwera {
  kurs?: AdminCourse;
  lekcje?: LekcjaAdmin[];
  tematy?: Topic[];
  osoby?: AdminUserListItem[];
  przypisania?: PrzypisanieAtrapy[];
  /** Identyfikator testu wiedzy kursu; `null` = kurs bez testu. */
  test?: number | null;
  /**
   * Stan nagrania lekcji z `…/video-status`; lekcja spoza mapy ma nagranie gotowe.
   * Sam napis to odpowiedź starszego serwera (`status`); obiekt — pełna odpowiedź
   * z polami stanu (`video_status`, `video_ready`, `video_pending`).
   */
  nagrania?: Record<number, "processing" | "finished" | "error" | Record<string, unknown>>;
}

type Nadpisanie = (cialo: unknown) => unknown;

export function utworzSerwer(poczatek: StanSerwera = {}) {
  let kurs = poczatek.kurs ?? KURS;
  let lekcje = poczatek.lekcje ?? LEKCJE;
  let tematy = poczatek.tematy ?? TEMATY;
  const osoby = poczatek.osoby ?? OSOBY_Z_PROWADZACYMI;
  let przypisania = poczatek.przypisania ?? [];
  let test = poczatek.test === undefined ? 31 : poczatek.test;
  // Nadpisania progu i limitu podejść na wierszu testu; `null` = wartość edycji (80 %, 3 podejścia).
  let progiTestu: { pass_threshold: number | null; attempts_limit: number | null } = {
    pass_threshold: null,
    attempts_limit: null,
  };
  const zasobTestu = (id: number) => ({
    id,
    course_id: 4,
    ...progiTestu,
    question_count: 10,
    effective_pass_threshold: progiTestu.pass_threshold ?? 80,
    effective_attempts_limit: progiTestu.attempts_limit ?? 3,
  });
  let nastepnyId = 100;
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
    if (metoda === "POST" && sciezka === "/admin/courses/4/lessons") {
      const dane = cialo as { title: string; description: string | null; duration_seconds: number; topic_id: number };
      const nowa: LekcjaAdmin = {
        ...lekcja(nastepnyId++, dane.title),
        description: dane.description,
        duration_seconds: dane.duration_seconds,
        topic_id: dane.topic_id,
        video_provider_id: null,
      };
      lekcje = [...lekcje, nowa];
      tematy = tematy.map((wpis) =>
        wpis.id === dane.topic_id ? { ...wpis, lesson_ids: [...wpis.lesson_ids, nowa.id] } : wpis,
      );
      return nowa;
    }
    if (metoda === "DELETE" && zapisLekcji && sciezka.startsWith("/admin/")) {
      const id = Number(zapisLekcji[2]);
      lekcje = lekcje.filter((wpis) => wpis.id !== id);
      return { id, deleted: true };
    }
    if (metoda === "POST" && sciezka === "/admin/courses/4/materials") {
      const plik = (cialo as FormData).get("file") as File;
      return {
        id: nastepnyId++,
        name: plik.name,
        mime: plik.type,
        size: plik.size,
        lesson_id: null,
        course_id: 4,
        created_at: null,
      };
    }
    const material = dopasuj(/^\/admin\/materials\/(\d+)$/);
    if (metoda === "DELETE" && material) return { id: Number(material[1]), deleted: true };
    if (sciezka === "/admin/courses/4/assignments") {
      if (metoda === "GET") return przypisania;
      if (metoda === "POST") {
        const dane = cialo as { instructor_id: number; lesson_id: number | null };
        const nowe: PrzypisanieAtrapy = {
          id: nastepnyId++,
          course_id: 4,
          lesson_id: dane.lesson_id,
          instructor: [...PROWADZACY, ...PROWADZACY_BEZ_WIZYTOWKI].find((osoba) => osoba.id === dane.instructor_id)!,
        };
        przypisania = [...przypisania, nowe];
        return nowe;
      }
      if (metoda === "DELETE") {
        const id = (cialo as { assignment_id: number }).assignment_id;
        przypisania = przypisania.filter((wpis) => wpis.id !== id);
        return { id, deleted: true };
      }
    }
    if (metoda === "GET" && dopasuj(/^\/(admin|instructor)\/courses\/4\/tests$/)) {
      return test === null ? null : zasobTestu(test);
    }
    if (metoda === "POST" && test === null && dopasuj(/^\/(admin|instructor)\/courses\/4\/tests$/)) {
      test = 31;
      return zasobTestu(test);
    }
    const zapisTestu = dopasuj(/^\/(admin|instructor)\/tests\/(\d+)$/);
    if (metoda === "PATCH" && test !== null && zapisTestu?.[2] === String(test)) {
      progiTestu = { ...progiTestu, ...(cialo as Partial<typeof progiTestu>) };
      return zasobTestu(test);
    }
    const nagranie = dopasuj(/^\/admin\/lessons\/(\d+)\/video-status$/);
    if (metoda === "GET" && nagranie) {
      const status = poczatek.nagrania?.[Number(nagranie[1])] ?? "finished";
      if (typeof status !== "string") return { duration_seconds: 600, preview_embed_url: null, ...status };
      return { status, duration_seconds: 600, preview_embed_url: null };
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
    const status = /[?&]status=([a-z_]+)/.exec(sciezka)?.[1];
    const dane = osoby
      .filter((osoba) => (rola ? osoba.role === rola : true))
      .filter((osoba) => (status ? osoba.status === status : true));
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
