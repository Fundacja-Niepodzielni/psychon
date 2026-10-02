"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { QuestionDraft } from "@/lib/h10/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import {
  bladZapisu,
  dodajPytanie,
  numerTestu,
  pobierzPytania,
  sklasyfikujBladOdczytu,
  usunPytanie,
  zapiszPytanie,
  type BladOdczytu,
  type PytanieTestu,
} from "./dane";
import { FormularzPytania } from "./FormularzPytania";
import {
  BEZ_BLEDOW,
  bledyZSerwera,
  liczbaPytan,
  opisPytania,
  pustySzkic,
  saBledy,
  skrot,
  szkicZPytania,
  walidujSzkic,
  zdanieUsuniecia,
  ZDANIE_OTWARTEGO_FORMULARZA,
  zmieniony,
  type BledyFormularza,
} from "./logika";
import style from "./PytaniaTestu.module.css";

/** Panel, z którego otwarto ekran: rozstrzyga wyłącznie okruszki i powrót. Żądania są te same. */
export type PanelEkranu = "administracja" | "prowadzacy";

const ADRES_LISTY_KURSOW: Record<PanelEkranu, string> = {
  administracja: "/admin/kursy",
  prowadzacy: "/prowadzacy/kursy",
};

const TYTUL = "Pytania testu";

interface WlasciwosciPytaniaTestu {
  /** Numer testu z adresu (tak adresują go trasy serwera). */
  idTestu: string;
  panel: PanelEkranu;
  /** Numer kursu z parametru adresu `kurs`, gdy jest: okruszek prowadzi wtedy do tego kursu. */
  idKursu?: string | null;
}

type Odczyt = { rodzaj: "ladowanie" } | { rodzaj: "blad"; blad: BladOdczytu } | { rodzaj: "ok" };

/** Otwarty formularz: nowe pytanie albo edycja pytania o danym numerze. */
type Edycja =
  | { rodzaj: "nowe"; szkic: QuestionDraft; wyjsciowy: QuestionDraft }
  | { rodzaj: "zmiana"; idPytania: number; szkic: QuestionDraft; wyjsciowy: QuestionDraft };

/** Identyfikator nagłówka wiersza pytania — cel fokusu po zapisie. */
function idWiersza(idPytania: number): string {
  return `pytanie-testu-${idPytania}`;
}

/**
 * Ekran „Pytania testu” — pytania testu końcowego kursu, jeden komponent dla
 * panelu administracji i panelu prowadzącego. To samo działanie co
 * dotychczasowy bank pytań (`components/h10/QuestionBank.tsx`): lista pytań,
 * dodawanie, edycja treści i odpowiedzi z jedną odpowiedzią poprawną,
 * usuwanie. Kolejności nie zmienia (dotychczasowy ekran też nie). Te same
 * cztery trasy w obu panelach — kto może co, rozstrzyga serwer.
 *
 * Układ jak inne nowe ekrany zespołu: szablon szczegółu, nagłówek z okruszkami
 * do kursów (albo do kursu z parametru adresu) i jednym zielonym przyciskiem
 * „Dodaj pytanie”. Gdy formularz jest otwarty, zielony jest tylko „Zapisz
 * pytanie”, a przyciski innych pytań są nieczynne ze zdaniem dlaczego.
 * Po zapisie potwierdza wspólne powiadomienie; niezapisane zmiany zgłasza
 * wspólne pytanie przed wyjściem; odmowy i „nie znaleziono” — wspólny ekran odmowy.
 */
export function PytaniaTestu({ idTestu, panel, idKursu = null }: WlasciwosciPytaniaTestu) {
  const router = useRouter();
  const numer = numerTestu(idTestu);
  const [odczyt, setOdczyt] = useState<Odczyt>(numer === null ? { rodzaj: "blad", blad: { rodzaj: "nie-znaleziono" } } : { rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [pytania, setPytania] = useState<PytanieTestu[]>([]);
  const [edycja, setEdycja] = useState<Edycja | null>(null);
  const [bledy, setBledy] = useState<BledyFormularza>(BEZ_BLEDOW);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [numerOdmowy, setNumerOdmowy] = useState(0);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [doUsuniecia, setDoUsuniecia] = useState<PytanieTestu | null>(null);
  const [usuwane, setUsuwane] = useState<number | null>(null);
  const [bladUsuniecia, setBladUsuniecia] = useState<string | null>(null);
  const [powiadomienie, setPowiadomienie] = useState<string | null>(null);
  const fokusNa = useRef<string | null>(null);
  const idListy = useId();
  const idZdaniaBlokady = useId();
  const idZdaniaUsuwania = useId();

  useZgloszenieNiezapisanychZmian(edycja !== null && zmieniony(edycja.szkic, edycja.wyjsciowy), TYTUL);

  useEffect(() => {
    if (numer === null) return undefined;
    let aktualne = true;
    pobierzPytania(numer).then(
      (lista) => {
        if (!aktualne) return;
        setPytania(lista);
        setOdczyt({ rodzaj: "ok" });
      },
      (wyjatek: unknown) => {
        if (aktualne) setOdczyt({ rodzaj: "blad", blad: sklasyfikujBladOdczytu(wyjatek) });
      },
    );
    return () => {
      aktualne = false;
    };
  }, [numer, proba]);

  // Fokus po zapisie i usunięciu: na wiersz pytania albo na nagłówek listy.
  useEffect(() => {
    if (fokusNa.current === null) return;
    document.getElementById(fokusNa.current)?.focus();
    fokusNa.current = null;
  });

  const zamknijPowiadomienie = useCallback(() => setPowiadomienie(null), []);

  const adresListy = ADRES_LISTY_KURSOW[panel];
  const kurs = idKursu !== null && numerTestu(idKursu) !== null ? idKursu : null;
  const okruszki = [
    { etykieta: "Kursy", href: adresListy },
    ...(kurs !== null ? [{ etykieta: "Kurs", href: `${adresListy}/${kurs}` }] : []),
    { etykieta: TYTUL },
  ];
  const adresPowrotu = kurs !== null ? `${adresListy}/${kurs}` : adresListy;

  function ponow() {
    setOdczyt({ rodzaj: "ladowanie" });
    setProba((n) => n + 1);
  }

  function otworzNowe() {
    if (edycja !== null) return;
    setPowiadomienie(null);
    setBledy(BEZ_BLEDOW);
    setKomunikat(null);
    setEdycja({ rodzaj: "nowe", szkic: pustySzkic(), wyjsciowy: pustySzkic() });
  }

  function otworzZmiane(pytanie: PytanieTestu) {
    if (edycja !== null) return;
    setPowiadomienie(null);
    setBledy(BEZ_BLEDOW);
    setKomunikat(null);
    setBladUsuniecia(null);
    setEdycja({ rodzaj: "zmiana", idPytania: pytanie.id, szkic: szkicZPytania(pytanie), wyjsciowy: szkicZPytania(pytanie) });
  }

  function zamknijFormularz() {
    if (zapisywanie || edycja === null) return;
    const cel = edycja.rodzaj === "zmiana" ? idWiersza(edycja.idPytania) : idListy;
    setEdycja(null);
    setBledy(BEZ_BLEDOW);
    setKomunikat(null);
    fokusNa.current = cel;
  }

  async function zapisz() {
    if (edycja === null || zapisywanie || numer === null) return;
    const lokalne = walidujSzkic(edycja.szkic);
    if (saBledy(lokalne)) {
      setBledy(lokalne);
      setKomunikat(null);
      setNumerOdmowy((n) => n + 1);
      return;
    }
    setZapisywanie(true);
    setBledy(BEZ_BLEDOW);
    setKomunikat(null);
    try {
      if (edycja.rodzaj === "nowe") {
        const nowe = await dodajPytanie(numer, edycja.szkic);
        setPytania((lista) => [...lista, nowe]);
        setPowiadomienie(`Dodano pytanie ${nowe.sequence_order}.`);
        fokusNa.current = idWiersza(nowe.id);
      } else {
        const po = await zapiszPytanie(edycja.idPytania, edycja.szkic);
        setPytania((lista) => lista.map((pytanie) => (pytanie.id === po.id ? po : pytanie)));
        setPowiadomienie(`Zapisano zmiany w pytaniu ${po.sequence_order}.`);
        fokusNa.current = idWiersza(po.id);
      }
      setEdycja(null);
    } catch (wyjatek) {
      const odmowa = bladZapisu(wyjatek, edycja.rodzaj === "nowe" ? "Nie udało się dodać pytania." : "Nie udało się zapisać pytania.");
      const zSerwera = bledyZSerwera(odmowa.pola);
      setBledy(zSerwera);
      // Zdanie ogólne stoi nad formularzem tylko wtedy, gdy żadne pole nie ma własnego błędu.
      setKomunikat(saBledy(zSerwera) ? null : odmowa.komunikat);
      setNumerOdmowy((n) => n + 1);
    } finally {
      setZapisywanie(false);
    }
  }

  async function usun(pytanie: PytanieTestu) {
    setDoUsuniecia(null);
    setUsuwane(pytanie.id);
    setBladUsuniecia(null);
    setPowiadomienie(null);
    try {
      await usunPytanie(pytanie.id);
      setPytania((lista) => lista.filter((element) => element.id !== pytanie.id));
      setPowiadomienie(`Usunięto pytanie ${pytanie.sequence_order}.`);
      fokusNa.current = idListy;
    } catch (wyjatek) {
      setBladUsuniecia(bladZapisu(wyjatek, "Nie udało się usunąć pytania.").komunikat);
    } finally {
      setUsuwane(null);
    }
  }

  const ekranStanu = (tresc: ReactNode) => (
    <DetailTemplate naglowek={{ okruszki, tytul: TYTUL, onPowrot: () => router.back() }} glowna={tresc} wspierajaca={null} />
  );

  if (odczyt.rodzaj === "ladowanie") {
    return ekranStanu(
      <div className={style.blok}>
        <p role="status" className={style.zdanie}>
          Wczytywanie pytań…
        </p>
        <Skeleton wiersze={6} />
      </div>,
    );
  }

  if (odczyt.rodzaj === "blad") {
    const { blad } = odczyt;
    const wroc = { etykieta: kurs !== null ? "Wróć do kursu" : "Wróć do kursów", onClick: () => router.push(adresPowrotu) };
    if (blad.rodzaj === "brak-dostepu") {
      return ekranStanu(
        <EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa="administracji" coDalej={blad.komunikat ?? undefined} przycisk={wroc} />,
      );
    }
    if (blad.rodzaj === "nie-znaleziono") {
      return ekranStanu(<EkranOdmowy rodzaj="nie-znaleziono" czego="testu" stopien={2} przycisk={wroc} />);
    }
    const siec = blad.rodzaj === "siec";
    return ekranStanu(
      <div className={style.blok}>
        <Notice
          wariant="error"
          tytul={siec ? "Brak połączenia" : "Nie udało się wczytać pytań testu"}
          akcja={
            <Button poziom="primary" onClick={ponow}>
              Spróbuj ponownie
            </Button>
          }
        >
          {siec
            ? "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."
            : (blad.komunikat ?? "Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.")}
        </Notice>
      </div>,
    );
  }

  const formularzOtwarty = edycja !== null;
  const formularz = (prefiks: string, tytul: string) =>
    edycja === null ? null : (
      <FormularzPytania
        prefiks={prefiks}
        tytul={tytul}
        szkic={edycja.szkic}
        onZmiana={(szkic) => setEdycja({ ...edycja, szkic })}
        bledy={bledy}
        komunikat={komunikat}
        zapisywanie={zapisywanie}
        onZapisz={() => void zapisz()}
        onAnuluj={zamknijFormularz}
        numerOdmowy={numerOdmowy}
      />
    );

  return (
    <DetailTemplate
      naglowek={{
        okruszki,
        tytul: TYTUL,
        opis: `Test końcowy · ${liczbaPytan(pytania.length)}`,
        onPowrot: () => router.back(),
        przyciskGlowny: formularzOtwarty ? undefined : { etykieta: "Dodaj pytanie", onKliknij: otworzNowe },
      }}
      glowna={
        <div className={style.blok}>
          {powiadomienie !== null && <Toast komunikat={powiadomienie} onZamknij={zamknijPowiadomienie} />}
          {bladUsuniecia !== null && (
            <Notice wariant="error" tytul="Nie udało się usunąć pytania">
              {bladUsuniecia}
            </Notice>
          )}

          <section className={style.karta} aria-labelledby={idListy}>
            <Heading stopien={2} id={idListy}>
              Pytania
            </Heading>
            {formularzOtwarty && <Hint id={idZdaniaBlokady}>{ZDANIE_OTWARTEGO_FORMULARZA}</Hint>}
            {usuwane !== null && (
              <p id={idZdaniaUsuwania} role="status" className={style.zdanie}>
                Usuwamy pytanie. Poczekaj chwilę.
              </p>
            )}

            {pytania.length === 0 && edycja?.rodzaj !== "nowe" && (
              <EmptyState
                naglowek="Ten test nie ma jeszcze pytań"
                tresc="Dodaj pierwsze pytanie. Każde pytanie ma co najmniej 2 odpowiedzi i jedną odpowiedź poprawną."
                przycisk={{ etykieta: "Dodaj pierwsze pytanie", onClick: otworzNowe }}
              />
            )}

            {pytania.length > 0 && (
              <ol className={style.lista}>
                {pytania.map((pytanie) => {
                  const edytowane = edycja?.rodzaj === "zmiana" && edycja.idPytania === pytanie.id;
                  if (edytowane) {
                    return (
                      <li key={pytanie.id} className={style.wierszOtwarty}>
                        {formularz(`pytanie-${pytanie.id}`, `Edycja pytania ${pytanie.sequence_order}`)}
                      </li>
                    );
                  }
                  const trwaUsuwanie = usuwane === pytanie.id;
                  const nieczynne = formularzOtwarty || usuwane !== null;
                  const powod = formularzOtwarty ? idZdaniaBlokady : usuwane !== null ? idZdaniaUsuwania : undefined;
                  return (
                    <li key={pytanie.id} className={style.wiersz}>
                      <span className={style.numer} aria-hidden="true">
                        {pytanie.sequence_order}
                      </span>
                      <div className={style.opis}>
                        <h3 id={idWiersza(pytanie.id)} tabIndex={-1} className={style.tytulWiersza}>
                          {`Pytanie ${pytanie.sequence_order}`}
                        </h3>
                        <p className={style.tresc}>{skrot(pytanie.body)}</p>
                        <p className={style.meta}>{opisPytania(pytanie)}</p>
                      </div>
                      <div className={style.akcje}>
                        <Button
                          poziom="outline"
                          rozmiar="sm"
                          onClick={() => otworzZmiane(pytanie)}
                          disabled={nieczynne}
                          aria-label={`Edytuj pytanie ${pytanie.sequence_order}`}
                          aria-describedby={powod}
                        >
                          Edytuj
                        </Button>
                        <Button
                          poziom="quiet"
                          rozmiar="sm"
                          niebezpieczny
                          onClick={() => setDoUsuniecia(pytanie)}
                          disabled={nieczynne}
                          aria-label={`Usuń pytanie ${pytanie.sequence_order}`}
                          aria-describedby={powod}
                        >
                          {trwaUsuwanie ? "Usuwanie…" : "Usuń"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {edycja?.rodzaj === "nowe" && <div className={style.wierszOtwarty}>{formularz("nowe-pytanie", "Nowe pytanie")}</div>}
          </section>

          {doUsuniecia !== null && (
            <Dialog
              tytul={`Usunąć pytanie ${doUsuniecia.sequence_order}?`}
              etykietaWycofania="Zostaw pytanie"
              etykietaPotwierdzenia="Usuń pytanie"
              niebezpieczne
              onWycofaj={() => setDoUsuniecia(null)}
              onPotwierdz={() => void usun(doUsuniecia)}
            >
              <Text>{`„${skrot(doUsuniecia.body)}”`}</Text>
              <Text>{zdanieUsuniecia(doUsuniecia)}</Text>
            </Dialog>
          )}
        </div>
      }
      wspierajaca={
        <section className={style.karta} aria-labelledby={`${idListy}-zasady`}>
          <Heading stopien={2} id={`${idListy}-zasady`}>
            Jak działają pytania
          </Heading>
          <Text>Każde pytanie ma co najmniej 2 odpowiedzi i dokładnie jedną odpowiedź poprawną.</Text>
          <Text>
            Zmiany w pytaniach nie dotykają zakończonych podejść: każde z nich ma własną kopię treści z chwili rozwiązywania.
          </Text>
        </section>
      }
    />
  );
}
