"use client";

import { useEffect, useRef } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { SCIEZKA_DZIENNIKA, zdanieBezZmian, zdanieWyniku, type WynikPrzypisania as Wynik } from "./wybor";
import style from "./WynikPrzypisania.module.css";

interface WlasciwosciWynikuPrzypisania {
  wynik: Wynik;
}

/**
 * Potwierdzenie po przypisaniu: „Przypisano X z N osób.”, odnośnik „Pokaż
 * dziennik działań” i — gdy coś się nie udało — lista osób z prostym powodem
 * (te osoby zostają zaznaczone). Po zamknięciu okna fokus przechodzi tutaj:
 * przycisk, z którego okno otwarto, mógł zniknąć razem z zaznaczeniem.
 * Sekcja ma nagłówek `h2` tylko dla czytnika, żeby tytuł komunikatu (`h3`)
 * nie przeskakiwał stopnia pod `h1` ekranu.
 */
export function WynikPrzypisania({ wynik }: WlasciwosciWynikuPrzypisania) {
  const wezel = useRef<HTMLElement>(null);

  useEffect(() => {
    wezel.current?.focus();
  }, [wynik]);

  const nieudane = wynik.nieudane.length > 0;
  const zdania = [
    zdanieBezZmian(wynik),
    nieudane
      ? "Osoby, których nie udało się przypisać, zostały zaznaczone."
      : "Zaznaczenie zostało wyczyszczone.",
  ].filter((zdanie): zdanie is string => zdanie !== null);

  return (
    <section ref={wezel} className={style.wynik} tabIndex={-1} aria-labelledby="osoby-wynik-przypisania">
      <div className={style.ukryte}>
        <Heading stopien={2} id="osoby-wynik-przypisania">
          Wynik przypisania
        </Heading>
      </div>
      <Notice
        wariant={nieudane ? "warn" : "ok"}
        tytul={zdanieWyniku(wynik)}
        akcja={<Link href={SCIEZKA_DZIENNIKA}>Pokaż dziennik działań</Link>}
      >
        {zdania.join(" ")}
      </Notice>
      {nieudane && (
        <div className={style.nieudane}>
          <Text>Nie przypisano:</Text>
          <ul className={style.lista}>
            {wynik.nieudane.map((osoba) => (
              <li key={osoba.id}>
                {osoba.nazwa}: {osoba.powod}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
