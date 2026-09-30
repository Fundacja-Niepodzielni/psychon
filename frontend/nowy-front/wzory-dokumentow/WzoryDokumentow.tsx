"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  fetchDocumentTemplate,
  fetchDocumentTemplateVersions,
  updateDocumentTemplate,
  type DocumentTemplateType,
} from "@/lib/api/document-templates";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { KeyValueRow } from "@/design-system/molekuly/KeyValueRow/KeyValueRow";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { DataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import {
  RODZAJE_WZORU,
  bladTresci,
  czyZmieniona,
  etykietaRodzaju,
  formatujMomentZmiany,
  historiaPoZapisie,
  opisAutora,
  stanZBleduWczytania,
  wierszeHistorii,
  wynikZBleduZapisu,
  type StanWczytania,
} from "./dane";
import style from "./WzoryDokumentow.module.css";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Treści i dokumenty" }, { etykieta: "Wzory dokumentów" }];
const OPCJE_RODZAJU = RODZAJE_WZORU.map((rodzaj) => ({ wartosc: rodzaj.typ, etykieta: rodzaj.etykieta }));

type StanDialogu = { rodzaj: "cofnij" } | { rodzaj: "zmien-rodzaj"; docelowy: DocumentTemplateType } | { rodzaj: "wroc" };

/**
 * Ekran „Wzory dokumentów” na szablonie `DetailTemplate`: w nagłówku wybór
 * rodzaju wzoru, w kolumnie głównej edytor treści (`FormSection`, akcja
 * główna „Zapisz nową wersję”), w kolumnie wspierającej dane bieżącej wersji
 * i jej historia. Każdy stan (ładowanie, dane, brak wzoru, brak uprawnień,
 * błąd sieci) renderuje się wewnątrz szablonu — jego korzeń jest jedynym
 * `main`.
 *
 * Trasy: `GET`/`PUT /document-templates/{type}` i
 * `GET /document-templates/{type}/versions`. Zapis zawsze zakłada nową
 * wersję; historia zawiera wersje, daty i osoby, bez treści archiwalnych.
 */
export function WzoryDokumentow() {
  const router = useRouter();
  const [typ, setTyp] = useState<DocumentTemplateType>("agreement");
  const [stan, setStan] = useState<StanWczytania>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [tresc, setTresc] = useState("");
  const [bladPola, setBladPola] = useState<string | undefined>(undefined);
  const [bladOgolny, setBladOgolny] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [dialog, setDialog] = useState<StanDialogu | null>(null);

  useEffect(() => {
    let aktualne = true;
    Promise.all([fetchDocumentTemplate(typ), fetchDocumentTemplateVersions(typ)])
      .then(([wzor, historia]) => {
        if (!aktualne) return;
        setTresc(wzor.content);
        setStan({ rodzaj: "gotowy", wzor, historia });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(stanZBleduWczytania(blad));
      });
    return () => {
      aktualne = false;
    };
  }, [typ, proba]);

  const zapisana = stan.rodzaj === "gotowy" ? stan.wzor.content : "";
  const zmieniona = stan.rodzaj === "gotowy" && czyZmieniona(tresc, zapisana);

  // Zamknięcie karty z niezapisaną treścią pyta o potwierdzenie.
  useEffect(() => {
    if (!zmieniona) return;
    function naWyjscie(zdarzenie: BeforeUnloadEvent) {
      zdarzenie.preventDefault();
    }
    window.addEventListener("beforeunload", naWyjscie);
    return () => window.removeEventListener("beforeunload", naWyjscie);
  }, [zmieniona]);

  function przejdzNaRodzaj(docelowy: DocumentTemplateType) {
    setStan({ rodzaj: "ladowanie" });
    setBladPola(undefined);
    setBladOgolny(null);
    setKomunikat(null);
    setTyp(docelowy);
  }

  function wybierzRodzaj(docelowy: string) {
    const nowy = docelowy as DocumentTemplateType;
    if (nowy === typ) return;
    if (zmieniona) {
      setDialog({ rodzaj: "zmien-rodzaj", docelowy: nowy });
      return;
    }
    przejdzNaRodzaj(nowy);
  }

  function wroc() {
    if (zmieniona) {
      setDialog({ rodzaj: "wroc" });
      return;
    }
    router.back();
  }

  function cofnijZmiany() {
    if (!zmieniona) return;
    setDialog({ rodzaj: "cofnij" });
  }

  function potwierdzDialog() {
    if (!dialog) return;
    setDialog(null);
    if (dialog.rodzaj === "cofnij") {
      setTresc(zapisana);
      setBladPola(undefined);
      setBladOgolny(null);
    } else if (dialog.rodzaj === "zmien-rodzaj") {
      przejdzNaRodzaj(dialog.docelowy);
    } else {
      router.back();
    }
  }

  async function zapisz() {
    if (stan.rodzaj !== "gotowy" || zapisywanie) return;
    const blad = bladTresci(tresc, zapisana);
    setBladOgolny(null);
    setKomunikat(null);
    if (blad) {
      setBladPola(blad);
      return;
    }
    setBladPola(undefined);
    setZapisywanie(true);
    try {
      const zapisany = await updateDocumentTemplate(typ, tresc);
      setTresc(zapisany.content);
      setStan({ rodzaj: "gotowy", wzor: zapisany, historia: historiaPoZapisie(stan.historia, zapisany) });
      setKomunikat(
        `Zapisano wersję ${zapisany.version} wzoru „${etykietaRodzaju(typ)}”. Poprzednie wersje zostają w historii.`,
      );
    } catch (wyjatek) {
      const wynik = wynikZBleduZapisu(wyjatek);
      if (wynik.rodzaj === "pole") setBladPola(wynik.tresc);
      else setBladOgolny(wynik.tresc);
    } finally {
      setZapisywanie(false);
    }
  }

  const naglowek = {
    okruszki: OKRUSZKI,
    tytul: "Wzory dokumentów",
    opis: "Treść dokumentów, które powstają dla osób w programie. Zapis zakłada nową wersję wzoru.",
    onPowrot: wroc,
    dzieci: (
      <Field
        id="rodzaj-wzoru"
        etykieta="Rodzaj wzoru"
        rodzaj="wybor"
        opcje={OPCJE_RODZAJU}
        wartosc={typ}
        onZmiana={wybierzRodzaj}
      />
    ),
  };

  let glowna: ReactNode;
  let wspierajaca: ReactNode = null;

  if (stan.rodzaj === "ladowanie") {
    glowna = (
      <div className={style.kolumna} aria-busy="true">
        <Skeleton wiersze={8} />
      </div>
    );
    wspierajaca = <Skeleton wiersze={4} />;
  } else if (stan.rodzaj === "brak-uprawnien") {
    glowna = (
      <EmptyState
        wariant="brak-uprawnien"
        naglowek="Wzorami dokumentów zajmuje się administracja"
        rola="administracji"
        przycisk={{ etykieta: "Wróć", onClick: wroc }}
      />
    );
  } else if (stan.rodzaj === "brak-wzoru") {
    glowna = (
      <EmptyState
        naglowek="Brak wzoru tego typu"
        tresc="Dla wybranego rodzaju nie ma jeszcze zapisanego wzoru albo edytor wzorów jest wyłączony w tym środowisku. Dokumenty powstają wtedy z wbudowanego wzoru."
        przycisk={{ etykieta: "Wróć", onClick: wroc }}
      />
    );
  } else if (stan.rodzaj === "siec") {
    glowna = (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać wzoru"
        akcja={
          <Button
            poziom="outline"
            onClick={() => {
              setStan({ rodzaj: "ladowanie" });
              setProba((numer) => numer + 1);
            }}
          >
            Spróbuj ponownie
          </Button>
        }
      >
        Serwer nie odpowiedział albo zwrócił błąd. Treść wzoru nie jest pokazywana bez danych.
      </Notice>
    );
  } else {
    const { wzor, historia } = stan;
    glowna = (
      <div className={style.kolumna}>
        {bladOgolny && (
          <Notice wariant="error" tytul="Nie zapisano wzoru">
            {bladOgolny}
          </Notice>
        )}
        <FormSection
          tytul={`Treść wzoru: ${etykietaRodzaju(typ)}`}
          pola={[
            {
              id: "tresc-wzoru",
              etykieta: "Treść wzoru",
              rodzaj: "wieloliniowy",
              wymagane: true,
              wartosc: tresc,
              onZmiana: (wartosc) => {
                setTresc(wartosc);
                setBladPola(undefined);
              },
              podpowiedz:
                "Wzór to kod HTML z polami w podwójnych nawiasach klamrowych. Zachowaj ich zapis — dzięki niemu dokument dostaje dane osoby.",
              blad: bladPola,
            },
          ]}
          etykietaAnuluj="Cofnij zmiany"
          etykietaZapisz="Zapisz nową wersję"
          onAnuluj={cofnijZmiany}
          onZapisz={() => void zapisz()}
        />
      </div>
    );
    wspierajaca = (
      <div className={style.kolumna}>
        <KeyValueRow etykieta="Bieżąca wersja" wartosc={`Wersja ${wzor.version}`} />
        <KeyValueRow
          etykieta="Ostatnia zmiana"
          wartosc={`${formatujMomentZmiany(wzor.updated_at)} — ${opisAutora(wzor.updated_by)}`}
        />
        <DataTable
          tytul="Historia wersji"
          kolumny={[
            { klucz: "wersja", etykieta: "Wersja" },
            { klucz: "kiedy", etykieta: "Kiedy" },
            { klucz: "kto", etykieta: "Kto" },
          ]}
          wiersze={wierszeHistorii(historia)}
          komunikatPusty="Brak wcześniejszych wersji."
        />
        <Text wariant="pusty">Historia pokazuje wersje, daty i osoby — bez treści wcześniejszych wersji.</Text>
      </div>
    );
  }

  return (
    <>
      <DetailTemplate
        naglowek={naglowek}
        glowna={
          <>
            {glowna}
            {komunikat && <Toast komunikat={komunikat} onZamknij={() => setKomunikat(null)} />}
          </>
        }
        wspierajaca={wspierajaca}
      />
      {dialog && <OknoDialogu dialog={dialog} onWycofaj={() => setDialog(null)} onPotwierdz={potwierdzDialog} />}
    </>
  );
}

interface WlasciwosciOkna {
  dialog: StanDialogu;
  onWycofaj: () => void;
  onPotwierdz: () => void;
}

function OknoDialogu({ dialog, onWycofaj, onPotwierdz }: WlasciwosciOkna) {
  const wroc = dialog.rodzaj === "wroc";
  const cofnij = dialog.rodzaj === "cofnij";
  return (
    <Dialog
      tytul={cofnij ? "Cofnąć zmiany we wzorze?" : "Porzucić niezapisane zmiany?"}
      etykietaWycofania="Zostań i edytuj"
      etykietaPotwierdzenia={cofnij ? "Cofnij zmiany" : wroc ? "Wyjdź bez zapisu" : "Zmień rodzaj bez zapisu"}
      niebezpieczne
      onWycofaj={onWycofaj}
      onPotwierdz={onPotwierdz}
    >
      <Text>Treść wpisana od ostatniego zapisu zostanie utracona. Zapisane wersje nie zmieniają się.</Text>
    </Dialog>
  );
}
