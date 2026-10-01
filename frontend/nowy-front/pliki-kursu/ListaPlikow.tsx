"use client";

import { useId, useRef, useState } from "react";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { ListRow } from "@/design-system/molekuly/ListRow/ListRow";
import { opisPliku } from "@/nowy-front/lekcja-edycja/nagranie";
import { pobierzPlik, type PlikKursu } from "./dane";
import style from "./PlikiKursu.module.css";

export const ZDANIE_BLEDU_POBRANIA = "Nie udało się pobrać pliku. Spróbuj ponownie za chwilę.";

interface WlasciwosciListaPlikow {
  pliki: PlikKursu[];
  /**
   * Ponowne pobranie danych kursu z listą plików (świeże linki). Bez niego
   * wygasły link kończy się zdaniem błędu przy pliku, bez ponownej próby.
   */
  odswiez?: () => Promise<PlikKursu[] | null>;
}

/**
 * Lista plików: wiersz na plik (nazwa, rodzaj i rozmiar, przycisk „Pobierz”).
 * Nazwa pliku to zwykły tekst (React nie interpretuje jej jako HTML). Pobranie
 * idzie przez `pobierzPlik`; porażka daje zdanie błędu przy tym pliku, a nie
 * błąd całego ekranu. W trakcie pobierania kolejne kliknięcie tego samego
 * pliku nic nie robi.
 */
export function ListaPlikow({ pliki, odswiez }: WlasciwosciListaPlikow) {
  const przedrostek = useId();
  const [stany, setStany] = useState<Record<number, "trwa" | "blad">>({});
  const wTrakcie = useRef(new Set<number>());

  async function pobierz(plik: PlikKursu) {
    if (wTrakcie.current.has(plik.id)) return;
    wTrakcie.current.add(plik.id);
    setStany((poprzednie) => ({ ...poprzednie, [plik.id]: "trwa" }));
    const wynik = await pobierzPlik(plik, odswiez);
    wTrakcie.current.delete(plik.id);
    setStany((poprzednie) => {
      const nastepne = { ...poprzednie };
      if (wynik === "blad") nastepne[plik.id] = "blad";
      else delete nastepne[plik.id];
      return nastepne;
    });
  }

  return (
    <ul className={style.lista}>
      {pliki.map((plik) => {
        const stan = stany[plik.id];
        return (
          <li key={plik.id} className={style.plik}>
            <ListRow
              wariant="material"
              tytul={plik.name}
              podpowiedz={opisPliku(plik.name, plik.size) || undefined}
              akcja={{
                etykieta: "Pobierz",
                etykietaDostepna: `Pobierz plik: ${plik.name}`,
                onKliknij: () => void pobierz(plik),
                wygladOdnosnika: true,
              }}
            />
            {stan === "trwa" && (
              <div className={style.stan}>
                <Hint>Pobieranie…</Hint>
              </div>
            )}
            {stan === "blad" && (
              <div className={style.stan}>
                <ErrorText id={`${przedrostek}-blad-${plik.id}`}>{ZDANIE_BLEDU_POBRANIA}</ErrorText>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
