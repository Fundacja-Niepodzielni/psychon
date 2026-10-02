"use client";

import { useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { resetTestAttempts } from "@/lib/api/h10";
import { ApiError } from "@/lib/api/klient";
import { odmien } from "../wspolne/odmiana";
import { zdanieBleduCzynnosci } from "./dane";
import style from "./KartaOsoby.module.css";

interface WlasciwosciResetuLimitu {
  userId: number;
  imieNazwisko: string;
}

/**
 * Reset limitu podejść do testu z karty osoby —
 * `POST /admin/tests/{test}/users/{user}/reset-attempts` z ciałem `{ reason }`
 * (opiekun projektu i administrator). Karta nie zna testów osoby, więc
 * identyfikator testu wpisuje opiekun (ten sam numer co w adresie banku pytań).
 * Powód jest obowiązkowy: przycisk nie otwiera pytania, dopóki oba pola nie są
 * wypełnione. Odpowiedź, która nie dotarła (sieć), to nie odmowa — serwer mógł
 * już wyczyścić podejścia, więc ekran mówi wprost, że nie wie, i każe sprawdzić stan.
 */
export function ResetLimituPodejsc({ userId, imieNazwisko }: WlasciwosciResetuLimitu) {
  const [idTestu, setIdTestu] = useState("");
  const [powod, setPowod] = useState("");
  const [pytanie, setPytanie] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [nieznany, setNieznany] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const liczbaTestu = Number(idTestu);
  const idPoprawne = idTestu.trim() !== "" && Number.isInteger(liczbaTestu) && liczbaTestu > 0;
  const powodPoprawny = powod.trim() !== "";

  async function zresetuj() {
    if (!idPoprawne || !powodPoprawny || wysylanie) return;
    setPytanie(false);
    setWysylanie(true);
    setBlad(null);
    setNieznany(false);
    try {
      const wynik = await resetTestAttempts(liczbaTestu, userId, powod.trim());
      setToast(
        `Wyczyszczono ${wynik.cleared} ${odmien(wynik.cleared, "podejście", "podejścia", "podejść")} — limit tej osoby do tego testu to teraz ${wynik.attempts_limit}.`,
      );
      setPowod("");
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError) {
        setBlad(zdanieBleduCzynnosci(wyjatek, "Nie udało się zresetować limitu podejść. Spróbuj ponownie."));
      } else {
        setNieznany(true);
      }
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <section className={style.czynnosc} aria-labelledby="czynnosc-reset-naglowek">
      <Heading stopien={2} id="czynnosc-reset-naglowek">
        Reset limitu podejść
      </Heading>
      <Text>
        Czyści dotychczasowe podejścia tej osoby do wskazanego testu — nowe podejście zaczyna numerację od 1. Powód trafia
        do dziennika audytu.
      </Text>
      {blad !== null && (
        <Notice wariant="error" tytul="Limit nie został zresetowany">
          {blad}
        </Notice>
      )}
      {nieznany && (
        <Notice wariant="warn" tytul="Nie wiadomo, czy reset się wykonał">
          Odpowiedź serwera nie dotarła. Odśwież kartę osoby i sprawdź stan podejść, zanim spróbujesz ponownie.
        </Notice>
      )}
      <Field
        id="czynnosc-reset-test"
        etykieta="Identyfikator testu"
        rodzaj="liczba"
        wartosc={idTestu}
        onZmiana={setIdTestu}
        podpowiedz="Ten sam numer, co w adresie banku pytań tego testu."
      />
      <Field
        id="czynnosc-reset-powod"
        etykieta="Powód resetu"
        rodzaj="tekst"
        wartosc={powod}
        onZmiana={setPowod}
        podpowiedz="Trafia do dziennika audytu."
      />
      <div className={style.przyciskCzynnosci}>
        <Button
          poziom="outline"
          disabled={!idPoprawne || !powodPoprawny || wysylanie}
          onClick={() => setPytanie(true)}
        >
          Zresetuj limit podejść
        </Button>
      </div>
      {pytanie && (
        <Dialog
          tytul="Zresetować limit podejść?"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zresetuj limit"
          onWycofaj={() => setPytanie(false)}
          onPotwierdz={() => void zresetuj()}
        >
          <Text>
            Osoba: {imieNazwisko}. Test nr {liczbaTestu}.
          </Text>
          <Text>Dotychczasowe podejścia tej osoby do tego testu zostaną wyczyszczone.</Text>
        </Dialog>
      )}
      {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </section>
  );
}
