"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/klient";
import { Button } from "@/design-system/atomy/Button/Button";
import { Text } from "@/design-system/atomy/Text/Text";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import {
  POLA,
  bledyZOdpowiedzi,
  formularzZRoku,
  pobierzRokProgramu,
  rodzajBledu,
  zapiszRokProgramu,
  zmianyDoZapisu,
  type BledyUstawien,
  type FormularzUstawien,
  type RokProgramu,
} from "./dane";
import { KOMUNIKAT_SERWER, KOMUNIKAT_ZAPIS } from "@/nowy-front/wspolne/komunikaty";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "siec" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "brak" }
  | { rodzaj: "gotowy"; rok: RokProgramu };

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Ustawienia roku programu" }];
const BEZ_BLEDOW: BledyUstawien = { pola: {}, pozostale: [] };

/**
 * Ekran A-29 „Ustawienia roku programu” (trasa `/nowy-front/admin/ustawienia`)
 * na szablonie `FormTemplate`: nagłówek (`PageHeader`), obszar komunikatów
 * (`Notice`) i jedna `FormSection` z sześcioma progami z kontraktu §3.3.
 * Jedyny przycisk główny ekranu to „Zapisz ustawienia” wewnątrz `FormSection`.
 * Każdy stan (ładowanie, dane, błąd sieci, odmowa, brak roku programu)
 * renderuje się WEWNĄTRZ szablonu — korzeń szablonu jest jedynym `main`.
 *
 * Logika danych: `./dane.ts`. Odczyt i zapis biegną z przeglądarki (powód
 * w nagłówku tamtego pliku).
 */
export function UstawieniaEdycji() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [formularz, setFormularz] = useState<FormularzUstawien | null>(null);
  const [bledy, setBledy] = useState<BledyUstawien>(BEZ_BLEDOW);
  const [bladZapisu, setBladZapisu] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useZgloszenieNiezapisanychZmian(
    stan.rodzaj === "gotowy" && formularz !== null && Object.keys(zmianyDoZapisu(stan.rok, formularz)).length > 0,
    "Ustawienia roku programu",
  );

  useEffect(() => {
    let aktualne = true;
    pobierzRokProgramu()
      .then((rok) => {
        if (!aktualne) return;
        setFormularz(formularzZRoku(rok));
        setStan({ rodzaj: "gotowy", rok });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        const rodzaj = rodzajBledu(blad);
        setStan({ rodzaj: rodzaj === "brak-uprawnien" || rodzaj === "brak" ? rodzaj : "siec" });
      });
    return () => {
      aktualne = false;
    };
  }, [proba]);

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((poprzednia) => poprzednia + 1);
  }

  async function zapisz() {
    if (stan.rodzaj !== "gotowy" || formularz === null || zapisywanie) return;
    const zmiany = zmianyDoZapisu(stan.rok, formularz);
    if (Object.keys(zmiany).length === 0) {
      setToast("Nie ma zmian do zapisania.");
      return;
    }
    setZapisywanie(true);
    setBladZapisu(null);
    setBledy(BEZ_BLEDOW);
    try {
      const rok = await zapiszRokProgramu(zmiany);
      setStan({ rodzaj: "gotowy", rok });
      setFormularz(formularzZRoku(rok));
      setToast("Ustawienia zostały zapisane.");
    } catch (blad) {
      const rodzaj = rodzajBledu(blad);
      if (rodzaj === "brak-uprawnien" || rodzaj === "brak") {
        setStan({ rodzaj });
      } else if (rodzaj === "walidacja" && blad instanceof ApiError) {
        const odczytane = bledyZOdpowiedzi(blad.errors);
        setBledy(odczytane);
        if (Object.keys(odczytane.pola).length === 0 && odczytane.pozostale.length === 0) {
          setBladZapisu("Ustawienia nie zostały zapisane. Popraw wartości i spróbuj ponownie.");
        }
      } else {
        setBladZapisu(KOMUNIKAT_ZAPIS);
      }
    } finally {
      setZapisywanie(false);
    }
  }

  const wroc = () => router.back();
  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Ustawienia roku programu"
      opis="Progi i limity, od których zależy zaliczenie testu, ukończenie lekcji i certyfikat."
      onPowrot={wroc}
    />
  );

  if (stan.rodzaj === "ladowanie") {
    return <FormTemplate naglowek={naglowek} tresc={<Skeleton wiersze={6} />} />;
  }

  if (stan.rodzaj === "siec") {
    return (
      <FormTemplate
        naglowek={naglowek}
        powiadomienie={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać ustawień"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            {KOMUNIKAT_SERWER} Ustawienia nie są pokazywane bez danych.
          </Notice>
        }
        tresc={null}
      />
    );
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <FormTemplate
        naglowek={naglowek}
        tresc={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Ustawienia należą do administracji"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "brak") {
    return (
      <FormTemplate
        naglowek={naglowek}
        tresc={
          <EmptyState
            naglowek="Nie ma aktywnego roku programu"
            tresc="Bez aktywnego roku programu nie ma czego ustawiać."
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  const wartosci = formularz ?? formularzZRoku(stan.rok);
  const pola: PoleFormSection[] = POLA.map((definicja) => ({
    id: `ustawienia-${definicja.klucz}`,
    etykieta: definicja.etykieta,
    rodzaj: "liczba",
    wymagane: true,
    wartosc: wartosci[definicja.klucz],
    podpowiedz: definicja.zdanie,
    blad: bledy.pola[definicja.klucz],
    onZmiana: (wartosc: string) => {
      setFormularz((poprzedni) => ({ ...(poprzedni ?? wartosci), [definicja.klucz]: wartosc }));
      setToast(null);
    },
  }));

  const komunikat = bladZapisu ?? (bledy.pozostale.length > 0 ? bledy.pozostale.join(" ") : null);

  return (
    <FormTemplate
      naglowek={naglowek}
      powiadomienie={
        komunikat ? (
          <Notice
            wariant="error"
            tytul="Nie udało się zapisać ustawień"
            akcja={
              bladZapisu ? (
                <Button poziom="outline" onClick={() => void zapisz()}>
                  Spróbuj ponownie
                </Button>
              ) : undefined
            }
          >
            {komunikat}
          </Notice>
        ) : undefined
      }
      tresc={
        <>
          <Text>Zmiana obowiązuje od zapisania.</Text>
          <FormSection
            tytul="Progi i limity"
            pola={pola}
            tytulDodatkowych="Czas nauki"
            etykietaZapisz={zapisywanie ? "Zapisywanie…" : "Zapisz ustawienia"}
            etykietaAnuluj="Przywróć zapisane"
            onAnuluj={() => {
              setFormularz(formularzZRoku(stan.rok));
              setBledy(BEZ_BLEDOW);
              setBladZapisu(null);
            }}
            onZapisz={() => void zapisz()}
          />
          {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
        </>
      }
    />
  );
}
