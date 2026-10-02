"use client";

import { useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Text } from "@/design-system/atomy/Text/Text";
import { CollapsibleSection } from "@/design-system/molekuly/CollapsibleSection/CollapsibleSection";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { sklasyfikujBlad, usunKurs } from "./dane";
import style from "./PublikacjaKursu.module.css";
import { KOMUNIKAT_INTERNET } from "@/nowy-front/wspolne/komunikaty";

interface WlasciwosciUsuniecieKursu {
  idKursu: string;
  tytulKursu: string;
  /** Kurs usunięty — ekran przechodzi w stan „kurs usunięty”. */
  onUsunieto: () => void;
  /** Serwer nie zna kursu (404) — ekran przechodzi w stan „nie znaleziono”. */
  onNieZnaleziono: () => void;
  /** Okno potwierdzenia otwarte albo zamknięte — ekran wstrzymuje wtedy własny Escape. */
  onOkno?: (otwarte: boolean) => void;
}

/**
 * Blok „Usunięcie kursu” (A-14): akcja rzadka, więc siedzi w zwiniętej sekcji
 * poza pierwszym blokiem ekranu, jako przycisk drugorzędny, i wymaga
 * potwierdzenia w oknie `Dialog`. Jedna definicja dla ekranu „Publikacja
 * kursu” i dla ekranu kursu administracji — `DELETE /admin/courses/{course}`
 * woła wyłącznie `usunKurs` z `./dane`.
 */
export function UsuniecieKursu({ idKursu, tytulKursu, onUsunieto, onNieZnaleziono, onOkno }: WlasciwosciUsuniecieKursu) {
  const [potwierdzenie, setPotwierdzenie] = useState(false);
  const [usuwanie, setUsuwanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  function ustawOkno(otwarte: boolean) {
    setPotwierdzenie(otwarte);
    onOkno?.(otwarte);
  }

  async function potwierdz() {
    if (usuwanie) return;
    setUsuwanie(true);
    setBlad(null);
    try {
      await usunKurs(idKursu);
      ustawOkno(false);
      onUsunieto();
    } catch (wyjatek) {
      const klasa = sklasyfikujBlad(idKursu, wyjatek);
      if (klasa.rodzaj === "nie-znaleziono") {
        ustawOkno(false);
        onNieZnaleziono();
      } else if (klasa.rodzaj === "zakazane") {
        setBlad(zdanieOdmowyRoli("administracji"));
      } else if (klasa.rodzaj === "siec") {
        setBlad(KOMUNIKAT_INTERNET);
      } else if (klasa.rodzaj === "blad" || klasa.rodzaj === "braki") {
        setBlad(klasa.komunikat);
      }
    } finally {
      setUsuwanie(false);
    }
  }

  return (
    <>
      <CollapsibleSection
        tytul="Usunięcie kursu"
        liczba={1}
        dzieci={
          <div className={style.rzadkie}>
            <Button
              poziom="outline"
              niebezpieczny
              onClick={() => {
                setBlad(null);
                ustawOkno(true);
              }}
            >
              Usuń kurs
            </Button>
          </div>
        }
      />

      {potwierdzenie && (
        <Dialog
          tytul="Usunąć kurs?"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń kurs"
          onWycofaj={() => ustawOkno(false)}
          onPotwierdz={() => void potwierdz()}
        >
          {blad && (
            <Notice wariant="error" tytul="Nie udało się usunąć kursu">
              {blad}
            </Notice>
          )}
          <Text>{`Kurs „${tytulKursu}” zniknie z listy. Postęp uczestników zostaje zachowany.`}</Text>
        </Dialog>
      )}
    </>
  );
}
