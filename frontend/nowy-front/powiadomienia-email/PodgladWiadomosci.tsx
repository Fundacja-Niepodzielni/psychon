"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { formatujDateICzas } from "../wspolne/daty";
import type { WiadomoscEmail } from "./dane";
import style from "./PodgladWiadomosci.module.css";

export const ETYKIETY_STATUSU_WIADOMOSCI: Record<WiadomoscEmail["status"], string> = {
  queued: "W kolejce",
  sent: "Wysłany",
  failed: "Nieudany",
  simulated: "Symulowany",
};

export const WARIANTY_STATUSU_WIADOMOSCI: Record<WiadomoscEmail["status"], "neutral" | "ok" | "error" | "pending"> = {
  queued: "pending",
  sent: "ok",
  failed: "error",
  simulated: "neutral",
};

/** Czas wiersza i podglądu: `sent_at`, a gdy go nie ma — chwila utworzenia wiadomości. */
export function czasWiadomosci(wiadomosc: WiadomoscEmail): string {
  return formatujDateICzas(wiadomosc.sent_at ?? wiadomosc.created_at);
}

interface WlasciwosciPodgladu {
  wiadomosc: WiadomoscEmail;
  /** Gotowy opis nadawcy (`Nazwa <adres>`) albo zdanie o jego braku. */
  nadawca: string;
  onZamknij: () => void;
}

const ELEMENTY_FOKUSOWALNE = 'button:not([disabled]), iframe, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Okno podglądu wysłanej wiadomości (tylko do odczytu). Treść `body_html`
 * trafia wyłącznie do ramki `iframe` z pustym `sandbox` (bez żadnych zezwoleń:
 * ani skryptów, ani tego samego pochodzenia) przez `srcDoc` — nigdy do drzewa ekranu, więc
 * skrypt ani obsługa zdarzeń z treści się nie wykona. Esc i przycisk
 * „Zamknij podgląd” zamykają okno; fokus wraca do przycisku, który je otworzył.
 */
export function PodgladWiadomosci({ wiadomosc, nadawca, onZamknij }: WlasciwosciPodgladu) {
  const oknoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wywolanyPrzez = document.activeElement as HTMLElement | null;
    oknoRef.current?.focus();

    function obsluzKlawisz(zdarzenie: KeyboardEvent) {
      if (zdarzenie.key === "Escape") {
        onZamknij();
        return;
      }
      if (zdarzenie.key !== "Tab" || !oknoRef.current) return;
      const elementy = Array.from(oknoRef.current.querySelectorAll<HTMLElement>(ELEMENTY_FOKUSOWALNE));
      if (elementy.length === 0) return;
      const pierwszy = elementy[0];
      const ostatni = elementy[elementy.length - 1];
      const aktywny = document.activeElement;
      if (zdarzenie.shiftKey && (aktywny === pierwszy || aktywny === oknoRef.current)) {
        zdarzenie.preventDefault();
        ostatni.focus();
      } else if (!zdarzenie.shiftKey && aktywny === ostatni) {
        zdarzenie.preventDefault();
        pierwszy.focus();
      }
    }
    window.addEventListener("keydown", obsluzKlawisz);

    return () => {
      window.removeEventListener("keydown", obsluzKlawisz);
      wywolanyPrzez?.focus();
    };
  }, [onZamknij]);

  return (
    <div className={style.przeslona} onClick={onZamknij}>
      <div
        ref={oknoRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Podgląd wiadomości — ${wiadomosc.subject}`}
        tabIndex={-1}
        className={style.okno}
        onClick={(zdarzenie) => zdarzenie.stopPropagation()}
      >
        <div className={style.naglowek}>
          <div className={style.tytul}>
            <Heading stopien={2}>{wiadomosc.subject}</Heading>
            <Badge wariant={WARIANTY_STATUSU_WIADOMOSCI[wiadomosc.status]}>{ETYKIETY_STATUSU_WIADOMOSCI[wiadomosc.status]}</Badge>
          </div>
          <Button poziom="outline" onClick={onZamknij} aria-label="Zamknij podgląd">
            Zamknij
          </Button>
        </div>

        <dl className={style.dane}>
          <dt>Od:</dt>
          <dd>{nadawca}</dd>
          <dt>Do:</dt>
          <dd>{wiadomosc.to_email}</dd>
          <dt>Wysłano:</dt>
          <dd>{czasWiadomosci(wiadomosc)}</dd>
        </dl>

        <div className={style.tresc}>
          {wiadomosc.body_html ? (
            <iframe title="Treść wiadomości" sandbox="" srcDoc={wiadomosc.body_html} className={style.ramka} />
          ) : (
            <Text wariant="pusty">Brak treści.</Text>
          )}
        </div>
      </div>
    </div>
  );
}
