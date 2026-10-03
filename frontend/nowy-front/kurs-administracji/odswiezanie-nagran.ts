"use client";

import { useEffect, useRef } from "react";
import { pobierzStanNagrania, type StanNagrania } from "@/nowy-front/lekcja-edycja/dane";

/** Najkrótszy odstęp między dwoma pytaniami o stan nagrania tej samej lekcji. */
export const ODSTEP_PYTAN_MS = 30_000;

function kartaWidoczna(): boolean {
  return document.visibilityState !== "hidden";
}

/**
 * Pyta serwer o stan nagrania wskazanych lekcji — tych, których nagranie jest
 * wysyłane albo przetwarzane. Każdą lekcję nie częściej niż co 30 sekund
 * i tylko wtedy, gdy karta przeglądarki jest widoczna; po powrocie do karty
 * pyta o lekcje, którym odstęp już minął. O lekcje spoza listy nie pyta wcale:
 * gdy lekcja z niej znika, pytania o nią ustają.
 *
 * `pobierz` — odczyt stanu z grupy tras ekranu (domyślnie administracja).
 */
export function useOdswiezanieNagran(
  idLekcjiWDrodze: number[],
  onStan: (idLekcji: number, stan: StanNagrania) => void,
  pobierz: (idLekcji: number) => Promise<StanNagrania> = pobierzStanNagrania,
): void {
  const ostatniePytanie = useRef(new Map<number, number>());
  const odbiorca = useRef(onStan);
  const odczyt = useRef(pobierz);
  const zamontowany = useRef(true);
  const klucz = idLekcjiWDrodze.join(",");

  useEffect(() => {
    odbiorca.current = onStan;
    odczyt.current = pobierz;
  });

  useEffect(() => {
    zamontowany.current = true;
    return () => {
      zamontowany.current = false;
    };
  }, []);

  useEffect(() => {
    const lekcje = klucz === "" ? [] : klucz.split(",").map(Number);
    if (lekcje.length === 0) return;
    let czasomierz: number | undefined;
    let trwa = true;

    function termin(idLekcji: number): number {
      const ostatnie = ostatniePytanie.current.get(idLekcji);
      return ostatnie === undefined ? 0 : ostatnie + ODSTEP_PYTAN_MS;
    }

    function obieg() {
      if (!trwa) return;
      window.clearTimeout(czasomierz);
      // Karta w tle: nic nie pyta i nic nie planuje; wznowi ją powrót do karty.
      if (!kartaWidoczna()) return;
      const teraz = Date.now();
      for (const idLekcji of lekcje) {
        if (teraz < termin(idLekcji)) continue;
        ostatniePytanie.current.set(idLekcji, teraz);
        odczyt.current(idLekcji)
          .then((stan) => {
            if (zamontowany.current) odbiorca.current(idLekcji, stan);
          })
          // Brak odpowiedzi nie zmienia ekranu; następne pytanie po pełnym odstępie.
          .catch(() => {});
      }
      const najblizszy = Math.min(...lekcje.map(termin));
      czasomierz = window.setTimeout(obieg, Math.max(0, najblizszy - Date.now()));
    }

    function poZmianieWidocznosci() {
      if (kartaWidoczna()) obieg();
    }

    obieg();
    document.addEventListener("visibilitychange", poZmianieWidocznosci);
    return () => {
      trwa = false;
      window.clearTimeout(czasomierz);
      document.removeEventListener("visibilitychange", poZmianieWidocznosci);
    };
  }, [klucz]);
}
