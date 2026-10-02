import { act } from "@testing-library/react";
import { vi } from "vitest";
import { POCHODZENIE_ODTWARZACZA } from "../../../lib/konfiguracja/odtwarzacz-nagran";
import type { DaneLekcji, ZrodloNagrania } from "../dane";
import type { OdczytKursu } from "../kurs";

/**
 * Atrapa ramki odtwarzacza: adres z dozwolonego pochodzenia (jsdom nie wczytuje ramek,
 * żadne żądanie do dostawcy nie wychodzi), a komunikaty ramki to `MessageEvent` z
 * pochodzeniem i oknem ramki — tak, jak dostarcza je przeglądarka.
 */
export const ADRES_RAMKI = `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=aaa`;

/** Źródło nagrania z adresem osadzenia i terminem odległym o dobę (liczone od chwili wywołania). */
export function zrodloRamki(nadpisz: Partial<ZrodloNagrania> = {}): ZrodloNagrania {
  return {
    adres: "https://nagrania.atrapa.test/lista.m3u8",
    adresOsadzenia: ADRES_RAMKI,
    osadzenieWygasaO: Math.floor(Date.now() / 1000) + 86_400,
    ...nadpisz,
  };
}

export function ramkaOdtwarzacza(): HTMLIFrameElement | null {
  return document.querySelector("iframe");
}

/** Komunikat ramki z podanym pochodzeniem i nadawcą (domyślnie: dozwolone pochodzenie, okno ramki). */
export function komunikatRamki(
  dane: unknown,
  origin: string = POCHODZENIE_ODTWARZACZA,
  source: MessageEventSource | null = ramkaOdtwarzacza()?.contentWindow ?? null,
) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: dane, origin, source }));
  });
}

export function zdarzenieRamki(nazwa: string, wartosc?: unknown) {
  komunikatRamki(JSON.stringify({ context: "player.js", version: "0.0.11", event: nazwa, value: wartosc }));
}

/**
 * Ramka zgłasza gotowość i odtwarzanie, a potem co sekundę zegara pozycję: `sekundy` pełnych
 * sekund oglądania od pozycji `od`. Wymaga zegara sztucznego (z `performance`).
 */
export function graRamka(sekundy: number, od = 0) {
  zdarzenieRamki("ready");
  zdarzenieRamki("play");
  zdarzenieRamki("timeupdate", { seconds: od });
  for (let i = 1; i <= sekundy; i += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    zdarzenieRamki("timeupdate", { seconds: od + i });
  }
}

/** Kolejne sekundy tego samego odtwarzania (ramka już gra). */
export function dalejRamka(sekundy: number, od: number) {
  for (let i = 1; i <= sekundy; i += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    zdarzenieRamki("timeupdate", { seconds: od + i });
  }
}

/** Dane przykładowe lekcji w układzie ekranu: 20 min nagrania, 16 min wymaganych, 12. minuta przerwania. */
export const TRESC_LEKCJI =
  "## Po co ta lekcja\n\nKryzys psychiczny nie zawsze wygląda jak kryzys.\n\n- sygnał pierwszy\n- sygnał drugi\n\nPrzeczytaj to **uważnie**.";

export const LEKCJA: DaneLekcji = {
  id: 21,
  title: "Rozpoznawanie kryzysu psychicznego",
  description: "Opis lekcji",
  content: TRESC_LEKCJI,
  topic: { id: 7, title: "Kryzys i jego przebieg", position: 1 },
  course: { id: 3, slug: "pierwsza-pomoc-psychologiczna", title: "Pierwsza pomoc psychologiczna" },
  question_addressee: { name: "Marta Zielińska" },
  required_active_seconds: 960,
  duration_seconds: 1200,
  position_seconds: 0,
  watched_seconds: 720,
  active_seconds: 720,
  is_completed: false,
  completable: false,
  completable_at_percent: 80,
  video_status: "ready",
};

/** Siedem lekcji w temacie „Kryzys i jego przebieg”: dwie ukończone, trzecia to bieżąca (id 21). */
export const KURS: OdczytKursu = {
  slug: "pierwsza-pomoc-psychologiczna",
  topics: [
    { id: 7, title: "Kryzys i jego przebieg", position: 1 },
    { id: 8, title: "Rozmowa z osobą w kryzysie", position: 2 },
  ],
  lessons: [
    { id: 19, title: "Czym jest kryzys", sequence_order: 1, duration_seconds: 600, is_completed: true, topic_id: 7 },
    { id: 20, title: "Fazy kryzysu", sequence_order: 2, duration_seconds: 600, is_completed: true, topic_id: 7 },
    { id: 21, title: "Rozpoznawanie kryzysu psychicznego", sequence_order: 3, duration_seconds: 1200, is_completed: false, topic_id: 7 },
    { id: 22, title: "Rozmowa, która nie ocenia", sequence_order: 4, duration_seconds: 960, is_completed: false, topic_id: 7 },
    { id: 23, title: "Czego unikać", sequence_order: 5, duration_seconds: 600, is_completed: false, topic_id: 7 },
    { id: 24, title: "Ćwiczenie z przykładami", sequence_order: 6, duration_seconds: 600, is_completed: false, topic_id: 7 },
    { id: 25, title: "Podsumowanie tematu", sequence_order: 7, duration_seconds: 600, is_completed: false, topic_id: 7 },
    { id: 31, title: "Pierwsze zdanie rozmowy", sequence_order: 8, duration_seconds: 900, is_completed: false, topic_id: 8 },
  ],
  materials: [
    {
      id: 1,
      name: "Schemat decyzji w kryzysie.pdf",
      size: 246784,
      mime: "application/pdf",
      lesson_id: 21,
      download_url: "https://api.test/materials/1",
    },
    {
      id: 2,
      name: "Numery pomocowe w Polsce.pdf",
      size: 98304,
      mime: "application/pdf",
      lesson_id: 21,
      download_url: "https://api.test/materials/2",
    },
    { id: 3, name: "Cudzy plik.pdf", size: 1000, mime: "application/pdf", lesson_id: 22, download_url: "https://api.test/materials/3" },
  ],
  has_test: true,
};

/** Kopia kursu z innym stanem lekcji (po id) i nadpisanymi polami kursu. */
export function kursZ(nadpisz: Partial<OdczytKursu> = {}): OdczytKursu {
  return { ...KURS, ...nadpisz };
}

/** Nieskończenie długo wiszące zapytanie (stan ładowania). */
export function wiszace<T>(): Promise<T> {
  return new Promise(() => {});
}
