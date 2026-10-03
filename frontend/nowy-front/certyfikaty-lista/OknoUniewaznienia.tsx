"use client";

import { useState } from "react";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Dialog, type BladDialogu } from "@/design-system/organizmy/Dialog/Dialog";
import { wyslijUniewaznienie, type CertyfikatNaLiscie } from "./dane";

export const ID_POLA_POWODU = "uniewaznienie-powod";

export const PODPOWIEDZ_POWODU = "Co najmniej 10 znaków. Pisz rzeczowo, bez informacji o zdrowiu.";

interface WlasciwosciOknaUniewaznienia {
  certyfikat: CertyfikatNaLiscie;
  /** Rezygnacja („Anuluj”, Escape, „Porzuć”) — w czasie zapisu okno jej nie przyjmuje. */
  onZamknij: () => void;
  /** Serwer przyjął unieważnienie; okno samo się nie zamyka — robi to ekran. */
  onUniewazniono: (certyfikat: CertyfikatNaLiscie) => void;
  /** Gdzie wraca fokus, gdy przycisk „Unieważnij” po zamknięciu już nie istnieje. */
  fokusPoZamknieciu?: string;
}

function imieNazwisko(certyfikat: CertyfikatNaLiscie): string | null {
  return certyfikat.user === null ? null : `${certyfikat.user.first_name} ${certyfikat.user.last_name}`;
}

/**
 * Okno unieważnienia certyfikatu — wspólne okno formularza (`Dialog`,
 * wariant `formularz`) w wariancie „niebezpieczny”: przyciskiem głównym jest
 * bezpieczne „Anuluj”, a „Unieważnij certyfikat” jest obrysowany w barwie
 * błędu. Zapis: `POST /admin/certificates/{id}/revoke` z ciałem `{ reason }`
 * (powód po przycięciu białych znaków).
 *
 * Przeglądarka niczego nie sprawdza: powód idzie do serwera taki, jaki jest,
 * a błąd długości (albo braku) powodu z serwera staje przy polu i w
 * podsumowaniu błędów okna; każdy inny błąd — w podsumowaniu, a okno zostaje
 * otwarte z wpisanym powodem. Pod polem podpowiedź o długości i o tym, że
 * powód nie zawiera informacji o zdrowiu.
 *
 * Resztę daje wspólne okno: fokus startowy na polu, pułapka fokusu, stan
 * zapisu („Zapisywanie…”, drugie wysłanie i rezygnacja ignorowane do
 * odpowiedzi serwera), pytanie „Porzucić wpisane dane?” przy Escape
 * z wpisanym powodem i powrót fokusu na przycisk, który okno otworzył.
 */
export function OknoUniewaznienia({ certyfikat, onZamknij, onUniewazniono, fokusPoZamknieciu }: WlasciwosciOknaUniewaznienia) {
  const [powod, setPowod] = useState("");
  const [bladPola, setBladPola] = useState<string | undefined>(undefined);
  const [bledy, setBledy] = useState<BladDialogu[] | undefined>(undefined);
  const osoba = imieNazwisko(certyfikat);

  async function uniewaznij() {
    setBladPola(undefined);
    setBledy(undefined);
    const wynik = await wyslijUniewaznienie(certyfikat.id, powod.trim());
    if (wynik.rodzaj === "ok") {
      onUniewazniono(certyfikat);
    } else if (wynik.rodzaj === "blad-pola") {
      setBladPola(wynik.komunikat);
      setBledy([{ tresc: wynik.komunikat, idPola: ID_POLA_POWODU }]);
    } else {
      setBledy([{ tresc: wynik.komunikat }]);
    }
  }

  return (
    <Dialog
      wariant="formularz"
      niebezpieczne
      tytul="Unieważnić certyfikat?"
      opis={
        <>
          <Text>{osoba === null ? `Certyfikat ${certyfikat.number}.` : `Certyfikat ${certyfikat.number}, ${osoba}.`}</Text>
          <Text>Unieważnienia nie da się cofnąć. Publiczna weryfikacja numeru pokaże, że certyfikat jest unieważniony.</Text>
        </>
      }
      etykietaWycofania="Anuluj"
      etykietaPotwierdzenia="Unieważnij certyfikat"
      tytulBledow="Certyfikat nie został unieważniony"
      onWycofaj={onZamknij}
      onPotwierdz={uniewaznij}
      bledy={bledy}
      niezapisaneZmiany={powod !== ""}
      fokusPoZamknieciu={fokusPoZamknieciu}
    >
      <Field
        id={ID_POLA_POWODU}
        etykieta="Powód unieważnienia"
        rodzaj="wieloliniowy"
        wymagane
        wartosc={powod}
        onZmiana={setPowod}
        blad={bladPola}
        podpowiedz={PODPOWIEDZ_POWODU}
      />
    </Dialog>
  );
}
