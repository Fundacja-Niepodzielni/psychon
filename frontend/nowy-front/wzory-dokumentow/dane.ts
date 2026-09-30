import { ApiError } from "@/lib/api/klient";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { formatujDateICzas } from "../wspolne/daty";
import type {
  DocumentTemplate,
  DocumentTemplateAuthor,
  DocumentTemplateType,
  DocumentTemplateVersion,
} from "@/lib/api/document-templates";

/**
 * Logika danych ekranu „Wzory dokumentów”: rodzaje wzorów, stan wczytania,
 * wiersze historii i mapowanie błędów serwera na zdania. Bez Reacta, żeby
 * dało się ją sprawdzić samym testem jednostkowym.
 *
 * Rodzaje są tymi, które przyjmuje trasa (`DocumentTemplate::TYPES` na
 * zapleczu) — inny rodzaj kończy się tam odpowiedzią 404.
 */
export interface RodzajWzoru {
  typ: DocumentTemplateType;
  etykieta: string;
}

export const RODZAJE_WZORU: RodzajWzoru[] = [
  { typ: "agreement", etykieta: "Porozumienie wolontariackie" },
  { typ: "attendance_certificate", etykieta: "Zaświadczenie o stażu" },
  { typ: "certificate", etykieta: "Certyfikat ukończenia programu" },
];

export function etykietaRodzaju(typ: DocumentTemplateType): string {
  return RODZAJE_WZORU.find((rodzaj) => rodzaj.typ === typ)?.etykieta ?? typ;
}

export type StanWczytania =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "brak-wzoru" }
  | { rodzaj: "siec" }
  | { rodzaj: "gotowy"; wzor: DocumentTemplate; historia: DocumentTemplateVersion[] };

/**
 * Błąd wczytania → stan ekranu. 401 i 403 to odmowa dostępu, 404 to brak
 * wzoru tego rodzaju (albo wyłączony edytor — trasa nie istnieje i odpowiada
 * tak samo), wszystko inne to błąd sieci lub serwera.
 */
export function stanZBleduWczytania(blad: unknown): StanWczytania {
  if (blad instanceof ApiError) {
    if (blad.status === 401 || blad.status === 403) return { rodzaj: "brak-uprawnien" };
    if (blad.status === 404) return { rodzaj: "brak-wzoru" };
  }
  return { rodzaj: "siec" };
}

export type WynikZapisu =
  | { rodzaj: "pole"; tresc: string }
  | { rodzaj: "ogolny"; tresc: string };

/**
 * Błąd zapisu → jedno zdanie i miejsce jego pokazania: 422 z komunikatem
 * pola trafia pod pole treści, reszta do komunikatu nad formularzem.
 */
export function wynikZBleduZapisu(blad: unknown): WynikZapisu {
  if (blad instanceof ApiError) {
    if (blad.status === 422) {
      const zPola = blad.errors?.content?.[0];
      return { rodzaj: "pole", tresc: zPola ?? "Popraw treść wzoru." };
    }
    if (blad.status === 401 || blad.status === 403) {
      return { rodzaj: "ogolny", tresc: `${zdanieOdmowyRoli("administracji")} Twoja treść została w polu.` };
    }
    if (blad.status === 404) {
      return {
        rodzaj: "ogolny",
        tresc: "Nie znaleziono wzoru tego rodzaju. Twoja treść została w polu.",
      };
    }
  }
  return { rodzaj: "ogolny", tresc: "Nie udało się zapisać wzoru. Twoja treść została w polu — spróbuj ponownie." };
}

/** Kontrola przed wysłaniem — te same warunki, które sprawdza serwer, plus brak zmian. */
export function bladTresci(tresc: string, zapisana: string): string | undefined {
  if (tresc.trim() === "") return "Wpisz treść wzoru.";
  if (tresc === zapisana) return "Treść jest taka sama jak w bieżącej wersji. Zmień ją, żeby zapisać nową wersję.";
  return undefined;
}

export function czyZmieniona(tresc: string, zapisana: string): boolean {
  return tresc !== zapisana;
}

export function formatujMomentZmiany(iso: string): string {
  return formatujDateICzas(iso);
}

/** Osoba przy wersji; `null` to wzór, którego nikt jeszcze nie edytował. */
export function opisAutora(autor: DocumentTemplateAuthor | null): string {
  return autor ? autor.name : "wzór jeszcze nie był edytowany";
}

export function wierszeHistorii(historia: DocumentTemplateVersion[]) {
  return historia.map((wpis) => ({
    id: String(wpis.version),
    wartosci: {
      wersja: `Wersja ${wpis.version}`,
      kiedy: formatujMomentZmiany(wpis.updated_at),
      kto: opisAutora(wpis.updated_by),
    },
  }));
}

/** Historia po zapisie: nowy wpis na czele, bez drugiego odczytu listy. */
export function historiaPoZapisie(
  historia: DocumentTemplateVersion[],
  zapisany: DocumentTemplate,
): DocumentTemplateVersion[] {
  return [
    { version: zapisany.version, updated_at: zapisany.updated_at, updated_by: zapisany.updated_by },
    ...historia.filter((wpis) => wpis.version !== zapisany.version),
  ];
}
