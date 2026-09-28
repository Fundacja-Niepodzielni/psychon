"use client";

import { useEffect } from "react";
import { Button } from "../../atomy/Button/Button";
import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import style from "./Toast.module.css";

interface OdnosnikDziennika {
  href: string;
  etykieta: string;
}

interface WlasciwosciToast {
  komunikat: string;
  /** Obecność tej funkcji przełącza zachowanie: z akcją Toast NIE znika sam. */
  onCofnij?: () => void;
  onZamknij: () => void;
  odnosnikDziennika?: OdnosnikDziennika;
}

/**
 * Powiadomienie `Toast` (M15). Z atomów `Text` + `Button` `quiet` „Cofnij" +
 * zamknięcie. Bez akcji znika samo po 8 s; z akcją „Cofnij" czeka na decyzję
 * i NIE znika automatycznie (KO-5 — wyjście z akcją niezapisaną pyta, tu
 * odpowiednik: akcja do cofnięcia nie może zniknąć bez śladu).
 *
 * Zamknięcie renderowane jako tekstowy znak „×" w `Button` `quiet`, NIE jako
 * `Icon` — mapa glifów `Icon` (A12) ma zamkniętą listę 13 nazw (home, book,
 * clock, users, file, award, chat, inbox, chart, cog, help, user, out) i nie
 * zawiera zamknięcia/krzyżyka. Brakujący atom zgłoszony w piśmie zdawczym,
 * nie dorobiony po cichu.
 */
export function Toast({ komunikat, onCofnij, onZamknij, odnosnikDziennika }: WlasciwosciToast) {
  useEffect(() => {
    if (onCofnij) return; // z akcją czeka — nie znika samo
    const czasomierz = setTimeout(onZamknij, 8000);
    return () => clearTimeout(czasomierz);
  }, [onCofnij, onZamknij]);

  return (
    <div role="status" className={style.powiadomienie}>
      <Text>{komunikat}</Text>
      {odnosnikDziennika && (
        <Link wariant="tlo-odwrocone" href={odnosnikDziennika.href} data-testid="toast-odnosnik-dziennika">
          {odnosnikDziennika.etykieta}
        </Link>
      )}
      {onCofnij && (
        <Button poziom="quiet" onClick={onCofnij} data-testid="toast-cofnij">
          Cofnij
        </Button>
      )}
      <Button poziom="quiet" onClick={onZamknij} aria-label="Zamknij powiadomienie" data-testid="toast-zamknij">
        <span aria-hidden="true">×</span>
      </Button>
    </div>
  );
}
