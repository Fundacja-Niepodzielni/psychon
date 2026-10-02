"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AdminCertificate } from "@/lib/h13/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { KOMUNIKAT_BRAKU_POWODU, wyslijUniewaznienie } from "./dane";
import style from "./OknoUniewaznienia.module.css";

export const ID_POLA_POWODU = "uniewaznienie-powod";

const SELEKTOR_FOKUSOWALNYCH =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface WlasciwosciOknaUniewaznienia {
  certyfikat: AdminCertificate;
  /** Rezygnacja (przycisk „Anuluj”, Escape) — nie w czasie zapisu. */
  onZamknij: () => void;
  /** Serwer przyjął unieważnienie; okno samo się nie zamyka — robi to ekran. */
  onUniewazniono: (certyfikat: AdminCertificate) => void;
}

function imieNazwisko(certyfikat: AdminCertificate): string | null {
  return certyfikat.user === null ? null : `${certyfikat.user.first_name} ${certyfikat.user.last_name}`;
}

/**
 * Okno potwierdzenia unieważnienia certyfikatu — `POST /admin/certificates/{id}/revoke`
 * z ciałem `{ reason }`. Powód jest obowiązkowy: pusty (po przycięciu) kończy się
 * błędem pola i żadnym żądaniem; powód odrzucony przez serwer staje pod polem,
 * każdy inny błąd — w oknie, które zostaje otwarte. Okno mówi wprost, że
 * unieważnienia nie da się cofnąć, i prosi o powód rzeczowy, bez informacji
 * o zdrowiu.
 *
 * Fokus po otwarciu idzie na nagłówek okna (nigdy na przycisk potwierdzenia),
 * Tab krąży po elementach okna (też wstecz od nagłówka), Escape rezygnuje.
 * Potwierdzenie to przycisk obrysowany z czerwonym napisem (przycisk główny
 * z wariantem „niebezpieczny” daje czerwony napis na zielonym tle — kontrast
 * 1,2:1 zmierzony w przeglądarce). W czasie zapisu jest oznaczony jako
 * niedostępny (`aria-disabled`, zamiast `disabled`, żeby nie tracić fokusu),
 * nie wysyła drugiego żądania, a rezygnacja jest zablokowana. Fokus po
 * zamknięciu oddaje ekran, który okno otworzył.
 */
export function OknoUniewaznienia({ certyfikat, onZamknij, onUniewazniono }: WlasciwosciOknaUniewaznienia) {
  const idNaglowka = useId();
  const idOpisu = useId();
  const okno = useRef<HTMLDivElement>(null);
  const [powod, setPowod] = useState("");
  const [bladPola, setBladPola] = useState<string | undefined>(undefined);
  const [bladOkna, setBladOkna] = useState<string | null>(null);
  const [wysylanie, setWysylanie] = useState(false);
  const osoba = imieNazwisko(certyfikat);

  useEffect(() => {
    okno.current?.querySelector<HTMLElement>("h2")?.focus();
  }, []);

  useEffect(() => {
    function naKlawisz(zdarzenie: KeyboardEvent) {
      if (zdarzenie.key === "Escape") {
        zdarzenie.preventDefault();
        if (!wysylanie) onZamknij();
        return;
      }
      if (zdarzenie.key !== "Tab") return;
      const kontener = okno.current;
      if (!kontener) return;
      const fokusowalne = Array.from(kontener.querySelectorAll<HTMLElement>(SELEKTOR_FOKUSOWALNYCH));
      if (fokusowalne.length === 0) return;
      const pierwszy = fokusowalne[0];
      const ostatni = fokusowalne[fokusowalne.length - 1];
      const aktywny = document.activeElement as HTMLElement | null;
      const naNaglowku = aktywny !== null && aktywny === kontener.querySelector("h2");
      if (zdarzenie.shiftKey) {
        if (naNaglowku || aktywny === pierwszy || !kontener.contains(aktywny)) {
          zdarzenie.preventDefault();
          ostatni.focus();
        }
      } else if (aktywny === ostatni || !kontener.contains(aktywny)) {
        zdarzenie.preventDefault();
        pierwszy.focus();
      }
    }
    document.addEventListener("keydown", naKlawisz);
    return () => document.removeEventListener("keydown", naKlawisz);
  }, [onZamknij, wysylanie]);

  async function potwierdz() {
    if (wysylanie) return;
    const tekst = powod.trim();
    setBladOkna(null);
    if (tekst === "") {
      setBladPola(KOMUNIKAT_BRAKU_POWODU);
      document.getElementById(ID_POLA_POWODU)?.focus();
      return;
    }
    setBladPola(undefined);
    setWysylanie(true);
    const wynik = await wyslijUniewaznienie(certyfikat.id, tekst);
    setWysylanie(false);
    if (wynik.rodzaj === "ok") {
      onUniewazniono(certyfikat);
    } else if (wynik.rodzaj === "blad-pola") {
      setBladPola(wynik.komunikat);
      document.getElementById(ID_POLA_POWODU)?.focus();
    } else {
      setBladOkna(wynik.komunikat);
    }
  }

  return (
    <div className={style.przeslona}>
      <div ref={okno} className={style.okno} role="dialog" aria-modal="true" aria-labelledby={idNaglowka} aria-describedby={idOpisu}>
        <Heading stopien={2} id={idNaglowka}>
          Unieważnić certyfikat?
        </Heading>
        <div className={style.tresc}>
          <div id={idOpisu} className={style.opis}>
            <Text>{osoba === null ? `Certyfikat ${certyfikat.number}.` : `Certyfikat ${certyfikat.number}, ${osoba}.`}</Text>
            <Text>Unieważnienia nie da się cofnąć. Publiczna weryfikacja numeru pokaże, że certyfikat jest unieważniony.</Text>
          </div>
          {bladOkna !== null && (
            <Notice wariant="error" tytul="Certyfikat nie został unieważniony">
              {bladOkna}
            </Notice>
          )}
          <Field
            id={ID_POLA_POWODU}
            etykieta="Powód unieważnienia"
            rodzaj="wieloliniowy"
            wymagane
            wartosc={powod}
            onZmiana={setPowod}
            blad={bladPola}
            podpowiedz="Pisz rzeczowo, bez informacji o zdrowiu."
          />
        </div>
        <span role="status" className={style.ukryte}>
          {wysylanie ? "Trwa zapisywanie." : ""}
        </span>
        <div className={style.przyciski}>
          <Button poziom="quiet" disabled={wysylanie} onClick={onZamknij}>
            Anuluj
          </Button>
          <Button poziom="outline" niebezpieczny aria-disabled={wysylanie ? true : undefined} onClick={() => void potwierdz()}>
            {wysylanie ? "Zapisywanie…" : "Unieważnij certyfikat"}
          </Button>
        </div>
      </div>
    </div>
  );
}
