import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import {
  pobierzJa,
  pobierzMojeZgloszenia,
  type CooperationRequest,
  type CooperationRequestStatus,
} from "@/lib/api/h01-wspolpraca";

/**
 * Logika danych ekranu „Po programie” (uczestnik): słownik statusów,
 * ustalenie, czy osoba ma prawo do zgłoszenia, wczytanie stanu ekranu i
 * klasyfikacja błędów wysyłki. Ekran tylko wybiera szablon i wstawia organizmy.
 *
 * Prawo do zgłoszenia mają wolontariusz i student po ukończeniu programu.
 * Gdy go nie mają, ekran nie pyta o historię zgłoszeń: zapytanie o
 * `GET /cooperation-requests/mine` idzie wyłącznie wtedy, gdy zgłoszenie
 * wolno wysłać.
 */

export type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

export const LICZBA_ZNAKOW_MAX = 2000;

export const PLAKIETKA_STATUSU: Record<CooperationRequestStatus, { wariant: WariantPlakietki; tekst: string }> = {
  new: { wariant: "pending", tekst: "nowe" },
  answered: { wariant: "ok", tekst: "z odpowiedzią" },
  closed: { wariant: "neutral", tekst: "zamknięte" },
};

const ROLE_Z_PRAWEM_DO_ZGLOSZENIA = ["volunteer", "student"];

export function czyRolaMozeZglaszac(rola: string | undefined): boolean {
  return rola !== undefined && ROLE_Z_PRAWEM_DO_ZGLOSZENIA.includes(rola);
}

/** Certyfikat wydaje tylko wolontariuszowi (`GET /certificate/conditions` odrzuca studenta). */
export function czyPokazacCertyfikat(rola: string): boolean {
  return rola === "volunteer";
}

export type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "brak-uprawnien" }
  | {
      rodzaj: "gotowy";
      /** `ukonczony`: zgłoszenie wolno wysłać; `w-toku`: ekran otworzy się po ukończeniu programu. */
      program: "ukonczony" | "w-toku";
      rola: string;
      zakonczonoO: string | null;
      zgloszenia: CooperationRequest[];
      meta: PaginationMeta | undefined;
    };

/** Odczyt: odmowa roli (401/403) to osobny stan, reszta to błąd sieci. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || blad.status === 403);
}

/**
 * Stan ekranu po wejściu: `GET /me`, a dopiero gdy osoba ma prawo do
 * zgłoszenia — `GET /cooperation-requests/mine`. Błąd odczytu, który nie jest
 * odmową, rzuca dalej (ekran pokazuje stan „błąd”).
 */
export async function wczytajStan(): Promise<Exclude<StanEkranu, { rodzaj: "ladowanie" | "blad" }>> {
  try {
    const ja = await pobierzJa();
    if (!czyRolaMozeZglaszac(ja.role)) return { rodzaj: "brak-uprawnien" };
    if (ja.program_completed_at === null) {
      return {
        rodzaj: "gotowy",
        program: "w-toku",
        rola: ja.role,
        zakonczonoO: null,
        zgloszenia: [],
        meta: undefined,
      };
    }
    const historia = await pobierzMojeZgloszenia({ page: 1 });
    return {
      rodzaj: "gotowy",
      program: "ukonczony",
      rola: ja.role,
      zakonczonoO: ja.program_completed_at,
      zgloszenia: historia.data,
      meta: historia.meta,
    };
  } catch (blad) {
    if (czyBrakUprawnien(blad)) return { rodzaj: "brak-uprawnien" };
    throw blad;
  }
}

/** Jest zgłoszenie oczekujące na odpowiedź — nowego wysłać nie wolno (409 `cooperation_request_open`). */
export function maOtwarteZgloszenie(zgloszenia: CooperationRequest[]): boolean {
  return zgloszenia.some((zgloszenie) => zgloszenie.status === "new");
}

export type BladWysylki =
  | { rodzaj: "pola"; bledy: Record<string, string[]> }
  | { rodzaj: "program-nieukonczony" }
  | { rodzaj: "otwarte"; komunikat: string }
  | { rodzaj: "inny"; komunikat: string };

const KOMUNIKAT_SIECI = "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.";

export function sklasyfikujBladWysylki(blad: unknown): BladWysylki {
  if (blad instanceof ApiError) {
    if (blad.errors) return { rodzaj: "pola", bledy: blad.errors };
    if (blad.status === 403 && blad.code === "program_not_completed") return { rodzaj: "program-nieukonczony" };
    if (blad.status === 409 && blad.code === "cooperation_request_open") {
      return { rodzaj: "otwarte", komunikat: blad.message };
    }
    return { rodzaj: "inny", komunikat: blad.message };
  }
  return { rodzaj: "inny", komunikat: KOMUNIKAT_SIECI };
}
