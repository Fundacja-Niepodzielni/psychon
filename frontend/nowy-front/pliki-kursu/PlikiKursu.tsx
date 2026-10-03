"use client";

import { useId } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { adresLekcji } from "@/nowy-front/lekcja/adres";
import { grupujPliki } from "./grupuj";
import { ListaPlikow } from "./ListaPlikow";
import type { LekcjaKursuPlikow, PlikKursu } from "./dane";
import style from "./PlikiKursu.module.css";

interface WlasciwosciPlikiKursu {
  /** Slug kursu; trafia do linków do lekcji (`?kurs=`), z których lekcja bierze swoje pliki. */
  slugKursu: string;
  /** `lessons` z `GET /courses/{slug}`. */
  lekcje: LekcjaKursuPlikow[];
  /** `materials` z `GET /courses/{slug}`. */
  pliki: PlikKursu[];
  /** Ponowne pobranie danych kursu (świeże linki) przy wygasłym linku pobrania. */
  odswiez?: () => Promise<PlikKursu[] | null>;
}

/**
 * Sekcja „Pliki do pobrania” na stronie kursu uczestnika: lista pogrupowana
 * według lekcji w kolejności lekcji (nagłówek grupy = numer i tytuł lekcji z
 * linkiem do niej). Pliki są tylko w lekcjach: plik bez lekcji nie jest
 * pokazywany. Kurs bez plików lekcji: komponent nic nie renderuje — sekcji nie ma.
 */
export function PlikiKursu({ slugKursu, lekcje, pliki, odswiez }: WlasciwosciPlikiKursu) {
  const idNaglowka = useId();
  const grupy = grupujPliki(lekcje, pliki);
  if (grupy.length === 0) return null;

  return (
    <section className={style.sekcja} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Pliki do pobrania
      </Heading>
      {grupy.map((grupa) => (
        <div key={grupa.klucz} className={style.grupa}>
          <Heading stopien={3}>
            <span className={style.naglowekGrupy}>
              <Link href={adresLekcji(grupa.lekcja.id, slugKursu)}>
                Lekcja {grupa.lekcja.numer}. {grupa.lekcja.tytul}
              </Link>
            </span>
          </Heading>
          <ListaPlikow pliki={grupa.pliki} odswiez={odswiez} />
        </div>
      ))}
    </section>
  );
}
