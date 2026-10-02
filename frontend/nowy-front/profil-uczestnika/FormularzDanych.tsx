"use client";

import { useEffect, useId, useRef, type FormEvent } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { ETYKIETY_POL, idPola, polaZBledem, type BladZapisu, type Formularz, type KluczPola } from "./formularz";
import { PoleProfilu } from "./PoleProfilu";
import style from "./ProfilUczestnika.module.css";

/** Identyfikator przycisku zapisu — tu wraca fokus, gdy znika potwierdzenie zapisu. */
export const ID_PRZYCISKU_ZAPISU = "profil-zapisz";

interface WlasciwosciFormularzaDanych {
  formularz: Formularz;
  /** Adres e-mail — tylko do odczytu, zmienia go administracja. */
  email: string;
  zapisywanie: boolean;
  /** Błąd ostatniego zapisu; `numer` rośnie przy każdym kolejnym błędzie, żeby fokus wracał na podsumowanie także przy tym samym komunikacie. */
  blad: (BladZapisu & { numer: number }) | null;
  onZmiana: (klucz: KluczPola, wartosc: string) => void;
  onZapisz: () => void;
}

/**
 * Karta „Dane osobowe”: formularz z widocznymi etykietami nad polami, błędami pod polami
 * i podsumowaniem błędów na górze (z odnośnikami do pól). Po błędzie fokus trafia na
 * podsumowanie. Reguł walidacji w przeglądarce nie ma — tak jak na starej stronie
 * wszystkie sprawdza serwer, a ekran pokazuje jego komunikaty (`noValidate`).
 */
export function FormularzDanych({ formularz, email, zapisywanie, blad, onZmiana, onZapisz }: WlasciwosciFormularzaDanych) {
  const idNaglowka = useId();
  const podsumowanie = useRef<HTMLDivElement>(null);
  const numerBledu = blad?.numer;

  useEffect(() => {
    if (numerBledu === undefined) return;
    podsumowanie.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [numerBledu]);

  function wyslij(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    if (!zapisywanie) onZapisz();
  }

  const bledy = blad?.pola ?? {};
  const pole = (klucz: KluczPola, dodatkowe: Partial<Parameters<typeof PoleProfilu>[0]> = {}) => (
    <PoleProfilu
      id={idPola(klucz)}
      etykieta={ETYKIETY_POL[klucz]}
      wartosc={formularz[klucz]}
      onZmiana={(wartosc) => onZmiana(klucz, wartosc)}
      blad={bledy[klucz]}
      {...dodatkowe}
    />
  );

  return (
    <section className={style.karta} aria-labelledby={idNaglowka}>
      <Heading stopien={2} id={idNaglowka}>
        Dane osobowe
      </Heading>

      <form className={style.formularz} onSubmit={wyslij} noValidate>
        {blad !== null && (
          <div ref={podsumowanie}>
            <Notice
              wariant="error"
              tytul={blad.rodzaj === "pola" ? "Popraw zaznaczone pola" : "Nie udało się zapisać zmian"}
            >
              {blad.rodzaj === "pola" ? (
                <>
                  {polaZBledem(blad.pola).map((klucz, indeks) => (
                    <span key={klucz}>
                      {indeks > 0 && ", "}
                      <Link href={`#${idPola(klucz)}`}>{ETYKIETY_POL[klucz]}</Link>
                    </span>
                  ))}
                  {blad.inne.length > 0 && (polaZBledem(blad.pola).length > 0 ? ` — ${blad.inne.join(" ")}` : blad.inne.join(" "))}
                </>
              ) : (
                blad.komunikat
              )}
            </Notice>
          </div>
        )}

        <div className={style.dwiePola}>
          {pole("first_name", { autoComplete: "given-name" })}
          {pole("last_name", { autoComplete: "family-name" })}
        </div>

        <PoleProfilu
          id="profil-email"
          etykieta="Adres e-mail"
          wartosc={email}
          zablokowane
          autoComplete="email"
          podpowiedz="Adres e-mail zmienia administracja — napisz do opiekuna projektu."
        />

        {pole("phone", { autoComplete: "tel" })}
        {pole("pesel", {
          inputMode: "numeric",
          autoComplete: "off",
          podpowiedz: "Potrzebny do umowy wolontariackiej. Widoczny tylko dla Ciebie i administracji.",
        })}

        <fieldset className={style.adres}>
          <legend>Adres</legend>
          {pole("street", { autoComplete: "street-address" })}
          <div className={style.dwiePola}>
            {pole("city", { autoComplete: "address-level2" })}
            {pole("zip", { inputMode: "numeric", autoComplete: "postal-code" })}
          </div>
        </fieldset>

        <div className={style.akcje}>
          <Button
            id={ID_PRZYCISKU_ZAPISU}
            type="submit"
            poziom="primary"
            aria-disabled={zapisywanie || undefined}
          >
            {zapisywanie ? "Zapisywanie…" : "Zapisz zmiany"}
          </Button>
        </div>
      </form>
    </section>
  );
}
