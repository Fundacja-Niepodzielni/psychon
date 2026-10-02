"use client";

import { useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { blockAdminUser } from "@/lib/api/h18";
import { zdanieBleduCzynnosci } from "./dane";
import style from "./KartaOsoby.module.css";

interface WlasciwosciBlokadyKonta {
  userId: number;
  imieNazwisko: string;
  /** Rola blokowanej osoby — kontami Super Admina zarządza wyłącznie Super Admin. */
  rolaOsoby: string;
  /** Wczytuje kartę ponownie po zablokowaniu, żeby ekran pokazał stan z serwera. */
  onOdswiez: () => void;
}

/**
 * Zablokowanie konta z karty osoby — `POST /admin/users/{id}/block` z ciałem
 * `{ reason }` (opiekun projektu i administrator). Powód jest obowiązkowy i trafia
 * do Dziennika działań. Blokada kończy się pytaniem z imieniem i nazwiskiem osoby;
 * po sukcesie karta jest wczytywana ponownie. O tym, kto może zablokować konto
 * Super Admina, rozstrzyga serwer — jego odmowę pokazujemy zdaniem z koperty błędu.
 */
export function BlokadaKonta({ userId, imieNazwisko, rolaOsoby, onOdswiez }: WlasciwosciBlokadyKonta) {
  const [powod, setPowod] = useState("");
  const [pytanie, setPytanie] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const powodPoprawny = powod.trim() !== "";

  async function zablokuj() {
    if (!powodPoprawny || wysylanie) return;
    setPytanie(false);
    setWysylanie(true);
    setBlad(null);
    try {
      await blockAdminUser(userId, powod.trim());
      setPowod("");
      setToast(`Zablokowano konto: ${imieNazwisko}.`);
      onOdswiez();
    } catch (wyjatek) {
      setBlad(zdanieBleduCzynnosci(wyjatek, "Nie udało się zablokować konta."));
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <section className={style.czynnosc} aria-labelledby="czynnosc-blokada-naglowek">
      <Heading stopien={2} id="czynnosc-blokada-naglowek">
        Blokada konta
      </Heading>
      {rolaOsoby === "super_admin" && <Text>Kontami Super Admina zarządza wyłącznie Super Admin.</Text>}
      {blad !== null && (
        <Notice wariant="error" tytul="Konto nie zostało zablokowane">
          {blad}
        </Notice>
      )}
      <Field
        id="czynnosc-blokada-powod"
        etykieta="Powód blokady"
        rodzaj="tekst"
        wartosc={powod}
        onZmiana={setPowod}
        podpowiedz="Powód trafia do Dziennika działań. Zablokowana osoba przy logowaniu zobaczy komunikat o blokadzie, nie o wygaśnięciu dostępu."
      />
      <div className={style.przyciskCzynnosci}>
        <Button poziom="outline" disabled={!powodPoprawny || wysylanie} onClick={() => setPytanie(true)}>
          Zablokuj konto
        </Button>
      </div>
      {pytanie && (
        <Dialog
          tytul="Zablokować konto?"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zablokuj konto"
          onWycofaj={() => setPytanie(false)}
          onPotwierdz={() => void zablokuj()}
        >
          <Text>Osoba: {imieNazwisko}. Po zablokowaniu nie zaloguje się do platformy.</Text>
        </Dialog>
      )}
      {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </section>
  );
}
