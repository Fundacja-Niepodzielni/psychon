"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { QuestionDraft } from "@/lib/h10/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { zdanieRuchuWiersza } from "@/design-system/molekuly/StrzalkiKolejnosci/zdania";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { Dialog, oglosWPanelu, type BladDialogu } from "@/design-system/organizmy/Dialog/Dialog";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import {
  bladZapisu,
  dodajPytanie,
  numerTestu,
  pobierzPytania,
  sklasyfikujBladOdczytu,
  usunPytanie,
  zapiszKolejnosc,
  zapiszPytanie,
  type BladOdczytu,
  type PytanieTestu,
} from "./dane";
import { FormularzPytania, listaBledow } from "./FormularzPytania";
import { idWiersza, ListaPytan } from "./ListaPytan";
import {
  BEZ_BLEDOW,
  bledyZSerwera,
  DLUGOSC_NAZWY_WIERSZA,
  liczbaPytan,
  planZamiany,
  pustySzkic,
  saBledy,
  skrot,
  szkicZPytania,
  walidujSzkic,
  zdanieUsuniecia,
  ZDANIE_ZAPISU_KOLEJNOSCI,
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

/** Otwarte okno formularza: nowe pytanie albo edycja pytania o danym numerze. */
type Edycja =
  | { rodzaj: "nowe"; szkic: QuestionDraft; wyjsciowy: QuestionDraft }
  | { rodzaj: "zmiana"; idPytania: number; szkic: QuestionDraft; wyjsciowy: QuestionDraft };

/** Podsumowanie błędów okna formularza: lista (każda zmiana to nowa tablica — fokus na podsumowanie) i tytuł. */
interface BledyOkna {
  lista: BladDialogu[];
  tytul?: string;
}

/** Błąd akcji na liście (usunięcie, kolejność): tytuł komunikatu i zdanie. */
interface BladAkcji {
  tytul: string;
  tresc: string;
}

function prefiksFormularza(edycja: Edycja): string {
  return edycja.rodzaj === "nowe" ? "nowe-pytanie" : `pytanie-${edycja.idPytania}`;
}

/**
 * Ekran „Pytania testu” — pytania testu końcowego kursu, jeden komponent dla
 * panelu administracji i panelu prowadzącego. To samo działanie co
 * dotychczasowy bank pytań (`components/h10/QuestionBank.tsx`): lista pytań
 * z pełną treścią i odpowiedziami, dodawanie, edycja treści i odpowiedzi
 * z jedną odpowiedzią poprawną, usuwanie; do tego zmiana kolejności
 * strzałkami po lewej stronie wiersza. Te same trasy w obu panelach — kto
 * może co, rozstrzyga serwer.
 *
 * Układ jak inne nowe ekrany zespołu: szablon szczegółu, nagłówek z okruszkami
 * do kursów (albo do kursu z parametru adresu) i jednym zielonym przyciskiem
 * „Dodaj pytanie”. Przyciski w treści są drugorzędne. Pytanie dodaje się
 * i zmienia we wspólnym oknie formularza, usunięcie potwierdza wspólne okno
 * w wariancie niebezpiecznym. Numer pytania na ekranie to jego miejsce na
 * liście (1, 2, 3); numer z serwera jest wewnętrzny. Po zapisie potwierdza
 * wspólne powiadomienie; niezapisane zmiany zgłasza wspólne pytanie przed
 * wyjściem; odmowy i „nie znaleziono” — wspólny ekran odmowy.
 */
export function PytaniaTestu({ idTestu, panel, idKursu = null }: WlasciwosciPytaniaTestu) {
  const router = useRouter();
  const numer = numerTestu(idTestu);
  const [odczyt, setOdczyt] = useState<Odczyt>(numer === null ? { rodzaj: "blad", blad: { rodzaj: "nie-znaleziono" } } : { rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [pytania, setPytania] = useState<PytanieTestu[]>([]);
  const [edycja, setEdycja] = useState<Edycja | null>(null);
  const [bledy, setBledy] = useState<BledyFormularza>(BEZ_BLEDOW);
  const [bledyOkna, setBledyOkna] = useState<BledyOkna | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [doUsuniecia, setDoUsuniecia] = useState<PytanieTestu | null>(null);
  const [usuwane, setUsuwane] = useState<number | null>(null);
  const [zapisKolejnosci, setZapisKolejnosci] = useState(false);
  const [bladAkcji, setBladAkcji] = useState<BladAkcji | null>(null);
  const [powiadomienie, setPowiadomienie] = useState<string | null>(null);
  const fokusNa = useRef<string | null>(null);
  const idListy = useId();
  const idZdaniaUsuwania = useId();
  const idZdaniaKolejnosci = useId();

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
  const zajete = usuwane !== null || zapisKolejnosci;
  const numerNaLiscie = (idPytania: number) => pytania.findIndex((pytanie) => pytanie.id === idPytania) + 1;

  function ponow() {
    setOdczyt({ rodzaj: "ladowanie" });
    setProba((n) => n + 1);
  }

  function otworzOkno(nowa: Edycja) {
    if (edycja !== null || doUsuniecia !== null) return;
    setPowiadomienie(null);
    setBledy(BEZ_BLEDOW);
    setBledyOkna(null);
    setEdycja(nowa);
  }

  function otworzNowe() {
    otworzOkno({ rodzaj: "nowe", szkic: pustySzkic(), wyjsciowy: pustySzkic() });
  }

  function otworzZmiane(pytanie: PytanieTestu) {
    if (zajete) return;
    otworzOkno({ rodzaj: "zmiana", idPytania: pytanie.id, szkic: szkicZPytania(pytanie), wyjsciowy: szkicZPytania(pytanie) });
  }

  function zamknijFormularz() {
    if (zapisywanie) return;
    setEdycja(null);
    setBledy(BEZ_BLEDOW);
    setBledyOkna(null);
  }

  /** Zapis z okna formularza: przy błędach w przeglądarce — bez żądania; zapis serwera — obietnica, okno czeka. */
  function zapisz(): Promise<void> | void {
    if (edycja === null || zapisywanie || numer === null) return;
    const biezaca = edycja;
    const prefiks = prefiksFormularza(biezaca);
    const lokalne = walidujSzkic(biezaca.szkic);
    if (saBledy(lokalne)) {
      setBledy(lokalne);
      setBledyOkna({ lista: listaBledow(lokalne, prefiks) });
      return;
    }
    setZapisywanie(true);
    setBledy(BEZ_BLEDOW);
    setBledyOkna(null);
    const numerZmienianego = biezaca.rodzaj === "zmiana" ? numerNaLiscie(biezaca.idPytania) : pytania.length + 1;
    const zadanie = biezaca.rodzaj === "nowe" ? dodajPytanie(numer, biezaca.szkic) : zapiszPytanie(biezaca.idPytania, biezaca.szkic);
    return zadanie
      .then(
        (zapisane) => {
          if (biezaca.rodzaj === "nowe") {
            setPytania((lista) => [...lista, zapisane]);
            setPowiadomienie(`Dodano pytanie ${numerZmienianego}.`);
          } else {
            setPytania((lista) => lista.map((pytanie) => (pytanie.id === zapisane.id ? zapisane : pytanie)));
            setPowiadomienie(`Zapisano zmiany w pytaniu ${numerZmienianego}.`);
          }
          fokusNa.current = idWiersza(zapisane.id);
          setEdycja(null);
        },
        (wyjatek: unknown) => {
          const odmowa = bladZapisu(wyjatek, biezaca.rodzaj === "nowe" ? "Nie udało się dodać pytania." : "Nie udało się zapisać pytania.");
          const zSerwera = bledyZSerwera(odmowa.pola);
          setBledy(zSerwera);
          // Zdanie ogólne serwera stoi w podsumowaniu tylko wtedy, gdy żadne pole nie ma własnego błędu.
          setBledyOkna(
            saBledy(zSerwera)
              ? { lista: listaBledow(zSerwera, prefiks) }
              : { lista: [{ tresc: odmowa.komunikat }], tytul: "Nie udało się zapisać pytania" },
          );
        },
      )
      .finally(() => setZapisywanie(false));
  }

  async function usun(pytanie: PytanieTestu) {
    const numerUsuwanego = numerNaLiscie(pytanie.id);
    setDoUsuniecia(null);
    setUsuwane(pytanie.id);
    setBladAkcji(null);
    setPowiadomienie(null);
    try {
      await usunPytanie(pytanie.id);
      setPytania((lista) => lista.filter((element) => element.id !== pytanie.id));
      setPowiadomienie(`Usunięto pytanie ${numerUsuwanego}.`);
      fokusNa.current = idListy;
    } catch (wyjatek) {
      setBladAkcji({ tytul: "Nie udało się usunąć pytania", tresc: bladZapisu(wyjatek, "Nie udało się usunąć pytania.").komunikat });
    } finally {
      setUsuwane(null);
    }
  }

  /**
   * Zamiana z sąsiadem: wiersz od razu na nowym miejscu, zapis w tle (trzy
   * kroki przez wolne miejsce). W czasie zapisu strzałki i przyciski wierszy
   * czekają. Odmowa zapisu: komunikat i lista wczytana od nowa z serwera —
   * przerwany zapis mógł wykonać część kroków.
   */
  async function przesun(idPytania: number, kierunek: -1 | 1) {
    if (zajete || numer === null) return;
    const indeks = pytania.findIndex((pytanie) => pytanie.id === idPytania);
    const plan = planZamiany(pytania, indeks, kierunek);
    if (plan === null) return;
    const przenoszone = pytania[indeks];
    setPytania(plan.po);
    setZapisKolejnosci(true);
    setBladAkcji(null);
    setPowiadomienie(null);
    oglosWPanelu(zdanieRuchuWiersza(skrot(przenoszone.body, DLUGOSC_NAZWY_WIERSZA), indeks + kierunek + 1, pytania.length));
    try {
      await zapiszKolejnosc(plan.kroki);
    } catch (wyjatek) {
      const { komunikat } = bladZapisu(wyjatek, "Nie udało się zapisać kolejności.");
      setBladAkcji({ tytul: "Nie udało się zapisać kolejności", tresc: `${komunikat} Lista pokazuje kolejność zapisaną na serwerze.` });
      try {
        setPytania(await pobierzPytania(numer));
      } catch (bladOdczytu) {
        setOdczyt({ rodzaj: "blad", blad: sklasyfikujBladOdczytu(bladOdczytu) });
      }
    } finally {
      setZapisKolejnosci(false);
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
      <div className={`${style.blok} ${style.ponow}`}>
        <Notice
          wariant="error"
          tytul={siec ? "Brak połączenia" : "Nie udało się wczytać pytań testu"}
          akcja={
            <Button poziom="outline" onClick={ponow}>
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

  const numerEdytowanego = edycja?.rodzaj === "zmiana" ? numerNaLiscie(edycja.idPytania) : null;

  return (
    <DetailTemplate
      naglowek={{
        okruszki,
        tytul: TYTUL,
        opis: `Test końcowy · ${liczbaPytan(pytania.length)}`,
        onPowrot: () => router.back(),
        przyciskGlowny: { etykieta: "Dodaj pytanie", onKliknij: otworzNowe },
      }}
      glowna={
        <div className={style.blok}>
          {powiadomienie !== null && <Toast komunikat={powiadomienie} onZamknij={zamknijPowiadomienie} />}
          {bladAkcji !== null && (
            <Notice wariant="error" tytul={bladAkcji.tytul}>
              {bladAkcji.tresc}
            </Notice>
          )}

          <section className={style.karta} aria-labelledby={idListy}>
            <Heading stopien={2} id={idListy}>
              Pytania
            </Heading>
            {usuwane !== null && (
              <p id={idZdaniaUsuwania} role="status" className={style.zdanie}>
                Usuwamy pytanie. Poczekaj chwilę.
              </p>
            )}
            {zapisKolejnosci && (
              <p id={idZdaniaKolejnosci} role="status" className={style.zdanie}>
                {ZDANIE_ZAPISU_KOLEJNOSCI}
              </p>
            )}

            {pytania.length === 0 && (
              <div className={style.pusty}>
                <EmptyState
                  naglowek="Ten test nie ma jeszcze pytań"
                  tresc="Dodaj pierwsze pytanie. Każde pytanie ma co najmniej 2 odpowiedzi i jedną odpowiedź poprawną."
                  przycisk={{ etykieta: "Dodaj pierwsze pytanie", onClick: otworzNowe }}
                />
              </div>
            )}

            {pytania.length > 0 && (
              <ListaPytan
                pytania={pytania}
                zajete={zajete}
                powod={usuwane !== null ? idZdaniaUsuwania : zapisKolejnosci ? idZdaniaKolejnosci : undefined}
                usuwane={usuwane}
                onEdytuj={otworzZmiane}
                onUsun={(pytanie) => {
                  if (!zajete && edycja === null) setDoUsuniecia(pytanie);
                }}
                onPrzesun={(idPytania, kierunek) => void przesun(idPytania, kierunek)}
              />
            )}
          </section>

          {edycja !== null && (
            <Dialog
              wariant="formularz"
              tytul={edycja.rodzaj === "nowe" ? "Nowe pytanie" : `Edycja pytania ${numerEdytowanego}`}
              etykietaWycofania="Anuluj"
              etykietaPotwierdzenia="Zapisz pytanie"
              onWycofaj={zamknijFormularz}
              onPotwierdz={zapisz}
              bledy={bledyOkna?.lista}
              tytulBledow={bledyOkna?.tytul}
              zapisywanie={zapisywanie}
              niezapisaneZmiany={zmieniony(edycja.szkic, edycja.wyjsciowy)}
              fokusPoZamknieciu={idListy}
            >
              <FormularzPytania
                prefiks={prefiksFormularza(edycja)}
                szkic={edycja.szkic}
                onZmiana={(szkic) => setEdycja({ ...edycja, szkic })}
                bledy={bledy}
                zapisywanie={zapisywanie}
              />
            </Dialog>
          )}

          {doUsuniecia !== null && (
            <Dialog
              tytul={`Usunąć pytanie ${numerNaLiscie(doUsuniecia.id)}?`}
              etykietaWycofania="Zostaw pytanie"
              etykietaPotwierdzenia="Usuń pytanie"
              niebezpieczne
              onWycofaj={() => setDoUsuniecia(null)}
              onPotwierdz={() => void usun(doUsuniecia)}
              fokusPoZamknieciu={idListy}
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
          <Text>Kolejność pytań zmieniasz strzałkami po lewej stronie wiersza.</Text>
          <Text>
            Zmiany w pytaniach nie dotykają zakończonych podejść: każde z nich ma własną kopię treści z chwili rozwiązywania.
          </Text>
        </section>
      }
    />
  );
}
