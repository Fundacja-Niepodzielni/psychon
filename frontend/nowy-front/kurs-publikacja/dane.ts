import type { AdminCourse, AdminLesson } from "@/lib/h08/types";
import type { PozycjaChecklisty } from "@/design-system/organizmy/PublishChecklist/PublishChecklist";

/**
 * Baza adresu API — ten sam kontrakt co `lib/api/klient.ts` (`NEXT_PUBLIC_API_URL`
 * + `/api/v1`), zapisana tu osobno: ta trasa jest pierwszym konsumentem nowego
 * frontu i celowo nie dokłada zależności do drzewa starego frontu poza typami
 * DTO (`lib/h08/types.ts`), które opisują kontrakt API, a nie jego wygląd.
 */
function bazaApi(): string {
  const surowa = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${surowa.replace(/\/+$/, "")}/api/v1`;
}

interface KopertaOdpowiedzi<T> {
  data: T;
}

type WynikJson<T> =
  | { status: "ok"; dane: T }
  | { status: "brak-uprawnien" }
  | { status: "blad" };

async function pobierzJson<T>(sciezka: string, token: string): Promise<WynikJson<T>> {
  try {
    const odpowiedz = await fetch(`${bazaApi()}${sciezka}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (odpowiedz.status === 401 || odpowiedz.status === 403) return { status: "brak-uprawnien" };
    if (!odpowiedz.ok) return { status: "blad" };
    const cialo = (await odpowiedz.json()) as KopertaOdpowiedzi<T>;
    return { status: "ok", dane: cialo.data };
  } catch {
    // Backend nieosiągalny — ten sam stan co odpowiedź spoza 2xx/401/403.
    return { status: "blad" };
  }
}

export interface DaneKursu {
  kurs: AdminCourse;
  lekcje: AdminLesson[];
}

/**
 * Pięć stanów trasy (`06-ATOMY §7`): `brak-sesji` (pusty token —
 * odpowiednik „brak uprawnień” na poziomie sesji), `brak-uprawnien`
 * (401/403 z API), `blad` (inna odpowiedź spoza 2xx albo wyjątek sieci),
 * `pusty` (kurs pobrany, ale bez lekcji — nie ma jeszcze czego sprawdzać przed
 * publikacją; pliki są tylko w lekcjach) i `ok` (checklista renderowana). Stanu
 * „po zapisaniu” ta trasa NIE ma — nie wywołuje żadnego zapisu do API
 * (`KursPublikacja.tsx`, komentarz przy końcu pliku wyjaśnia to jako OPEN).
 */
export type WynikDanychKursu =
  | { status: "brak-sesji" }
  | { status: "brak-uprawnien" }
  | { status: "blad" }
  | { status: "pusty"; dane: DaneKursu }
  | { status: "ok"; dane: DaneKursu };

/**
 * Realne dane kursu z istniejącego API H08 — `GET /instructor/courses/{id}`
 * i `GET /instructor/courses/{id}/lessons`
 * (`InstructorCourseController`, `InstructorLessonController`,
 * `backend/routes/api/h08.php:67-71`). Bez tokenu z sesji Keycloak zwraca
 * `brak-sesji` zamiast podstawiać dane.
 */
export async function pobierzDaneKursu(
  idKursu: string,
  token: string | null,
): Promise<WynikDanychKursu> {
  if (!token) return { status: "brak-sesji" };

  const [kursWynik, lekcjeWynik] = await Promise.all([
    pobierzJson<AdminCourse>(`/instructor/courses/${idKursu}`, token),
    pobierzJson<AdminLesson[]>(`/instructor/courses/${idKursu}/lessons`, token),
  ]);

  if (kursWynik.status === "brak-uprawnien" || lekcjeWynik.status === "brak-uprawnien") {
    return { status: "brak-uprawnien" };
  }
  if (kursWynik.status !== "ok") return { status: "blad" };

  const lekcje = lekcjeWynik.status === "ok" ? lekcjeWynik.dane : [];
  const dane: DaneKursu = { kurs: kursWynik.dane, lekcje };

  if (lekcje.length === 0) {
    return { status: "pusty", dane };
  }
  return { status: "ok", dane };
}

/**
 * Wyprowadza braki i gotowe pozycje WYŁĄCZNIE z pól zwróconych przez API —
 * `description`, `lessons_count` (`AdminCourseResource`)
 * i `video_provider_id` na każdej lekcji (`AdminLessonResource`). Zero
 * wartości zmyślonych albo domyślnych treści.
 */
export function checklistaPublikacji(dane: DaneKursu): {
  braki: PozycjaChecklisty[];
  gotowe: PozycjaChecklisty[];
} {
  const { kurs, lekcje } = dane;
  const braki: PozycjaChecklisty[] = [];
  const gotowe: PozycjaChecklisty[] = [];

  if (!kurs.description || kurs.description.trim() === "") {
    braki.push({ id: "opis", tekst: "Brak opisu kursu", href: `/nowy-front/kurs/${kurs.id}#opis` });
  } else {
    gotowe.push({ id: "opis", tekst: "Opis kursu uzupełniony" });
  }

  if (kurs.lessons_count === 0) {
    braki.push({
      id: "lekcje",
      tekst: "Brak lekcji w kursie",
      href: `/nowy-front/kurs/${kurs.id}#lekcje`,
    });
  } else {
    gotowe.push({ id: "lekcje", tekst: `Lekcje dodane (${kurs.lessons_count})` });
  }

  const bezNagrania = lekcje.filter((lekcja) => !lekcja.video_provider_id);
  for (const lekcja of bezNagrania) {
    braki.push({
      id: `lekcja-${lekcja.id}`,
      tekst: `Brak nagrania w lekcji „${lekcja.title}”`,
      href: `/nowy-front/kurs/${kurs.id}#lekcja-${lekcja.id}`,
    });
  }
  if (lekcje.length > 0 && bezNagrania.length === 0) {
    gotowe.push({ id: "nagrania", tekst: "Wszystkie lekcje mają nagranie" });
  }

  return { braki, gotowe };
}
