"use client";

import { useEffect, useRef } from "react";
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
 */
export function WynikPrzypisania({ wynik }: WlasciwosciWynikuPrzypisania) {
  const wezel = useRef<HTMLDivElement>(null);

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
    <div ref={wezel} className={style.wynik} tabIndex={-1} aria-label="Wynik przypisania" role="group">
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
    </div>
  );
}
