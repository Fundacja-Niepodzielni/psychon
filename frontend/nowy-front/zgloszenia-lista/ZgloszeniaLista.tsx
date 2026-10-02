"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { rowneWartosci } from "@/nowy-front/wspolne/rowne-wartosci";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { FileDropZone, type PlikFileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import type { ApplicationItem, ApplicationStatus } from "@/lib/h03/types";
import {
  OPCJE_STATUSU,
  PUSTY_FILTR,
  PUSTY_FORMULARZ_ZGLOSZENIA,
  dodajZgloszenie,
  filtrAktywny,
  importujZgloszenia,
  klasyfikujBladDodania,
  klasyfikujBladImportu,
  pobierzZgloszenia,
  powodPominiecia,
  rodzajBledu,
  wierszeZgloszen,
  type BladDodania,
  type BladImportu,
  type FiltrZgloszen,
  type FormularzZgloszenia,
  type RaportImportu,
} from "./dane";
import style from "./ZgloszeniaLista.module.css";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "dane"; zgloszenia: ApplicationItem[]; meta: PaginationMeta | undefined }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "siec" };

/** Stan importu z pliku: panel z wyborem pliku, wysyłka, raport albo błąd. */
type StanImportu =
  | { rodzaj: "bezczynny" }
  | { rodzaj: "trwa"; plik: File }
  | { rodzaj: "raport"; plik: File; raport: RaportImportu }
  | { rodzaj: "blad"; plik: File | null; blad: Exclude<BladImportu, { rodzaj: "brak-uprawnien" }> };

interface Zapytanie {
  filtr: FiltrZgloszen;
  strona: number;
  /** Rośnie przy każdym ponowieniu, żeby to samo zapytanie wczytało się jeszcze raz. */
  proba: number;
}

// Ekran jest podstroną „Spraw” (rejestr menu ramki): w nowej ramce okruszek składa reguła z rejestru.
const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Sprawy" }, { etykieta: "Zgłoszenia rekrutacyjne" }];

/**
 * Ekran A-03 „Zgłoszenia rekrutacyjne” — lista na szablonie `ListTemplate`
 * (administracja). Odczyt: `GET /admin/applications`. Wiersz zgłoszenia to wzór
 * wiersza kolejki spraw (`wierszeZgloszen`): pogrubione imię i nazwisko, meta,
 * plakietka małą literą, akcja „Otwórz” (odnośnik do ekranu szczegółu; pełna
 * nazwa „Otwórz zgłoszenie: …” tylko dla czytnika); nagłówek `h2` listy jest
 * tylko dla czytnika. Dwie akcje nagłówka, każda raz, obok siebie:
 * „Dodaj zgłoszenie” (jedyny przycisk w kolorze, `POST /admin/applications`;
 * gdy formularz jest otwarty, kolor przejmuje jego przycisk zapisu) oraz
 * „Importuj z pliku CSV” (drugorzędna, `POST /admin/applications/import`).
 * Stany: ładowanie, dane, pusty (z filtrem i bez), brak uprawnień, błąd sieci
 * — każdy w tym samym szablonie, więc jeden `main` i znacznik szablonu są
 * zawsze w drzewie.
 */
export function ZgloszeniaLista() {
  const router = useRouter();
  const [formularz, setFormularz] = useState<FiltrZgloszen>(PUSTY_FILTR);
  const [zapytanie, setZapytanie] = useState<Zapytanie>({ filtr: PUSTY_FILTR, strona: 1, proba: 0 });
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  /** Akcje nagłówka pokazujemy dopiero po pierwszym udanym odczycie listy — wtedy rola jest potwierdzona. */
  const [rolaPotwierdzona, setRolaPotwierdzona] = useState(false);

  const [formularzOtwarty, setFormularzOtwarty] = useState(false);
  const [dane, setDane] = useState<FormularzZgloszenia>(PUSTY_FORMULARZ_ZGLOSZENIA);
  const [zapisuje, setZapisuje] = useState(false);
  const [bladDodania, setBladDodania] = useState<BladDodania | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useZgloszenieNiezapisanychZmian(
    formularzOtwarty && !rowneWartosci(dane, PUSTY_FORMULARZ_ZGLOSZENIA),
    "Zgłoszenia",
  );

  const [importOtwarty, setImportOtwarty] = useState(false);
  const [stanImportu, setImport] = useState<StanImportu>({ rodzaj: "bezczynny" });

  useEffect(() => {
    let anulowane = false;
    pobierzZgloszenia(zapytanie.filtr, zapytanie.strona)
      .then(({ data, meta }) => {
        if (anulowane) return;
        setRolaPotwierdzona(true);
        setStan({ rodzaj: "dane", zgloszenia: data, meta });
      })
      .catch((wyjatek: unknown) => {
        if (!anulowane) setStan({ rodzaj: rodzajBledu(wyjatek) });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  function przejdz(filtr: FiltrZgloszen, strona: number) {
    setStan({ rodzaj: "ladowanie" });
    setZapytanie((poprzednie) => ({ filtr, strona, proba: poprzednie.proba + 1 }));
  }

  /** Po zapisie lista wczytuje się jeszcze raz bez szkieletu — filtr i strona zostają, akcje nie migają. */
  function odswiez() {
    setZapytanie((poprzednie) => ({ ...poprzednie, proba: poprzednie.proba + 1 }));
  }

  function odmowaRoli() {
    setStan({ rodzaj: "brak-uprawnien" });
  }

  async function wyslijPlik(plik: File) {
    setImport({ rodzaj: "trwa", plik });
    try {
      const raport = await importujZgloszenia(plik);
      setImport({ rodzaj: "raport", plik, raport });
      odswiez();
    } catch (wyjatek) {
      const blad = klasyfikujBladImportu(wyjatek);
      if (blad.rodzaj === "brak-uprawnien") odmowaRoli();
      else setImport({ rodzaj: "blad", plik, blad });
    }
  }

  function wybierzPliki(pliki: FileList) {
    if (stanImportu.rodzaj === "trwa") return;
    if (pliki.length > 1) {
      setImport({ rodzaj: "blad", plik: null, blad: { rodzaj: "plik", komunikat: "Wybierz jeden plik naraz." } });
      return;
    }
    void wyslijPlik(pliki[0]);
  }

  function przelaczImport() {
    setImportOtwarty((otwarty) => !otwarty);
    setImport({ rodzaj: "bezczynny" });
  }

  /** Pusty stan „Wczytaj zgłoszenia z pliku” otwiera panel importu na tym samym ekranie. */
  function otworzImport() {
    setImportOtwarty(true);
    setImport({ rodzaj: "bezczynny" });
  }

  async function zapiszZgloszenie() {
    if (zapisuje) return;
    setZapisuje(true);
    setBladDodania(null);
    setToast(null);
    try {
      await dodajZgloszenie(dane);
      setDane(PUSTY_FORMULARZ_ZGLOSZENIA);
      setFormularzOtwarty(false);
      setToast("Zgłoszenie zostało dodane.");
      odswiez();
    } catch (wyjatek) {
      const blad = klasyfikujBladDodania(wyjatek);
      if (blad.rodzaj === "brak-uprawnien") odmowaRoli();
      else setBladDodania(blad);
    } finally {
      setZapisuje(false);
    }
  }

  function zastosujFiltr(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    const filtr = { ...formularz, search: formularz.search.trim() };
    setFormularz(filtr);
    przejdz(filtr, 1);
  }

  function wyczyscFiltr() {
    setFormularz(PUSTY_FILTR);
    przejdz(PUSTY_FILTR, 1);
  }

  const meta = stan.rodzaj === "dane" ? stan.meta : undefined;
  const opis =
    meta !== undefined
      ? `Kandydaci zgłoszeni do programu. Razem zgłoszeń: ${meta.total}.`
      : "Kandydaci zgłoszeni do programu.";

  const zamknijToast = useCallback(() => setToast(null), []);

  const akcjaImportu =
    rolaPotwierdzona && stan.rodzaj !== "brak-uprawnien"
      ? {
          etykieta: "Importuj z pliku CSV",
          onKliknij: przelaczImport,
          wylaczona: stanImportu.rodzaj === "trwa",
          rozwinieta: importOtwarty,
        }
      : undefined;

  // Jedyny przycisk w kolorze stoi w nagłówku (`przyciskGlowny`); gdy
  // formularz jest otwarty, kolor przejmuje jego przycisk zapisu.
  const przyciskGlowny =
    rolaPotwierdzona && stan.rodzaj !== "brak-uprawnien" && !formularzOtwarty
      ? {
          etykieta: "Dodaj zgłoszenie",
          onKliknij: () => {
            setToast(null);
            setFormularzOtwarty(true);
          },
        }
      : undefined;

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Zgłoszenia rekrutacyjne"
      opis={opis}
      onPowrot={() => router.back()}
      przyciskGlowny={przyciskGlowny}
      akcjaDrugorzedna={akcjaImportu}
    />
  );

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Lista zgłoszeń jest niedostępna"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  const aktywny = filtrAktywny(zapytanie.filtr);

  const filtry = (
    <form className={style.filtry} onSubmit={zastosujFiltr} aria-label="Filtr zgłoszeń">
      <div className={style.stan}>
        <Field
          id="zgloszenia-stan"
          etykieta="Stan"
          rodzaj="wybor"
          opcje={OPCJE_STATUSU}
          wartosc={formularz.status}
          onZmiana={(wartosc) => setFormularz((f) => ({ ...f, status: wartosc as ApplicationStatus | "" }))}
        />
      </div>
      <div className={style.szukaj}>
        <Field
          id="zgloszenia-szukaj"
          etykieta="Szukaj"
          rodzaj="tekst"
          placeholder="Imię, nazwisko lub e-mail"
          wartosc={formularz.search}
          onZmiana={(wartosc) => setFormularz((f) => ({ ...f, search: wartosc }))}
        />
      </div>
      <Button poziom="outline" type="submit">
        Filtruj
      </Button>
      {aktywny && (
        <Button poziom="outline" type="button" onClick={wyczyscFiltr}>
          Wyczyść filtr
        </Button>
      )}
    </form>
  );

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = <Skeleton wiersze={5} />;
  } else if (stan.rodzaj === "siec") {
    lista = (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać zgłoszeń"
        akcja={
          <Button poziom="outline" onClick={() => przejdz(zapytanie.filtr, zapytanie.strona)}>
            Spróbuj ponownie
          </Button>
        }
      >
        Sprawdź połączenie z internetem i spróbuj jeszcze raz.
      </Notice>
    );
  } else if (stan.zgloszenia.length === 0 && aktywny) {
    lista = (
      <EmptyState
        wariant="brak-wynikow-filtra"
        naglowek="Brak zgłoszeń spełniających filtr"
        tresc="Zmień stan albo szukaną frazę, albo wyczyść filtr."
        przycisk={{ etykieta: "Wyczyść filtr", onClick: wyczyscFiltr }}
      />
    );
  } else if (stan.zgloszenia.length === 0) {
    lista = (
      <EmptyState
        naglowek="Brak zgłoszeń w tym roku programu"
        tresc="Zgłoszenia pojawią się tu po zgłoszeniu się kandydatów. Możesz też wczytać je z pliku."
        przycisk={{ etykieta: "Wczytaj zgłoszenia z pliku", onClick: otworzImport }}
      />
    );
  } else {
    lista = (
      <RecordList
        tytul="Lista zgłoszeń"
        stopienNaglowka={2}
        naglowekTylkoDlaCzytnika
        wierszeBezWciecia
        wiersze={wierszeZgloszen(stan.zgloszenia)}
        pusty={{
          naglowek: "Brak zgłoszeń",
          tresc: "Nie ma zgłoszeń do pokazania.",
          przycisk: { etykieta: "Wyczyść filtr", onClick: wyczyscFiltr },
        }}
      />
    );
  }

  const stronicowanie =
    meta !== undefined && meta.last_page > 1 ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => przejdz(zapytanie.filtr, meta.current_page - 1)}
        naNastepna={() => przejdz(zapytanie.filtr, meta.current_page + 1)}
      />
    ) : undefined;

  const pliki: PlikFileDropZone[] =
    stanImportu.rodzaj === "trwa"
      ? [{ nazwa: stanImportu.plik.name, stan: "przetwarzanie", komunikat: "Wczytywanie…" }]
      : stanImportu.rodzaj === "raport"
        ? [{ nazwa: stanImportu.plik.name, stan: "gotowy", komunikat: "Plik wczytany." }]
        : stanImportu.rodzaj === "blad" && stanImportu.plik !== null
          ? [{ nazwa: stanImportu.plik.name, stan: "blad", komunikat: "Plik nie został wczytany." }]
          : [];

  const panelImportu = importOtwarty ? (
    <section className={style.panel} aria-label="Import zgłoszeń z pliku">
      <Heading stopien={2}>Importuj z pliku CSV</Heading>
      <Text>
        Każdy wiersz pliku to jedno zgłoszenie. Pierwszy wiersz zawiera nazwy kolumn; wymagane są imię, nazwisko i
        adres e-mail. Jeśli w pliku czegoś zabraknie, raport pokaże, których wierszy nie wczytano i dlaczego.
      </Text>
      <FileDropZone
        id="zgloszenia-import-plik"
        etykieta="Wybierz plik CSV albo upuść go tutaj"
        podpowiedz="Jeden plik, do 5 MB."
        pliki={pliki}
        onWybierzPliki={wybierzPliki}
      />
      {stanImportu.rodzaj === "raport" && <RaportImportuNotice raport={stanImportu.raport} />}
      {stanImportu.rodzaj === "blad" && (
        <BladImportuNotice
          blad={stanImportu.blad}
          ponow={stanImportu.plik !== null ? () => void wyslijPlik(stanImportu.plik as File) : undefined}
        />
      )}
      <div>
        <Button poziom="outline" type="button" onClick={przelaczImport}>
          Wróć do listy
        </Button>
      </div>
    </section>
  ) : null;

  const bledyPol = bladDodania?.rodzaj === "pola" ? bladDodania.bledy : {};
  const dopisz = (pole: keyof FormularzZgloszenia) => (wartosc: string) =>
    setDane((poprzednie) => ({ ...poprzednie, [pole]: wartosc }));
  const poleFormularza = (
    pole: keyof FormularzZgloszenia,
    id: string,
    etykieta: string,
    wymagane: boolean,
  ): PoleFormSection => ({
    id,
    etykieta,
    rodzaj: "tekst",
    wartosc: dane[pole],
    onZmiana: dopisz(pole),
    blad: bledyPol[pole],
    wymagane,
  });

  const panelFormularza = formularzOtwarty ? (
    <div className={style.panel}>
      {bladDodania !== null && <BladDodaniaNotice blad={bladDodania} adres={dane.email.trim()} />}
      <FormSection
        fokusPrzyOtwarciu
        tytul="Nowe zgłoszenie"
        pola={[
          poleFormularza("first_name", "zgloszenie-nowe-imie", "Imię", true),
          poleFormularza("last_name", "zgloszenie-nowe-nazwisko", "Nazwisko", true),
          poleFormularza("email", "zgloszenie-nowe-email", "E-mail", true),
          poleFormularza("phone", "zgloszenie-nowe-telefon", "Telefon", false),
        ]}
        etykietaAnuluj="Wróć do listy"
        etykietaZapisz={zapisuje ? "Zapisywanie…" : "Zapisz zgłoszenie"}
        onAnuluj={() => {
          setFormularzOtwarty(false);
          setBladDodania(null);
        }}
        onZapisz={() => void zapiszZgloszenie()}
      />
    </div>
  ) : null;

  const zawartosc = (
    <div className={style.zawartosc}>
      {toast !== null && <Toast komunikat={toast} onZamknij={zamknijToast} />}
      {panelImportu}
      {panelFormularza}
      {lista}
    </div>
  );

  return <ListTemplate naglowek={naglowek} filtry={filtry} lista={zawartosc} stronicowanie={stronicowanie} />;
}

/** Raport z importu: liczby z odpowiedzi serwera i lista pominiętych wierszy (numer wiersza pliku + powód po polsku). */
function RaportImportuNotice({ raport }: { raport: RaportImportu }) {
  const pominiete = raport.skipped;
  const brakWierszy = raport.imported === 0 && pominiete.length === 0;
  return (
    <Notice
      wariant={pominiete.length === 0 && raport.imported > 0 ? "ok" : "warn"}
      tytul="Raport z wczytywania pliku"
      // Lista pominiętych wierszy stoi w miejscu na akcję, bo `Notice` ma tam zwykły `div`;
      // w `Text` (akapit) lista byłaby niepoprawnym HTML.
      akcja={
        pominiete.length > 0 ? (
          <>
            <Heading stopien={3}>Pominięte wiersze</Heading>
            <ul className={style.pominiete}>
              {pominiete.map((wiersz) => (
                <li key={`${wiersz.line}-${wiersz.reason}`}>
                  <Text>{`Wiersz ${wiersz.line}: ${powodPominiecia(wiersz.reason)}`}</Text>
                </li>
              ))}
            </ul>
          </>
        ) : undefined
      }
    >
      {`Zaimportowano zgłoszeń: ${raport.imported}. Pominięto wierszy: ${pominiete.length}.${
        brakWierszy ? " W pliku nie było żadnych wierszy z danymi." : ""
      }`}
    </Notice>
  );
}

function BladImportuNotice({
  blad,
  ponow,
}: {
  blad: Exclude<BladImportu, { rodzaj: "brak-uprawnien" }>;
  ponow: (() => void) | undefined;
}) {
  if (blad.rodzaj === "plik") {
    return (
      <Notice wariant="error" tytul="Nie udało się wczytać pliku">
        {blad.komunikat}
      </Notice>
    );
  }
  const akcja = ponow ? (
    <Button poziom="outline" type="button" onClick={ponow}>
      Spróbuj ponownie
    </Button>
  ) : undefined;
  return (
    <Notice wariant="error" tytul="Nie udało się wczytać pliku" akcja={akcja}>
      {blad.rodzaj === "serwer"
        ? "Serwer zwrócił błąd. Spróbuj ponownie za chwilę."
        : "Sprawdź połączenie z internetem i spróbuj jeszcze raz."}
    </Notice>
  );
}

function BladDodaniaNotice({ blad, adres }: { blad: BladDodania; adres: string }) {
  if (blad.rodzaj === "duplikat") {
    return (
      <Notice wariant="warn" tytul="Zgłoszenie z tym adresem już istnieje">
        {`Na liście jest już zgłoszenie z adresem e-mail ${adres}. Zmień adres albo znajdź to zgłoszenie na liście.`}
      </Notice>
    );
  }
  if (blad.rodzaj === "pola") {
    if (blad.pozostale.length === 0) return null;
    return (
      <Notice wariant="error" tytul="Popraw dane zgłoszenia">
        {blad.pozostale.join(" ")}
      </Notice>
    );
  }
  return (
    <Notice wariant="error" tytul="Nie udało się dodać zgłoszenia">
      {blad.rodzaj === "serwer"
        ? "Serwer zwrócił błąd. Dane w formularzu zostały — spróbuj ponownie za chwilę."
        : "Sprawdź połączenie z internetem. Dane w formularzu zostały — spróbuj jeszcze raz."}
    </Notice>
  );
}
