"use client";

import { useId, type ReactNode } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import {
  adresSpotkania,
  nazwaTerminu,
  OBECNOSC,
  plakietkaTerminu,
  powodBlokady,
  tekstMinut,
  tekstWolnychMiejsc,
  tekstZajetych,
  type TerminSuperwizji,
} from "./dane";
import style from "./SuperwizjaUczestnika.module.css";

interface WlasciwosciKartyTerminu {
  termin: TerminSuperwizji;
  /** Zapis na ten termin jest następnym krokiem ekranu — przycisk zielony. */
  glowny: boolean;
  /** Trwa zapis albo wypis tego terminu. */
  trwa: "zapis" | "wypis" | null;
  /** Nieudany zapis albo wypis tego terminu: którą akcję próbowano i co odpowiedział serwer. */
  blad: { akcja: "zapis" | "wypis"; tresc: string } | undefined;
  onZapis: () => void;
  onWypis: () => void;
}

/**
 * Karta jednego terminu: data z godziną (nagłówek), plakietka stanu, czas
 * trwania, miejsce albo odnośnik do spotkania, wolne miejsca (przyszły termin
 * bez zapisu) albo obecność (przyszły termin z zapisem; na minionym mówi o niej
 * sama plakietka), zajęte miejsca przy każdym terminie i jeden przycisk — „Zapisz
 * się” albo „Wypisz się”. Wyłączony przycisk ma zawsze zdanie z powodem,
 * powiązane z nim przez `aria-describedby`.
 */
export function KartaTerminu({ termin, glowny, trwa, blad, onZapis, onWypis }: WlasciwosciKartyTerminu) {
  const idTytulu = useId();
  const idPowodu = useId();
  const nazwa = nazwaTerminu(termin);
  const plakietka = plakietkaTerminu(termin);
  const powod = powodBlokady(termin);
  const maZapis = termin.signup !== null;
  const adres = adresSpotkania(termin.location_or_link);

  const etykieta = maZapis ? (trwa === "wypis" ? "Wypisywanie…" : "Wypisz się") : trwa === "zapis" ? "Zapisywanie…" : "Zapisz się";
  const nazwaDostepna = maZapis ? `${etykieta.replace("…", "")} z terminu ${nazwa}` : `${etykieta.replace("…", "")} na termin ${nazwa}`;

  return (
    <li data-termin={termin.id}>
      <article className={style.karta} aria-labelledby={idTytulu}>
        <div className={style.naglowekKarty}>
          <Heading stopien={3} id={idTytulu}>
            {nazwa}
          </Heading>
          <Badge wariant={plakietka.wariant}>{plakietka.tekst}</Badge>
        </div>
        <dl className={style.dane}>
          <Para nazwa="Czas trwania">
            <Text>{tekstMinut(termin.duration_minutes)}</Text>
          </Para>
          <Para nazwa="Miejsce lub link">
            {adres !== null ? (
              <Link href={adres} aria-label={`Dołącz do spotkania ${nazwa}`}>
                Dołącz do spotkania
              </Link>
            ) : (
              <Text>{termin.location_or_link?.trim() ? termin.location_or_link : "Bez podanej lokalizacji."}</Text>
            )}
          </Para>
          {/* Na minionym terminie obecność mówi sama plakietka — bez powtórzenia w danych karty. */}
          {maZapis && termin.can_sign_up && (
            <Para nazwa="Obecność">
              <Text>{OBECNOSC[termin.signup?.attendance ?? "brak"].tekst}</Text>
            </Para>
          )}
          {!maZapis && termin.can_sign_up && (
            <Para nazwa="Wolne miejsca">
              <Text>{termin.is_full ? "Brak wolnych miejsc" : tekstWolnychMiejsc(termin.available_seats)}</Text>
            </Para>
          )}
          {/* Zajęte miejsca przy każdym terminie, jak na starym ekranie („Zapisane osoby”). */}
          <Para nazwa="Zajęte miejsca">
            <Text>{tekstZajetych(termin)}</Text>
          </Para>
        </dl>
        <div className={style.akcje}>
          <Button
            poziom={glowny && !maZapis ? "primary" : "outline"}
            niebezpieczny={maZapis}
            disabled={powod !== null}
            aria-label={nazwaDostepna}
            aria-describedby={powod !== null ? idPowodu : undefined}
            onClick={() => {
              if (trwa !== null) return;
              if (maZapis) onWypis();
              else onZapis();
            }}
          >
            {etykieta}
          </Button>
          {powod !== null && <Hint id={idPowodu}>{powod}</Hint>}
          {blad && (
            <Notice wariant="error" tytul={blad.akcja === "wypis" ? "Nie udało się wypisać z terminu" : "Nie udało się zapisać na termin"}>
              {blad.tresc}
            </Notice>
          )}
        </div>
      </article>
    </li>
  );
}

function Para({ nazwa, children }: { nazwa: string; children: ReactNode }) {
  return (
    <div className={style.para}>
      <dt>
        <Hint>{nazwa}</Hint>
      </dt>
      <dd className={style.wartosc}>{children}</dd>
    </div>
  );
}
