import type { ReactNode } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import style from "./KartaNastepnegoKroku.module.css";

interface WlasciwosciKartaNastepnegoKroku {
  /** Mała etykieta nad nagłówkiem, zapisana zdaniem („Następny krok”, „Do zrobienia dziś”);
   * wersaliki robi wyłącznie CSS. */
  etykieta: string;
  /** Treść nagłówka h2. Pomiń w stanie ładowania — karta ma wtedy tylko etykietę i `children`. */
  naglowek?: string;
  /** Zdanie pod nagłówkiem albo stan szkieletu/błędu. */
  children?: ReactNode;
}

/**
 * Karta następnego kroku `KartaNastepnegoKroku` (M20): jedna biała karta z cieniem
 * na pulpitach uczestnika, studenta i prowadzącego (makieta 2.0.4, `.hero`):
 * mała etykieta, pod nią h2 i jedno zdanie. Karta nie niesie przycisku głównego —
 * ten stoi w nagłówku strony. Poniżej 640 px zajmuje całą szerokość obszaru treści,
 * bez bocznych ramek i zaokrąglenia.
 */
export function KartaNastepnegoKroku({ etykieta, naglowek, children }: WlasciwosciKartaNastepnegoKroku) {
  return (
    <section className={style.karta} data-karta="nastepny-krok">
      <p className={style.etykieta}>{etykieta}</p>
      {naglowek !== undefined && <Heading stopien={2}>{naglowek}</Heading>}
      {children !== undefined && <div className={style.tresc}>{children}</div>}
    </section>
  );
}
