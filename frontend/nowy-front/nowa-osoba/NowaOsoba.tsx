"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { rowneWartosci } from "@/nowy-front/wspolne/rowne-wartosci";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import {
  PUSTY_FORMULARZ,
  bladPola,
  bledyPozostale,
  etykietaRoli,
  klasyfikujBlad,
  opcjeRol,
  pobierzUprawnienia,
  skutekRoli,
  zalozKonto,
  zmienRole,
  type BladZapisu,
  type FormularzOsoby,
  type Uprawnienia,
} from "./dane";
import { KOMUNIKAT_SERWER } from "@/nowy-front/wspolne/komunikaty";

const OKRUSZKI = [{ etykieta: "Osoby" }, { etykieta: "Nowa osoba" }];

type Wczytanie =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "gotowy"; uprawnienia: Uprawnienia };

/** Ostatnia próba zapisu — „Spróbuj ponownie” powtarza dokładnie ją. */
type Proba = { rodzaj: "zalozenie" } | { rodzaj: "zmiana-roli"; idOsoby: number };

/**
 * Ekran „Nowa osoba / zmiana roli” na szablonie `FormTemplate`: nagłówek,
 * powiadomienie o wyniku, jedna sekcja formularza z jednym rzędem przycisków
 * („Wróć do listy” + główna akcja „Utwórz konto”). Każdy stan — ładowanie,
 * odmowa z powodu roli, błąd odczytu, formularz — renderuje się WEWNĄTRZ
 * szablonu, więc jego korzeń jest jedynym `main`.
 *
 * Zmiana roli istniejącego konta jest jedyną drogą po odpowiedzi 409
 * `email_already_registered`: serwer oddaje `reason.existing_user_id`, a
 * przycisk „Zmień rolę tego konta” wywołuje `PATCH /admin/users/{id}` z samą
 * rolą (adres e-mail konta zostaje bez zmian).
 */
export function NowaOsoba() {
  const router = useRouter();
  const wroc = useCallback(() => router.back(), [router]);

  const [wczytanie, setWczytanie] = useState<Wczytanie>({ rodzaj: "ladowanie" });
  const [formularz, setFormularz] = useState<FormularzOsoby>(PUSTY_FORMULARZ);
  const [zapisuje, setZapisuje] = useState(false);
  const [blad, setBlad] = useState<BladZapisu | null>(null);
  const [ostatniaProba, setOstatniaProba] = useState<Proba | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useZgloszenieNiezapisanychZmian(!rowneWartosci(formularz, PUSTY_FORMULARZ), "Nowa osoba");

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    return pobierzUprawnienia()
      .then((uprawnienia) => {
        if (straz?.anulowane) return;
        setWczytanie(
          uprawnienia.administracja ? { rodzaj: "gotowy", uprawnienia } : { rodzaj: "brak-uprawnien" },
        );
      })
      .catch((wyjatek: unknown) => {
        if (straz?.anulowane) return;
        const klasa = klasyfikujBlad(wyjatek);
        setWczytanie({
          rodzaj: klasa.rodzaj === "zakazane" || klasa.rodzaj === "brak-sesji" ? "brak-uprawnien" : "blad",
        });
      });
  }, []);

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  async function wykonaj(proba: Proba) {
    if (zapisuje) return;
    setZapisuje(true);
    setBlad(null);
    setToast(null);
    setOstatniaProba(proba);
    try {
      if (proba.rodzaj === "zalozenie") {
        const wynik = await zalozKonto(formularz);
        setFormularz(PUSTY_FORMULARZ);
        setOstatniaProba(null);
        setToast(`Konto zostało założone. Zaproszenie wysłano na adres ${wynik.email}.`);
      } else {
        await zmienRole(proba.idOsoby, formularz.role);
        setFormularz(PUSTY_FORMULARZ);
        setOstatniaProba(null);
        setToast(`Rola konta została zmieniona na: ${etykietaRoli(formularz.role)}.`);
      }
    } catch (wyjatek) {
      const klasa = klasyfikujBlad(wyjatek);
      if (klasa.rodzaj === "brak-sesji") {
        setWczytanie({ rodzaj: "brak-uprawnien" });
      } else {
        setBlad(klasa);
      }
    } finally {
      setZapisuje(false);
    }
  }

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Nowa osoba"
      opis="Załóż konto poza rekrutacją i nadaj mu rolę. Osoba dostanie e-mail z zaproszeniem do aktywacji konta."
      onPowrot={wroc}
    />
  );

  if (wczytanie.rodzaj === "ladowanie") {
    return <FormTemplate naglowek={naglowek} tresc={<Skeleton wiersze={5} />} />;
  }

  if (wczytanie.rodzaj === "brak-uprawnien") {
    return (
      <FormTemplate
        naglowek={naglowek}
        tresc={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Nowa osoba"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (wczytanie.rodzaj === "blad") {
    return (
      <FormTemplate
        naglowek={naglowek}
        powiadomienie={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać ekranu"
            akcja={
              <Button
                poziom="outline"
                onClick={() => {
                  setWczytanie({ rodzaj: "ladowanie" });
                  void wczytaj();
                }}
              >
                Spróbuj ponownie
              </Button>
            }
          >
            {KOMUNIKAT_SERWER} Formularz nie jest pokazywany bez sprawdzenia Twojej roli.
          </Notice>
        }
        tresc={null}
      />
    );
  }

  const { uprawnienia } = wczytanie;
  const dopisz = (pole: keyof FormularzOsoby) => (wartosc: string) =>
    setFormularz((poprzedni) => ({ ...poprzedni, [pole]: wartosc }));

  const pola: PoleFormSection[] = [
    {
      id: "nowa-osoba-imie",
      etykieta: "Imię",
      rodzaj: "tekst",
      wartosc: formularz.first_name,
      onZmiana: dopisz("first_name"),
      blad: bladPola(blad, "first_name"),
      wymagane: true,
    },
    {
      id: "nowa-osoba-nazwisko",
      etykieta: "Nazwisko",
      rodzaj: "tekst",
      wartosc: formularz.last_name,
      onZmiana: dopisz("last_name"),
      blad: bladPola(blad, "last_name"),
      wymagane: true,
    },
    {
      id: "nowa-osoba-email",
      etykieta: "Adres e-mail",
      rodzaj: "tekst",
      wartosc: formularz.email,
      onZmiana: dopisz("email"),
      blad: bladPola(blad, "email"),
      podpowiedz: "Na ten adres trafi zaproszenie. Adres konta zmienia wyłącznie administracja.",
      wymagane: true,
    },
    {
      id: "nowa-osoba-rola",
      etykieta: "Rola",
      rodzaj: "wybor",
      wartosc: formularz.role,
      onZmiana: dopisz("role"),
      opcje: [{ wartosc: "", etykieta: "Wybierz rolę" }, ...opcjeRol(uprawnienia.superAdmin)],
      blad: bladPola(blad, "role"),
      podpowiedz: skutekRoli(formularz.role) ?? "Rola decyduje o tym, co osoba zobaczy po wejściu do systemu.",
      wymagane: true,
    },
  ];

  const pozostale = bledyPozostale(blad);

  let powiadomienie = null;
  if (blad?.rodzaj === "duplikat") {
    const idIstniejacej = blad.istniejacaOsoba;
    powiadomienie = (
      <Notice
        wariant="warn"
        tytul="Konto z tym adresem już istnieje"
        akcja={
          idIstniejacej !== null && formularz.role !== "" ? (
            <Button
              poziom="outline"
              onClick={() => void wykonaj({ rodzaj: "zmiana-roli", idOsoby: idIstniejacej })}
            >
              Zmień rolę tego konta
            </Button>
          ) : undefined
        }
      >
        {idIstniejacej !== null && formularz.role !== ""
          ? `${blad.komunikat} Możesz zmienić rolę tego konta na: ${etykietaRoli(formularz.role)}.`
          : `${blad.komunikat} Wybierz rolę, żeby zmienić rolę tego konta.`}
      </Notice>
    );
  } else if (blad?.rodzaj === "zakazane") {
    powiadomienie = (
      <Notice wariant="error" tytul="Tej roli nie możesz nadać">
        {blad.komunikat}
      </Notice>
    );
  } else if (blad?.rodzaj === "nie-znaleziono") {
    powiadomienie = (
      <Notice wariant="error" tytul="Nie znaleziono osoby">
        {blad.komunikat}
      </Notice>
    );
  } else if (blad?.rodzaj === "blad") {
    powiadomienie = (
      <Notice
        wariant="error"
        tytul="Nie udało się zapisać"
        akcja={
          ostatniaProba ? (
            <Button poziom="outline" onClick={() => void wykonaj(ostatniaProba)}>
              Spróbuj ponownie
            </Button>
          ) : undefined
        }
      >
        {blad.komunikat}
      </Notice>
    );
  } else if (pozostale.length > 0) {
    powiadomienie = (
      <Notice wariant="error" tytul="Popraw dane konta">
        {pozostale.join(" ")}
      </Notice>
    );
  }

  return (
    <FormTemplate
      naglowek={naglowek}
      powiadomienie={powiadomienie}
      tresc={
        <>
          <FormSection
            tytul="Dane konta"
            pola={pola}
            etykietaAnuluj="Wróć do listy"
            etykietaZapisz={zapisuje ? "Zapisywanie…" : "Utwórz konto"}
            onAnuluj={wroc}
            onZapisz={() => void wykonaj({ rodzaj: "zalozenie" })}
          />
          {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
        </>
      }
    />
  );
}
