"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { RecordingPlayer, type PostepNagrania } from "@/design-system/organizmy/RecordingPlayer/RecordingPlayer";
import type { ZrodloNagrania } from "../dane";
import { numerMinuty } from "../stan";
import style from "./OdtwarzaczNagrania.module.css";

/**
 * JEDYNE miejsce ekranu lekcji, w którym stoi odtwarzacz nagrania: cienka
 * obudowa wokół organizmu `RecordingPlayer` (ramka dostawcy). Ekran nie zna
 * niczego, co leży za tym punktem — dostaje jeden komponent z jednym zestawem
 * właściwości.
 *
 * Co z czego wynika:
 * - adres ramki i jego wygaśnięcie: wyłącznie z odczytu linku nagrania
 *   (`zrodlo.adresOsadzenia`, `zrodlo.osadzenieWygasaO`). Adres, którego
 *   pochodzenia organizm nie uzna za odtwarzacz dostawcy, nie tworzy ramki, tylko
 *   `onBlad`;
 * - czas oglądania i czas aktywny: wyłącznie z komunikatów ramki (`onPostep`).
 *   Obudowa nie ma żadnego zegara. Koniec nagrania (`ended`) nie jest tu
 *   przekazywany dalej: nie kończy lekcji i niczego nie zapisuje — ukończenie
 *   zostaje przy czasie aktywnym i przycisku ekranu;
 * - nowy adres po wygaśnięciu: organizm prosi o niego raz na adres, obudowa
 *   pyta warstwę danych (`odswiezLink`) najwyżej jednym zapytaniem naraz i nie
 *   przyjmuje odpowiedzi, która nie ma adresu albo jest już po terminie — wtedy
 *   nie ma pętli, jest `onBlad`. Działająca ramka nie jest przy tym przerywana:
 *   błąd odświeżenia zgłaszamy dopiero, gdy odtwarzanie stanie.
 *
 * Wznowienie: gdy z odczytu lekcji wynika pozycja większa od zera, nagranie
 * rusza od niej, a nad ramką stoi zdanie o miejscu przerwania z możliwością
 * odtworzenia od początku (nowa ramka od zera).
 */
export interface WlasciwosciOdtwarzaczaNagrania {
  tytul: string;
  zrodlo: ZrodloNagrania;
  czasTrwaniaSekund: number;
  pozycjaStartowaSekundy: number;
  /** Nowy link nagrania z warstwy danych; `null` = nie udało się. */
  odswiezLink: () => Promise<ZrodloNagrania | null>;
  onPostep: (postep: PostepNagrania) => void;
  onZmianaOdtwarzania: (odtwarza: boolean) => void;
  /** Powrót do początku nagrania na prośbę osoby. */
  onZmianaPozycji?: (pozycjaSekund: number) => void;
  onBlad: () => void;
}

/** Czas uniksowy (sekundy) z odczytu linku jako ISO 8601 albo `undefined`, gdy go nie ma lub jest nieczytelny. */
function wygasaJakoIso(sekundy: number | undefined): string | undefined {
  if (typeof sekundy !== "number" || !Number.isFinite(sekundy)) return undefined;
  const chwila = new Date(sekundy * 1000);
  return Number.isNaN(chwila.getTime()) ? undefined : chwila.toISOString();
}

export function OdtwarzaczNagrania({
  tytul,
  zrodlo,
  czasTrwaniaSekund,
  pozycjaStartowaSekundy,
  odswiezLink,
  onPostep,
  onZmianaOdtwarzania,
  onZmianaPozycji,
  onBlad,
}: WlasciwosciOdtwarzaczaNagrania) {
  const [biezace, setBiezace] = useState(zrodlo);
  const [odPoczatku, setOdPoczatku] = useState(0);
  const [wznowienie, setWznowienie] = useState(pozycjaStartowaSekundy > 0);
  const pytaRef = useRef(false);
  const odtwarzaRef = useRef(false);
  const nieudaneOdswiezenieRef = useRef(false);
  const zamontowanaRef = useRef(true);

  useEffect(() => {
    zamontowanaRef.current = true;
    return () => {
      zamontowanaRef.current = false;
    };
  }, []);

  const zawiodlo = useCallback(() => {
    // Gra: nie przerywamy; zgłosimy, gdy odtwarzanie stanie (wtedy ramka bez ważnego adresu i tak nie ruszy ponownie).
    if (odtwarzaRef.current) nieudaneOdswiezenieRef.current = true;
    else onBlad();
  }, [onBlad]);

  const naProsbeONowyAdres = useCallback(() => {
    if (pytaRef.current) return;
    pytaRef.current = true;
    void odswiezLink().then((nowe) => {
      pytaRef.current = false;
      if (!zamontowanaRef.current) return;
      const wygasa = wygasaJakoIso(nowe?.osadzenieWygasaO);
      const poTerminie = wygasa !== undefined && Date.parse(wygasa) <= Date.now();
      if (nowe === null || nowe.adresOsadzenia === undefined || poTerminie) {
        zawiodlo();
        return;
      }
      setBiezace(nowe);
    });
  }, [odswiezLink, zawiodlo]);

  const naZmianeOdtwarzania = useCallback(
    (odtwarza: boolean) => {
      odtwarzaRef.current = odtwarza;
      if (odtwarza) setWznowienie(false);
      onZmianaOdtwarzania(odtwarza);
      if (!odtwarza && nieudaneOdswiezenieRef.current) {
        nieudaneOdswiezenieRef.current = false;
        onBlad();
      }
    },
    [onZmianaOdtwarzania, onBlad],
  );

  function zacznijOdPoczatku() {
    setWznowienie(false);
    setOdPoczatku((numer) => numer + 1);
    onZmianaPozycji?.(0);
  }

  const minuta = numerMinuty(pozycjaStartowaSekundy);
  const pozycjaRamki = odPoczatku > 0 ? 0 : pozycjaStartowaSekundy;

  return (
    <div className={style.obudowa}>
      {wznowienie && (
        <div className={style.wznowienie}>
          <span>{`Ostatnio zatrzymano w ${minuta}. minucie. Nagranie ruszy od tego miejsca.`}</span>
          <Button poziom="outline" onClick={zacznijOdPoczatku}>
            Odtwórz od początku
          </Button>
        </div>
      )}
      <RecordingPlayer
        key={odPoczatku}
        tytul={tytul}
        adresRamki={biezace.adresOsadzenia ?? ""}
        adresWygasa={wygasaJakoIso(biezace.osadzenieWygasaO)}
        pozycjaStartowaSekund={pozycjaRamki}
        czasTrwaniaSekund={czasTrwaniaSekund}
        onPostep={onPostep}
        onZmianaOdtwarzania={naZmianeOdtwarzania}
        onBlad={onBlad}
        onOdswiezAdres={naProsbeONowyAdres}
      />
    </div>
  );
}
