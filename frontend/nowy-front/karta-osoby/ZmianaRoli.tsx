"use client";

import { useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { updateAdminUser, type UserRole } from "@/lib/api/h18";
import { ROLE_LABELS } from "@/lib/h18/labels";
import { zdanieBleduCzynnosci } from "./dane";
import style from "./KartaOsoby.module.css";

interface WlasciwosciZmianyRoli {
  userId: number;
  /** Dotychczasowa rola osoby z karty — domyślny wybór pola. */
  rolaOsoby: string;
  /** Wczytuje kartę ponownie po zmianie, żeby ekran pokazał rolę z serwera. */
  onOdswiez: () => void;
}

/**
 * NIEDOŁĄCZONY: karta osoby pokazuje rolę tylko do odczytu (`RolaKonta.tsx`), bo
 * PsychON bierze rolę z Kont Niepodzielni przy każdym logowaniu. Plik zostaje bez
 * importu w drzewie ekranów.
 *
 * Zmiana roli konta z karty osoby — `PATCH /admin/users/{id}` z ciałem `{ role }`
 * (opiekun projektu i administrator). Wartości te same co na starej stronie: pięć
 * ról z kontraktu. Kto może nadać albo odebrać rolę Super Admina, rozstrzyga serwer —
 * jego odmowę pokazujemy zdaniem z koperty błędu. Pole jest poza formularzem
 * „Zmień dane”, który roli nie zmienia.
 */
export function ZmianaRoli({ userId, rolaOsoby, onOdswiez }: WlasciwosciZmianyRoli) {
  const [wybrana, setWybrana] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const wartosc = wybrana ?? rolaOsoby;
  const zmieniona = wartosc !== rolaOsoby;

  async function zapisz() {
    if (!zmieniona || zapisywanie) return;
    setZapisywanie(true);
    setBlad(null);
    try {
      await updateAdminUser(userId, { role: wartosc });
      setToast(`Zmieniono rolę na: ${ROLE_LABELS[wartosc as UserRole] ?? wartosc}.`);
      setWybrana(null);
      onOdswiez();
    } catch (wyjatek) {
      setBlad(zdanieBleduCzynnosci(wyjatek, "Nie udało się zmienić roli."));
    } finally {
      setZapisywanie(false);
    }
  }

  return (
    <section className={style.czynnosc} aria-labelledby="czynnosc-rola-naglowek">
      <Heading stopien={2} id="czynnosc-rola-naglowek">
        Rola konta
      </Heading>
      <Text>Rola decyduje o tym, które sekcje platformy widzi osoba.</Text>
      {blad !== null && (
        <Notice wariant="error" tytul="Rola nie została zmieniona">
          {blad}
        </Notice>
      )}
      <Field
        id="czynnosc-rola-wybor"
        etykieta="Rola"
        rodzaj="wybor"
        wartosc={wartosc}
        onZmiana={setWybrana}
        opcje={Object.entries(ROLE_LABELS).map(([klucz, etykieta]) => ({ wartosc: klucz, etykieta }))}
      />
      <div className={style.przyciskCzynnosci}>
        <Button poziom="outline" disabled={!zmieniona || zapisywanie} onClick={() => void zapisz()}>
          Zapisz rolę
        </Button>
      </div>
      {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </section>
  );
}
