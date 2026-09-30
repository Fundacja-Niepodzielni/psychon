import { ApiError, api } from "@/lib/api/klient";

/**
 * Dane ekranu „Zacznij tutaj — treść” (A-30): odczyt `GET /onboarding` i zapis
 * `PATCH /admin/onboarding` (`backend/routes/api/h21.php:25,27-28`,
 * `OnboardingController`). Odczyt jest otwarty dla każdej zalogowanej roli,
 * zapis tylko dla `project_manager` i `super_admin` — odmowę zapisu niesie
 * dopiero `PATCH` (403).
 *
 * Kształt odpowiedzi: trzy sekcje (`video`, `program`, `expectations`) i
 * `updated_at` (`OnboardingController::payload`,
 * `backend/app/Http/Controllers/Api/V1/OnboardingController.php:44-51`;
 * sekcje i pola z `OnboardingContent::DEFAULTS`,
 * `backend/app/Support/OnboardingContent.php:24-45`). Limity długości pól:
 * `UpdateOnboardingRequest::rules()`
 * (`backend/app/Http/Requests/H21/UpdateOnboardingRequest.php:24-36`),
 * powtórzone w `LIMITY` i porównywane z `backend/openapi.json` przez test.
 * Schemat odpowiedzi w `openapi.json` nazywa tylko `updated_at` (sekcje idą
 * jako `additionalProperties`) — rozjazd opisany w teście, zaplecza nie zmieniam.
 *
 * Wołane z przeglądarki (`lib/api/klient.ts`) — powód jak w
 * `nowy-front/formy-stazu/dane.ts`.
 */

export interface SekcjaFilm {
  title: string;
  url: string | null;
  caption: string | null;
}

export interface SekcjaTekst {
  title: string;
  body: string;
}

export interface EkranStartowy {
  video: SekcjaFilm;
  program: SekcjaTekst;
  expectations: SekcjaTekst;
  updated_at: string | null;
}

export type SekcjaEkranu = "video" | "program" | "expectations";

export type PoleEkranu =
  | "video.title"
  | "video.url"
  | "video.caption"
  | "program.title"
  | "program.body"
  | "expectations.title"
  | "expectations.body";

/** Kolejność = kolejność na ekranie (pierwsze pięć od razu, reszta w zwijanej sekcji). */
export const POLA_EKRANU: readonly PoleEkranu[] = [
  "video.title",
  "video.url",
  "video.caption",
  "program.title",
  "program.body",
  "expectations.title",
  "expectations.body",
];

/** Maksymalna długość pola — `UpdateOnboardingRequest::rules()`. */
export const LIMITY: Record<PoleEkranu, number> = {
  "video.title": 200,
  "video.url": 500,
  "video.caption": 500,
  "program.title": 200,
  "program.body": 4000,
  "expectations.title": 200,
  "expectations.body": 4000,
};

export type FormularzEkranu = Record<PoleEkranu, string>;

export function pobierzEkranStartowy(): Promise<EkranStartowy> {
  return api<EkranStartowy>("/onboarding");
}

export type CialoZapisu = {
  video?: { title: string; url: string | null; caption: string | null };
  program?: SekcjaTekst;
  expectations?: SekcjaTekst;
};

export function zapiszEkranStartowy(cialo: CialoZapisu): Promise<EkranStartowy> {
  return api<EkranStartowy>("/admin/onboarding", { method: "PATCH", body: cialo });
}

export function formularzZEkranu(ekran: EkranStartowy): FormularzEkranu {
  return {
    "video.title": ekran.video.title,
    "video.url": ekran.video.url ?? "",
    "video.caption": ekran.video.caption ?? "",
    "program.title": ekran.program.title,
    "program.body": ekran.program.body,
    "expectations.title": ekran.expectations.title,
    "expectations.body": ekran.expectations.body,
  };
}

function pustyNaNull(wartosc: string): string | null {
  return wartosc.trim() === "" ? null : wartosc;
}

/**
 * Ciało `PATCH`: wyłącznie sekcje, w których coś się zmieniło — ale zawsze
 * CAŁA sekcja, bo serwer wymaga wszystkich pól tekstowych podanej sekcji
 * (`required_with`). Puste pole adresu i podpisu filmu idzie jako `null`
 * (oba są `nullable`); pusty tytuł albo treść idzie dosłownie jako pusty
 * tekst, żeby walidacja serwera zobaczyła to, co wpisano.
 */
export function cialoZapisu(zapisany: EkranStartowy, formularz: FormularzEkranu): CialoZapisu {
  const zapisane = formularzZEkranu(zapisany);
  const zmienione = (pola: PoleEkranu[]) => pola.some((pole) => zapisane[pole] !== formularz[pole]);
  const cialo: CialoZapisu = {};
  if (zmienione(["video.title", "video.url", "video.caption"])) {
    cialo.video = {
      title: formularz["video.title"],
      url: pustyNaNull(formularz["video.url"]),
      caption: pustyNaNull(formularz["video.caption"]),
    };
  }
  if (zmienione(["program.title", "program.body"])) {
    cialo.program = { title: formularz["program.title"], body: formularz["program.body"] };
  }
  if (zmienione(["expectations.title", "expectations.body"])) {
    cialo.expectations = { title: formularz["expectations.title"], body: formularz["expectations.body"] };
  }
  return cialo;
}

export interface BledyEkranu {
  pola: Partial<Record<PoleEkranu, string>>;
  pozostale: string[];
}

/** Rozkłada `errors` z koperty 422 (klucze kropkowane, np. `video.url`) na pola ekranu i resztę. */
export function bledyZOdpowiedzi(errors: Record<string, string[]> | undefined): BledyEkranu {
  const wynik: BledyEkranu = { pola: {}, pozostale: [] };
  for (const [nazwa, komunikaty] of Object.entries(errors ?? {})) {
    const komunikat = komunikaty[0];
    if (!komunikat) continue;
    if ((POLA_EKRANU as readonly string[]).includes(nazwa)) {
      wynik.pola[nazwa as PoleEkranu] = komunikat;
    } else {
      wynik.pozostale.push(komunikat);
    }
  }
  return wynik;
}

export type RodzajBledu = "brak-uprawnien" | "brak" | "walidacja" | "siec";

/** 401/403 to odmowa, 404 to brak ekranu, 422 to pola, reszta to sieć. */
export function rodzajBledu(blad: unknown): RodzajBledu {
  if (blad instanceof ApiError) {
    if (blad.status === 401 || blad.status === 403) return "brak-uprawnien";
    if (blad.status === 404) return "brak";
    if (blad.status === 422) return "walidacja";
  }
  return "siec";
}

/**
 * Adres filmu, który wolno pokazać jako odnośnik w podglądzie: tylko `http:`
 * i `https:`. Reguła `url` serwera przepuszcza też inne schematy, a podgląd
 * nie tworzy odnośnika z nich — zostaje sam tekst.
 */
export function adresFilmu(url: string): string | null {
  try {
    const adres = new URL(url.trim());
    return adres.protocol === "https:" || adres.protocol === "http:" ? adres.href : null;
  } catch {
    return null;
  }
}

/** Data ostatniej zmiany po polsku w czasie warszawskim albo `null` bez wartości. */
export function opisOstatniejZmiany(znacznik: string | null): string {
  if (znacznik === null) return "Treść domyślna — jeszcze nie była zmieniana.";
  const data = new Date(znacznik);
  if (Number.isNaN(data.getTime())) return "Nie znamy daty ostatniej zmiany.";
  const tekst = new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(data);
  return `Ostatnia zmiana: ${tekst}.`;
}
