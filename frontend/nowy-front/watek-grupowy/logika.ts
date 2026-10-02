/**
 * Teksty i reguły ekranu „Wątek grupowy” — czysta logika bez Reacta, żeby każde zdanie dało się
 * zmierzyć testem jednostkowym.
 */
import { formatujDateICzas } from "../wspolne/daty";
import { odmien } from "../wspolne/odmiana";
import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import type { ChatMessage, ChatThread, PaginationMeta } from "./dane";

export function nazwaAutora(wiadomosc: ChatMessage): string {
  return wiadomosc.sender ? `${wiadomosc.sender.first_name} ${wiadomosc.sender.last_name}` : "Nieznany nadawca";
}

/** „Marta Demo · 30 września 2026, 20:50” — data tylko wtedy, gdy ją podano. */
export function podpisWiadomosci(wiadomosc: ChatMessage): string {
  return wiadomosc.created_at ? `${nazwaAutora(wiadomosc)} · ${formatujDateICzas(wiadomosc.created_at)}` : nazwaAutora(wiadomosc);
}

export function opisOstatniejWiadomosci(watek: ChatThread): string {
  return watek.updated_at ? `Ostatnia wiadomość: ${formatujDateICzas(watek.updated_at)}` : "Brak wiadomości";
}

export function wierszeWatkow(watki: ChatThread[], onOtworz: (id: number) => void): WierszRecordList[] {
  return watki.map((watek) => ({
    id: `watek-${watek.id}`,
    tytul: "Wątek grupowy",
    tytulPogrubiony: true,
    podpowiedz: opisOstatniejWiadomosci(watek),
    plakietka: { wariant: "neutral", tekst: "Grupa" },
    akcja: { etykieta: "Otwórz wątek", etykietaDostepna: "Otwórz wątek grupowy", onKliknij: () => onOtworz(watek.id) },
  }));
}

/** „Na stronie jest 25 z 61 wiadomości.” — dla stronicowania; „z N” zawsze w dopełniaczu liczby mnogiej. */
export function zdanieOStronie(meta: PaginationMeta, naStronie: number): string {
  return `Na tej stronie: ${naStronie} z ${meta.total} ${odmien(meta.total, "wiadomości", "wiadomości", "wiadomości")}.`;
}

export function licznikZnakow(tekst: string, limit: number): string {
  return `${tekst.length}/${limit} ${odmien(limit, "znak", "znaki", "znaków")}`;
}

/** Numer osoby ze składu: liczba całkowita większa od zera, inaczej `null`. */
export function numerOsoby(tekst: string): number | null {
  const liczba = Number(tekst);
  return tekst.trim() !== "" && Number.isInteger(liczba) && liczba > 0 ? liczba : null;
}

export const POWOD_BRAKU_NUMERU = "Wpisz numer osoby: liczbę całkowitą większą od zera.";
export const POWOD_PUSTEJ_WIADOMOSCI = "Wpisz treść wiadomości.";

/**
 * Co zrobić po wysłaniu wiadomości: dopisać ją na koniec bieżącej strony (gdy to ostatnia strona i jest na niej
 * miejsce) albo wczytać stronę, na której ona wylądowała. Bez informacji o stronicowaniu — dopisać.
 */
export function planPoWyslaniu(meta: PaginationMeta | undefined, liczbaNaStronie: number): { rodzaj: "dopisz" } | { rodzaj: "wczytaj"; strona: number } {
  if (meta === undefined) return { rodzaj: "dopisz" };
  if (meta.current_page >= meta.last_page && liczbaNaStronie < meta.per_page) return { rodzaj: "dopisz" };
  return { rodzaj: "wczytaj", strona: Math.ceil((meta.total + 1) / meta.per_page) };
}

/** Metadane po dopisaniu jednej wiadomości lokalnie. */
export function metaPoDopisaniu(meta: PaginationMeta | undefined): PaginationMeta | undefined {
  return meta === undefined ? undefined : { ...meta, total: meta.total + 1 };
}
