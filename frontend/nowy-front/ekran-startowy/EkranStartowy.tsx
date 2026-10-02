"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/klient";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import {
  LIMITY,
  bledyZOdpowiedzi,
  cialoZapisu,
  formularzZEkranu,
  opisOstatniejZmiany,
  pobierzEkranStartowy,
  rodzajBledu,
  zapiszEkranStartowy,
  type BledyEkranu,
  type EkranStartowy as DaneEkranu,
  type FormularzEkranu,
  type PoleEkranu,
} from "./dane";
import { PodgladEkranuStartowego } from "./PodgladEkranuStartowego";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "siec" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "brak" }
  | { rodzaj: "gotowy"; ekran: DaneEkranu };

interface DefinicjaPola {
  pole: PoleEkranu;
  etykieta: string;
  rodzaj: "tekst" | "wieloliniowy";
  wymagane: boolean;
  wskazowka?: string;
}

/** Kolejność = kolejność na ekranie; ostatnie dwa pola trafiają do zwijanej sekcji. */
const DEFINICJE: readonly DefinicjaPola[] = [
  { pole: "video.title", etykieta: "Tytuł filmu powitalnego", rodzaj: "tekst", wymagane: true },
  {
    pole: "video.url",
    etykieta: "Adres filmu w internecie",
    rodzaj: "tekst",
    wymagane: false,
    wskazowka: "Zostaw puste, jeśli filmu jeszcze nie ma.",
  },
  { pole: "video.caption", etykieta: "Podpis pod filmem", rodzaj: "wieloliniowy", wymagane: false },
  { pole: "program.title", etykieta: "Tytuł sekcji o przebiegu programu", rodzaj: "tekst", wymagane: true },
  {
    pole: "program.body",
    etykieta: "Treść o przebiegu programu",
    rodzaj: "wieloliniowy",
    wymagane: true,
    wskazowka: "Akapity oddziel pustym wierszem.",
  },
  { pole: "expectations.title", etykieta: "Tytuł sekcji o oczekiwaniach", rodzaj: "tekst", wymagane: true },
  {
    pole: "expectations.body",
    etykieta: "Treść o oczekiwaniach",
    rodzaj: "wieloliniowy",
    wymagane: true,
    wskazowka: "Akapity oddziel pustym wierszem.",
  },
];

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Zacznij tutaj" }];
const BEZ_BLEDOW: BledyEkranu = { pola: {}, pozostale: [] };

function idPola(pole: PoleEkranu): string {
  return `ekran-startowy-${pole.replace(".", "-")}`;
}

/**
 * Ekran A-30 „Treść ekranu Zacznij tutaj” (trasa `/nowy-front/admin/ekran-startowy`)
 * na szablonie `FormTemplate`: nagłówek, obszar komunikatów, jedna `FormSection`
 * z siedmioma polami i — pod nią — podgląd w układzie odbiorcy, liczony z
 * bieżących wartości formularza. Jedyny przycisk główny ekranu to „Zapisz i
 * opublikuj” wewnątrz `FormSection`: zapis od razu jest widoczny dla uczestników.
 * Każdy stan renderuje się WEWNĄTRZ szablonu — korzeń szablonu jest jedynym `main`.
 *
 * Odczyt (`GET /onboarding`) jest otwarty dla każdej roli, więc odmowa
 * (401/403) pada zwykle dopiero przy zapisie; wtedy formularz znika z DOM.
 * Logika danych: `./dane.ts`.
 */
export function EkranStartowy() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [formularz, setFormularz] = useState<FormularzEkranu | null>(null);
  const [bledy, setBledy] = useState<BledyEkranu>(BEZ_BLEDOW);
  const [bladZapisu, setBladZapisu] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useZgloszenieNiezapisanychZmian(
    stan.rodzaj === "gotowy" && formularz !== null && Object.keys(cialoZapisu(stan.ekran, formularz)).length > 0,
    "Treść ekranu startowego",
  );

  useEffect(() => {
    let aktualne = true;
    pobierzEkranStartowy()
      .then((ekran) => {
        if (!aktualne) return;
        setFormularz(formularzZEkranu(ekran));
        setStan({ rodzaj: "gotowy", ekran });
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
    const cialo = cialoZapisu(stan.ekran, formularz);
    if (Object.keys(cialo).length === 0) {
      setToast("Nie ma zmian do opublikowania.");
      return;
    }
    setZapisywanie(true);
    setBladZapisu(null);
    setBledy(BEZ_BLEDOW);
    try {
      const ekran = await zapiszEkranStartowy(cialo);
      setStan({ rodzaj: "gotowy", ekran });
      setFormularz(formularzZEkranu(ekran));
      setToast("Treść została zapisana i opublikowana.");
    } catch (blad) {
      const rodzaj = rodzajBledu(blad);
      if (rodzaj === "brak-uprawnien" || rodzaj === "brak") {
        setStan({ rodzaj });
      } else if (rodzaj === "walidacja" && blad instanceof ApiError) {
        const odczytane = bledyZOdpowiedzi(blad.errors);
        setBledy(odczytane);
        if (Object.keys(odczytane.pola).length === 0 && odczytane.pozostale.length === 0) {
          setBladZapisu("Serwer odrzucił treść. Popraw wpisane teksty i spróbuj ponownie.");
        }
      } else {
        setBladZapisu("Nie udało się zapisać treści. Spróbuj ponownie.");
      }
    } finally {
      setZapisywanie(false);
    }
  }

  const wroc = () => router.back();
  const opis = stan.rodzaj === "gotowy" ? opisOstatniejZmiany(stan.ekran.updated_at) : undefined;
  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Treść ekranu „Zacznij tutaj”"
      opis={opis ?? "Treść, którą uczestnicy widzą jako pierwszą po wejściu do programu."}
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
            tytul="Nie udało się wczytać treści"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Treść nie jest zmyślana bez danych.
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
            naglowek="Ten ekran redaguje administracja"
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
            naglowek="Nie znaleziono ekranu"
            tresc="Serwer nie zwrócił treści ekranu „Zacznij tutaj”, więc nie ma czego redagować."
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  const wartosci = formularz ?? formularzZEkranu(stan.ekran);
  const pola: PoleFormSection[] = DEFINICJE.map((definicja) => {
    const limit = LIMITY[definicja.pole];
    const licznik = `${wartosci[definicja.pole].length}/${limit} znaków`;
    return {
      id: idPola(definicja.pole),
      etykieta: definicja.etykieta,
      rodzaj: definicja.rodzaj,
      wymagane: definicja.wymagane,
      wartosc: wartosci[definicja.pole],
      podpowiedz: definicja.wskazowka ? `${definicja.wskazowka} ${licznik}` : licznik,
      blad: bledy.pola[definicja.pole],
      onZmiana: (wartosc: string) => {
        setFormularz((poprzedni) => ({ ...(poprzedni ?? wartosci), [definicja.pole]: wartosc }));
        setToast(null);
      },
    };
  });

  const komunikat = bladZapisu ?? (bledy.pozostale.length > 0 ? bledy.pozostale.join(" ") : null);

  return (
    <FormTemplate
      naglowek={naglowek}
      powiadomienie={
        komunikat ? (
          <Notice
            wariant="error"
            tytul="Nie udało się zapisać treści"
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
          <FormSection
            tytul="Treść ekranu"
            pola={pola}
            tytulDodatkowych="Oczekiwania wobec uczestników"
            etykietaZapisz={zapisywanie ? "Zapisywanie…" : "Zapisz i opublikuj"}
            etykietaAnuluj="Przywróć zapisane"
            onAnuluj={() => {
              setFormularz(formularzZEkranu(stan.ekran));
              setBledy(BEZ_BLEDOW);
              setBladZapisu(null);
            }}
            onZapisz={() => void zapisz()}
          />
          <Heading stopien={2}>Podgląd</Heading>
          <Text>Tak uczestnicy zobaczą ten ekran po opublikowaniu.</Text>
          <PodgladEkranuStartowego wartosci={wartosci} />
          {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
        </>
      }
    />
  );
}
