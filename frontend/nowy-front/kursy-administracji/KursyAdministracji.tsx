"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { rowneWartosci } from "@/nowy-front/wspolne/rowne-wartosci";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { StrzalkiKolejnosci } from "@/design-system/molekuly/StrzalkiKolejnosci/StrzalkiKolejnosci";
import { useRuchWierszy } from "@/design-system/molekuly/StrzalkiKolejnosci/ruch";
import { zdanieRuchuWiersza } from "@/design-system/molekuly/StrzalkiKolejnosci/zdania";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import type { WierszDataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import {
  COURSE_TYPE_LABELS,
  type CourseType,
  type ReorderImpactRow,
} from "@/lib/h08/types";
import {
  imieNazwisko,
  pobierzProwadzacych,
  przypiszProwadzacego,
  type Prowadzacy,
} from "@/nowy-front/kurs-administracji/dane";
import {
  ZDANIE_BRAKU_PROWADZACEGO,
  zapamietajOstrzezeniePoUtworzeniu,
} from "@/nowy-front/kurs-administracji/ostrzezenie-po-utworzeniu";
import { pobierzKursy, podgladKolejnosci, utworzKurs, zapiszKolejnosc, type KursAdministracji } from "./dane";
import {
  KOMUNIKAT_SIECI,
  adresKursu,
  czyBrakUprawnien,
  identyfikatorZTytulu,
  komunikatKoperty,
  kursyWSciezce,
  pozycjaZPola,
  przesun,
  wierszePodgladu,
  wierszeKursow,
  KOLUMNY_KURSOW,
} from "./logika";
import style from "./KursyAdministracji.module.css";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad"; komunikat?: string }
  | { rodzaj: "dane"; kursy: KursAdministracji[]; meta: PaginationMeta | undefined };

interface PolaFormularza {
  tytul: string;
  identyfikator: string;
  typ: CourseType;
  pozycja: string;
  opis: string;
  /** Identyfikator wybranego prowadzącego albo pusty napis — pole nie jest obowiązkowe. */
  prowadzacy: string;
}

/** Lista prowadzących do pola „Prowadzący”: czytana przy otwarciu formularza, z tego samego źródła co karta na ekranie kursu. */
type StanProwadzacych = { rodzaj: "ladowanie" } | { rodzaj: "blad" } | { rodzaj: "gotowe"; osoby: Prowadzacy[] };

const PUSTE_POLA: PolaFormularza = {
  tytul: "",
  identyfikator: "",
  typ: "course",
  pozycja: "",
  opis: "",
  prowadzacy: "",
};

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Kursy" }];

const OPCJE_TYPU = (Object.keys(COURSE_TYPE_LABELS) as CourseType[]).map((wartosc) => ({
  wartosc,
  etykieta: COURSE_TYPE_LABELS[wartosc],
}));

const POLA_WPLYWU = [
  { klucz: "osoba", etykieta: "Osoba" },
  { klucz: "kurs", etykieta: "Kurs" },
  { klucz: "bylo", etykieta: "Było" },
  { klucz: "bedzie", etykieta: "Będzie" },
] as const;

/**
 * Podgląd wpływu zmiany kolejności w oknie potwierdzenia: jedna pozycja na osobę, pola pod sobą
 * (Osoba, Kurs, Było, Będzie). Okno ma stałą szerokość 440 px, więc czterokolumnowa tabela łamałaby
 * wyrazy w środku; w układzie pionowym każda wartość ma całą szerokość pozycji i łamie się tylko na spacjach.
 * Lista przewija się w pionie (`.wplyw`), więc jest fokusowalna z nazwą: czytelnik klawiatury może ją przewijać.
 */
function WplywZmiany({ wiersze }: { wiersze: WierszDataTable[] }) {
  if (wiersze.length === 0) return <Text wariant="pusty">Ta zmiana nie zmienia statusu żadnej osoby.</Text>;
  return (
    <ul className={style.wplyw} aria-label="Wpływ nowej kolejności na statusy kursów" tabIndex={0}>
      {wiersze.map((wiersz) => (
        <li key={wiersz.id} className={style.wplywPozycja}>
          <dl className={style.wplywPola}>
            {POLA_WPLYWU.map((pole) => (
              <Fragment key={pole.klucz}>
                <dt className={style.wplywEtykieta}>{pole.etykieta}</dt>
                <dd className={style.wplywWartosc}>{String(wiersz.wartosci[pole.klucz])}</dd>
              </Fragment>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

const SELEKTOR_PRZYCISKU_GLOWNEGO = '[data-testid="pageheader-przycisk-glowny"] button';
const SELEKTOR_PRZYCISKU_KOLEJNOSCI = '[data-fokus="kolejnosc"]';

/** Komunikat błędu operacji (zapis kursu, podgląd, zapis kolejności) — odmowa roli, komunikat serwera albo brak połączenia. */
function komunikatOperacji(blad: unknown, ogolny: string): string {
  if (blad instanceof ApiError) {
    if (blad.status === 403) return zdanieOdmowyRoli("administracji");
    return komunikatKoperty(blad) ?? ogolny;
  }
  return KOMUNIKAT_SIECI;
}

/**
 * Ekran „Kursy” (administracja) na szablonie `ListTemplate`: lista kursów
 * (`GET /admin/courses`), akcja główna „Utwórz kurs” w nagłówku (formularz
 * `FormSection`, `POST /admin/courses`, po zapisie przejście na ekran kursu; przy
 * otwartym formularzu jedynym przyciskiem głównym jest jego „Utwórz kurs”),
 * akcja drugorzędna „Zmień kolejność ścieżki” (przesuwanie w górę i w dół,
 * podgląd skutków `POST /admin/courses/reorder/preview`, potwierdzenie w oknie
 * `Dialog`, zapis `PATCH /admin/courses/reorder`). Stany: wczytywanie, błąd
 * z ponowieniem, pusto, odmowa z powodu roli — każdy w tym samym szablonie.
 * Wiersz kursu prowadzi do dotychczasowego ekranu kursu (`/admin/kursy/{id}`).
 */
export function KursyAdministracji() {
  const router = useRouter();
  const [zapytanie, setZapytanie] = useState({ strona: 1, proba: 0 });
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });

  const [formularzOtwarty, setFormularzOtwarty] = useState(false);
  const [kluczFormularza, setKluczFormularza] = useState(0);
  const [pola, setPola] = useState<PolaFormularza>(PUSTE_POLA);
  const [identyfikatorReczny, setIdentyfikatorReczny] = useState(false);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]>>({});
  const [bladFormularza, setBladFormularza] = useState<string | null>(null);
  const [zapisuje, setZapisuje] = useState(false);
  const [prowadzacy, setProwadzacy] = useState<StanProwadzacych>({ rodzaj: "ladowanie" });

  const [kolejnosc, setKolejnosc] = useState<KursAdministracji[] | null>(null);
  const [komunikatPrzesuniecia, setKomunikatPrzesuniecia] = useState("");
  // Płynna zamiana wierszy i fokus na tej samej strzałce daje pomocnik molekuły strzałek.
  const listaKolejnosci = useRef<HTMLOListElement>(null);
  useRuchWierszy(listaKolejnosci);
  const [bladKolejnosci, setBladKolejnosci] = useState<string | null>(null);
  const [liczyWplyw, setLiczyWplyw] = useState(false);
  const [podglad, setPodglad] = useState<ReorderImpactRow[] | null>(null);
  const [zapisujeKolejnosc, setZapisujeKolejnosc] = useState(false);
  const [bladOkna, setBladOkna] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Otwarty formularz bez wpisu i tryb kolejności bez przesunięcia nie są niezapisaną pracą.
  useZgloszenieNiezapisanychZmian(
    (formularzOtwarty && !rowneWartosci(pola, PUSTE_POLA)) ||
      (kolejnosc !== null &&
        stan.rodzaj === "dane" &&
        !rowneWartosci(
          kolejnosc.map((kurs) => kurs.id),
          kursyWSciezce(stan.kursy).map((kurs) => kurs.id),
        )),
    "Kursy",
  );

  // Fokus po zmianie ekranu: selektory sprawdzane po zatwierdzeniu zmiany w DOM, pierwszy znaleziony dostaje fokus.
  const celeFokusu = useRef<string[]>([]);
  const [znacznikFokusu, setZnacznikFokusu] = useState(0);

  function zadajFokus(...selektory: string[]) {
    celeFokusu.current = selektory;
    setZnacznikFokusu((n) => n + 1);
  }

  useEffect(() => {
    const selektory = celeFokusu.current;
    celeFokusu.current = [];
    for (const selektor of selektory) {
      const element = document.querySelector<HTMLElement>(selektor);
      if (element) {
        element.focus();
        return;
      }
    }
  }, [znacznikFokusu]);

  useEffect(() => {
    let aktualne = true;
    pobierzKursy(zapytanie.strona)
      .then(({ data, meta }) => {
        if (aktualne) setStan({ rodzaj: "dane", kursy: data, meta });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(czyBrakUprawnien(blad) ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad", komunikat: komunikatKoperty(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [zapytanie]);

  function wczytaj(strona: number, zSzkieletem = true) {
    if (zSzkieletem) setStan({ rodzaj: "ladowanie" });
    setZapytanie((poprzednie) => ({ strona, proba: poprzednie.proba + 1 }));
  }

  function zmienPole<K extends keyof PolaFormularza>(klucz: K, wartosc: PolaFormularza[K]) {
    setPola((poprzednie) => ({ ...poprzednie, [klucz]: wartosc }));
  }

  function zmienTytul(tytul: string) {
    setPola((poprzednie) => ({
      ...poprzednie,
      tytul,
      identyfikator: identyfikatorReczny ? poprzednie.identyfikator : identyfikatorZTytulu(tytul),
    }));
  }

  function zmienIdentyfikator(identyfikator: string) {
    // Ręczna zmiana zatrzymuje wypełnianie z tytułu; opróżnione pole oddaje identyfikator z powrotem tytułowi.
    setIdentyfikatorReczny(identyfikator !== "");
    setPola((poprzednie) => ({ ...poprzednie, identyfikator }));
  }

  function otworzFormularz() {
    if (kolejnosc !== null || formularzOtwarty) return;
    setPola(PUSTE_POLA);
    setIdentyfikatorReczny(false);
    setBledyPol({});
    setBladFormularza(null);
    setKluczFormularza((n) => n + 1);
    setFormularzOtwarty(true);
    setProwadzacy({ rodzaj: "ladowanie" });
    pobierzProwadzacych()
      .then((osoby) => setProwadzacy({ rodzaj: "gotowe", osoby }))
      .catch(() => setProwadzacy({ rodzaj: "blad" }));
  }

  function anulujFormularz() {
    if (zapisuje) return;
    setFormularzOtwarty(false);
    setBledyPol({});
    setBladFormularza(null);
    zadajFokus(SELEKTOR_PRZYCISKU_GLOWNEGO);
  }

  async function zapiszKurs() {
    if (zapisuje) return;
    setZapisuje(true);
    setBladFormularza(null);
    setBledyPol({});
    try {
      const utworzony = await utworzKurs({
        title: pola.tytul.trim(),
        slug: pola.identyfikator.trim(),
        type: pola.typ,
        sequence_order: pozycjaZPola(pola.pozycja),
        description: pola.opis.trim() === "" ? null : pola.opis.trim(),
      });
      if (pola.prowadzacy !== "") {
        // Kurs już istnieje: odmowa przypisania nie wraca do formularza (ponowny zapis utworzyłby drugi kurs),
        // tylko zostaje zdaniem na ekranie kursu, gdzie prowadzącego przypisuje karta „Prowadzący”.
        try {
          await przypiszProwadzacego(utworzony.id, Number(pola.prowadzacy), null);
        } catch {
          zapamietajOstrzezeniePoUtworzeniu(utworzony.id, ZDANIE_BRAKU_PROWADZACEGO);
        }
      }
      router.push(adresKursu(utworzony.id));
    } catch (blad) {
      if (blad instanceof ApiError && blad.errors) {
        setBledyPol(blad.errors);
        // Nowy klucz montuje sekcję od nowa — fokus trafia na podsumowanie błędów, a pole poza pierwszym poziomem jest rozwinięte.
        setKluczFormularza((n) => n + 1);
      } else {
        setBladFormularza(komunikatOperacji(blad, "Nie udało się utworzyć kursu. Spróbuj ponownie."));
      }
      setZapisuje(false);
    }
  }

  function rozpocznijZmianeKolejnosci(kursy: KursAdministracji[]) {
    if (formularzOtwarty) return;
    setBladKolejnosci(null);
    setKomunikatPrzesuniecia("");
    setKolejnosc(kursyWSciezce(kursy));
  }

  function anulujZmianeKolejnosci() {
    if (liczyWplyw) return;
    setKolejnosc(null);
    setPodglad(null);
    setBladKolejnosci(null);
    setKomunikatPrzesuniecia("");
    zadajFokus(SELEKTOR_PRZYCISKU_KOLEJNOSCI);
  }

  function przesunKurs(indeks: number, kierunek: -1 | 1) {
    if (!kolejnosc) return;
    const kurs = kolejnosc[indeks];
    const nowa = przesun(kolejnosc, indeks, kierunek);
    if (nowa === kolejnosc) return;
    setKolejnosc(nowa);
    setKomunikatPrzesuniecia(zdanieRuchuWiersza(kurs.title, indeks + kierunek + 1, nowa.length));
  }

  async function sprawdzWplyw() {
    if (!kolejnosc || liczyWplyw) return;
    setLiczyWplyw(true);
    setBladKolejnosci(null);
    setBladOkna(null);
    try {
      setPodglad(await podgladKolejnosci(kolejnosc.map((kurs) => kurs.id)));
    } catch (blad) {
      setBladKolejnosci(komunikatOperacji(blad, "Nie udało się policzyć wpływu zmiany kolejności."));
    } finally {
      setLiczyWplyw(false);
    }
  }

  async function potwierdzKolejnosc() {
    if (!kolejnosc || zapisujeKolejnosc) return;
    setZapisujeKolejnosc(true);
    setBladOkna(null);
    try {
      await zapiszKolejnosc(kolejnosc.map((kurs) => kurs.id));
      setPodglad(null);
      setKolejnosc(null);
      setKomunikatPrzesuniecia("");
      setToast("Zapisano nową kolejność ścieżki.");
      // Odświeżenie bez szkieletu: przycisk „Zmień kolejność ścieżki” zostaje w nagłówku i dostaje fokus.
      wczytaj(zapytanie.strona, false);
      zadajFokus(SELEKTOR_PRZYCISKU_KOLEJNOSCI);
    } catch (blad) {
      setBladOkna(komunikatOperacji(blad, "Nie udało się zapisać nowej kolejności."));
    } finally {
      setZapisujeKolejnosc(false);
    }
  }

  function wycofajOkno() {
    if (zapisujeKolejnosc) return;
    setPodglad(null);
    setBladOkna(null);
  }

  const dane = stan.rodzaj === "dane" ? stan : null;
  const wTrakcieZmianyKolejnosci = kolejnosc !== null;

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Kursy"
      opis="Twórz kursy i webinary, dodawaj lekcje i ustalaj kolejność ścieżki."
      onPowrot={() => router.back()}
      przyciskGlowny={
        dane && !formularzOtwarty
          ? {
              etykieta: "Utwórz kurs",
              onKliknij: otworzFormularz,
              niedostepny: wTrakcieZmianyKolejnosci
                ? { powod: "Najpierw zapisz albo anuluj zmianę kolejności ścieżki." }
                : undefined,
            }
          : undefined
      }
      dzieci={
        dane ? (
          <div className={style.drugorzedne}>
            <Button
              poziom="outline"
              onClick={() => rozpocznijZmianeKolejnosci(dane.kursy)}
              disabled={formularzOtwarty || wTrakcieZmianyKolejnosci}
              data-fokus="kolejnosc"
            >
              Zmień kolejność ścieżki
            </Button>
          </div>
        ) : undefined
      }
    />
  );

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EkranOdmowy rodzaj="brak-dostepu" stopien={2} rolaDocelowa="administracji" przycisk={{ etykieta: "Wróć", onClick: () => router.back() }} />
        }
      />
    );
  }

  const polaFormularza: PoleFormSection[] = [
    {
      id: "kurs-tytul",
      etykieta: "Tytuł",
      rodzaj: "tekst",
      wymagane: true,
      wartosc: pola.tytul,
      onZmiana: zmienTytul,
      blad: bledyPol.title?.[0],
    },
    {
      id: "kurs-identyfikator",
      etykieta: "Identyfikator",
      rodzaj: "tekst",
      wymagane: true,
      wartosc: pola.identyfikator,
      onZmiana: zmienIdentyfikator,
      podpowiedz: "Wypełnia się z tytułu — możesz go poprawić. Małe litery, cyfry i myślniki, np. wywiad-psychologiczny.",
      blad: bledyPol.slug?.[0],
    },
    {
      id: "kurs-typ",
      etykieta: "Typ",
      rodzaj: "wybor",
      opcje: OPCJE_TYPU,
      wartosc: pola.typ,
      onZmiana: (wartosc) => zmienPole("typ", wartosc as CourseType),
      blad: bledyPol.type?.[0],
    },
    {
      id: "kurs-opis",
      etykieta: "Opis",
      rodzaj: "wieloliniowy",
      wartosc: pola.opis,
      onZmiana: (wartosc) => zmienPole("opis", wartosc),
      blad: bledyPol.description?.[0],
    },
    {
      id: "kurs-prowadzacy",
      etykieta: "Prowadzący",
      rodzaj: "wybor",
      opcje: [
        { wartosc: "", etykieta: "Bez prowadzącego" },
        ...(prowadzacy.rodzaj === "gotowe"
          ? prowadzacy.osoby.map((osoba) => ({ wartosc: String(osoba.id), etykieta: imieNazwisko(osoba) }))
          : []),
      ],
      wartosc: pola.prowadzacy,
      onZmiana: (wartosc) => zmienPole("prowadzacy", wartosc),
      podpowiedz:
        prowadzacy.rodzaj === "blad"
          ? "Nie udało się wczytać prowadzących. Kurs możesz utworzyć bez nich i przypisać prowadzącego na ekranie kursu."
          : "Nieobowiązkowo. Zostanie przypisany do całego kursu; zmienisz to później na ekranie kursu.",
    },
    {
      id: "kurs-pozycja",
      etykieta: "Pozycja w ścieżce",
      rodzaj: "liczba",
      wartosc: pola.pozycja,
      onZmiana: (wartosc) => zmienPole("pozycja", wartosc),
      podpowiedz: "Puste pole oznacza kurs poza główną ścieżką, na przykład webinar.",
      blad: bledyPol.sequence_order?.[0],
    },
  ];

  const formularz = formularzOtwarty ? (
    <div className={style.formularz}>
      {bladFormularza && (
        <Notice wariant="error" tytul="Nie udało się utworzyć kursu">
          {bladFormularza}
        </Notice>
      )}
      <Text>Kurs powstaje jako szkic — publikacja jest osobną akcją na ekranie kursu i wymaga co najmniej jednej lekcji.</Text>
      <FormSection
        key={kluczFormularza}
        tytul="Nowy kurs"
        pola={polaFormularza}
        polaPierwszegoPoziomu={5}
        tytulDodatkowych="Miejsce w ścieżce"
        etykietaAnuluj="Anuluj"
        etykietaZapisz={zapisuje ? "Zapisywanie…" : "Utwórz kurs"}
        onAnuluj={anulujFormularz}
        onZapisz={() => void zapiszKurs()}
        fokusPrzyOtwarciu
      />
    </div>
  ) : null;

  const sekcjaKolejnosci =
    kolejnosc !== null ? (
      <section className={style.sekcja} aria-label="Kolejność ścieżki">
        <Heading stopien={2}>Kolejność ścieżki</Heading>
        <Text>Ustaw kolejność, a przed zapisem zobaczysz listę osób, którym zmienią się statusy kursów.</Text>
        {bladKolejnosci && (
          <Notice wariant="error" tytul="Nie udało się policzyć wpływu zmiany">
            {bladKolejnosci}
          </Notice>
        )}
        {kolejnosc.length === 0 ? (
          <Text wariant="pusty">Żaden kurs nie ma jeszcze pozycji w ścieżce.</Text>
        ) : (
          <ol className={style.kolejnosc} ref={listaKolejnosci}>
            {kolejnosc.map((kurs, indeks) => (
              <li key={kurs.id} className={style.pozycja} data-ruch-klucz={`kurs-${kurs.id}`}>
                <StrzalkiKolejnosci
                  tytul={kurs.title}
                  mozeWyzej={indeks > 0}
                  mozeNizej={indeks < kolejnosc.length - 1}
                  onWyzej={() => przesunKurs(indeks, -1)}
                  onNizej={() => przesunKurs(indeks, 1)}
                  numer={indeks + 1}
                />
                <span className={style.nazwa}>{kurs.title}</span>
              </li>
            ))}
          </ol>
        )}
        <p role="status" aria-live="polite" className={style.tylkoCzytnika}>
          {komunikatPrzesuniecia}
        </p>
        <div className={style.przyciski}>
          <Button poziom="quiet" onClick={anulujZmianeKolejnosci}>
            Anuluj
          </Button>
          <Button poziom="outline" onClick={() => void sprawdzWplyw()} disabled={kolejnosc.length < 2 || liczyWplyw}>
            {liczyWplyw ? "Liczenie wpływu…" : "Sprawdź wpływ zmiany"}
          </Button>
        </div>
      </section>
    ) : null;

  let lista: ReactNode;
  if (stan.rodzaj === "ladowanie") {
    lista = (
      <div className={style.szkielet}>
        <Skeleton wiersze={4} />
      </div>
    );
  } else if (stan.rodzaj === "blad") {
    lista = (
      <div className={style.zawartosc}>
        {/* Tytuł komunikatu to nagłówek trzeciego stopnia: poprzedza go nagłówek drugiego stopnia, jak na innych listach. */}
        <Heading stopien={2}>Lista kursów</Heading>
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać listy kursów"
          akcja={
            <Button poziom="outline" onClick={() => wczytaj(zapytanie.strona)}>
              Spróbuj ponownie
            </Button>
          }
        >
          {stan.komunikat ?? "Serwer nie odpowiedział albo zwrócił błąd. Lista kursów nie jest pokazywana bez danych."}
        </Notice>
      </div>
    );
  } else {
    lista = (
      <div className={style.zawartosc}>
        {formularz}
        {sekcjaKolejnosci ?? (
          <RecordList
            tytul="Lista kursów"
            stopienNaglowka={2}
            naglowekTylkoDlaCzytnika
            naKarcie
            kolumny={KOLUMNY_KURSOW}
            wiersze={wierszeKursow(stan.kursy)}
            pusty={{
              naglowek: "Brak kursów w tej edycji",
              tresc: "Utwórz pierwszy kurs — powstanie jako szkic, który opublikujesz po dodaniu lekcji.",
              przycisk: { etykieta: "Utwórz kurs", onClick: otworzFormularz },
            }}
          />
        )}
      </div>
    );
  }

  const meta = dane?.meta;
  const stronicowanie =
    meta !== undefined && meta.last_page > 1 ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => wczytaj(meta.current_page - 1)}
        naNastepna={() => wczytaj(meta.current_page + 1)}
      />
    ) : undefined;

  return (
    <>
      <ListTemplate naglowek={naglowek} lista={lista} stronicowanie={stronicowanie} />
      {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
      {podglad !== null && (
        <Dialog
          tytul="Potwierdź zmianę kolejności"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia={zapisujeKolejnosc ? "Zapisywanie…" : "Potwierdź zmianę kolejności"}
          onWycofaj={wycofajOkno}
          onPotwierdz={() => void potwierdzKolejnosc()}
        >
          <div className={style.dialogTresc}>
            <Text>
              Nowa kolejność ścieżki przestawia statusy kursów uczestnikom. Poniżej lista osób, których to dotyczy.
            </Text>
            {bladOkna && (
              <Notice wariant="error" tytul="Nie udało się zapisać kolejności">
                {bladOkna}
              </Notice>
            )}
            <WplywZmiany wiersze={wierszePodgladu(podglad)} />
          </div>
        </Dialog>
      )}
    </>
  );
}
