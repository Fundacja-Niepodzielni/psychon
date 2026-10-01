"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COURSE_TYPE_LABELS,
  PRODUCT_GROUP_LABELS,
  type AdminCourse,
  type AdminLesson,
  type CourseType,
  type ProductGroup,
} from "@/lib/h08/types";
import { ApiError } from "@/lib/api/klient";
import {
  dodajTemat,
  pobierzTematy,
  usunTemat,
  zapiszUkladTematow,
  zdanieBleduTematow,
  zmienTytulTematu as zmienTytulTematuApi,
  type GrupaTras,
} from "@/lib/api/h08-tematy";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState, zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { CourseTree } from "@/design-system/organizmy/CourseTree/CourseTree";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import type { PozycjaChecklisty } from "@/design-system/organizmy/PublishChecklist/PublishChecklist";
import type { StanDanych } from "@/design-system/organizmy/stanDanych";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { checklistaPublikacji, type WynikDanychKursu } from "@/nowy-front/kurs-publikacja/dane";
import { bledyZSerwera, cialoZapisu, walidujLokalnie, type BledyFormularza } from "@/nowy-front/lekcja-edycja/formularz";
import { sklasyfikujBlad, zmienPublikacje } from "@/nowy-front/publikacja-kursu/dane";
import {
  cialoUkladu,
  dopiszLekcje,
  dopiszTemat,
  kolejnoscZmieniona,
  przeniesLekcje,
  tematyDrzewa,
  tytulyDoZapisu,
  ukladZSerwera,
  usunLekcjeZUkladu,
  usunTematZUkladu,
  zmienTytulLekcji,
  zmienTytulTematu,
  type TematUkladu,
  type Uklad,
} from "./uklad";
import { tekstyDlaGrupy, zapisDlaGrupy } from "./zapis";
import style from "./KursTematy.module.css";

/** Kotwica drzewa tematów i lekcji — cel odnośników z panelu braków. */
const KOTWICA_LEKCJI = "lekcje";

/**
 * Wynik odczytu kursu, który przyjmuje ekran: do stanów wspólnych z ekranem
 * prowadzącego dochodzi „nie znaleziono” — odczyt administracji odróżnia brak
 * kursu (404) od braku roli (403) i od wygasłej sesji (401).
 */
export type WynikOdczytuKursu = WynikDanychKursu | { status: "nie-znaleziono" };

interface WlasciwosciKursTematy {
  idKursu: string;
  wynik: WynikOdczytuKursu;
  /**
   * Grupa tras ekranu: tą samą grupą ekran czyta kurs, zapisuje tematy, dane
   * kursu i tytuły lekcji. `instructor` — dane z tras `/instructor/…`
   * (`pobierzDaneKursu`), publikacja zostaje przy administracji. `admin` —
   * dane z tras `/admin/…` (`pobierzDaneKursuAdministracji`), a „Opublikuj
   * kurs” naprawdę zmienia stan kursu.
   */
  grupa: GrupaTras;
  /**
   * Ponowny odczyt kursu: po błędzie odczytu i po odmowie zapisu układu, który
   * na serwerze już się zmienił. Bez niej — odświeżenie trasy.
   */
  onPonow?: () => void;
  /** Sekcje pod drzewem tematów, w kolumnie głównej — z bieżącym stanem kursu. */
  podDrzewem?: (kurs: AdminCourse, lekcje: AdminLesson[]) => ReactNode;
  /** Ostatni blok ekranu, na końcu kolumny wspierającej — z bieżącym stanem kursu. */
  ostatniBlok?: (kurs: AdminCourse) => ReactNode;
  /** Formularz edycji lekcji pod jej wierszem; bez niego wiersz ma „Zmień nazwę”. */
  edycjaLekcji?: EdycjaLekcjiWiersza;
}

/**
 * Ekran A-12 „Kurs: tematy i lekcje” na szablonie `DetailTemplate`: nagłówek
 * z akcją główną „Opublikuj kurs”, panel braków O7 (`checklist` szablonu),
 * drzewo tematów i lekcji O12 w kolumnie głównej, dane kursu O11 w kolumnie
 * wspierającej. Każdy stan (sukces, ładowanie, błąd, brak uprawnień, pusty)
 * renderuje się WEWNĄTRZ szablonu — korzeń szablonu jest jedynym `main`.
 */
export function KursTematy({
  idKursu,
  wynik,
  grupa,
  onPonow,
  podDrzewem,
  ostatniBlok,
  edycjaLekcji,
}: WlasciwosciKursTematy) {
  const router = useRouter();
  const wroc = () => router.back();

  // Trzy różne odmowy, trzy różne stany: zdanie o roli pada wyłącznie przy 403.
  if (wynik.status === "brak-sesji" || wynik.status === "nie-znaleziono") {
    return <BezKursu rodzaj={wynik.status} idKursu={idKursu} grupa={grupa} wroc={wroc} />;
  }
  if (wynik.status === "brak-uprawnien") {
    return <BrakUprawnien idKursu={idKursu} grupa={grupa} wroc={wroc} />;
  }
  if (wynik.status === "blad") {
    return (
      <DetailTemplate
        naglowek={{ okruszki: tekstyDlaGrupy(grupa).okruszki, tytul: `Kurs ${idKursu}`, onPowrot: wroc }}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać kursu"
            akcja={
              <Button poziom="outline" onClick={onPonow ?? (() => router.refresh())}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Treść kursu nie jest zmyślana bez danych.
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }
  return (
    <EdytorTematow
      grupa={grupa}
      kursPoczatkowy={wynik.dane.kurs}
      lekcje={wynik.dane.lekcje}
      podDrzewem={podDrzewem}
      ostatniBlok={ostatniBlok}
      edycjaLekcji={edycjaLekcji}
      onWczytajPonownie={onPonow}
      wroc={wroc}
      przejdz={(adres) => router.push(adres)}
    />
  );
}

function BrakUprawnien({ idKursu, grupa, wroc }: { idKursu: string; grupa: GrupaTras; wroc: () => void }) {
  const teksty = tekstyDlaGrupy(grupa);
  return (
    <DetailTemplate
      naglowek={{ okruszki: teksty.okruszki, tytul: `Kurs ${idKursu}`, onPowrot: wroc }}
      glowna={
        <EmptyState
          wariant="brak-uprawnien"
          naglowek={teksty.naglowekOdmowy}
          rola={teksty.rolaOdmowy}
          przycisk={{ etykieta: "Wróć", onClick: wroc }}
        />
      }
      wspierajaca={null}
    />
  );
}

/**
 * Wygasła sesja i brak kursu — te same zdania co na pozostałych ekranach:
 * „Nie znaleziono kursu” jak po usunięciu kursu na tym ekranie, „Sesja
 * wygasła” jak w zgłoszeniu pomocy. Bez zdania o roli: rola nie jest powodem.
 */
function BezKursu({
  rodzaj,
  idKursu,
  grupa,
  wroc,
}: {
  rodzaj: "brak-sesji" | "nie-znaleziono";
  idKursu: string;
  grupa: GrupaTras;
  wroc: () => void;
}) {
  const teksty = tekstyDlaGrupy(grupa);
  const adresListy = teksty.okruszki[0]?.href;
  return (
    <DetailTemplate
      naglowek={{ okruszki: teksty.okruszki, tytul: `Kurs ${idKursu}`, onPowrot: wroc }}
      glowna={
        <div className={style.sekcja}>
          {rodzaj === "brak-sesji" ? (
            <Notice wariant="warn" tytul="Sesja wygasła">
              Zaloguj się ponownie, aby wrócić do kursu.
            </Notice>
          ) : (
            <>
              <Notice wariant="warn" tytul="Nie znaleziono kursu">
                Kurs nie istnieje albo został usunięty.
              </Notice>
              {adresListy && (
                <Text>
                  <Link href={adresListy}>Wróć do listy kursów</Link>
                </Text>
              )}
            </>
          )}
        </div>
      }
      wspierajaca={null}
    />
  );
}

type StanTematow =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-sesji" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "blad"; tresc: string }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "gotowy"; serwer: Uklad; lokalny: Uklad; historia: Uklad[]; ostatniTytul: number | null };

type StanDialogu =
  | { rodzaj: "dodaj" }
  | { rodzaj: "zmien"; temat: TematUkladu }
  | { rodzaj: "usun"; temat: TematUkladu }
  | { rodzaj: "porzuc" }
  | { rodzaj: "porzuc-lekcje"; dokad: () => void }
  | { rodzaj: "cofnij-publikacje" }
  | { rodzaj: "wyjscie"; dokad: () => void; tresc: string };

/** Dokąd ma wrócić fokus po zamknięciu formularza albo okna pytania. */
type CelFokusu =
  | { cel: "edytuj"; lekcja: number }
  | { cel: "dodaj"; temat: number }
  | { cel: "formularz" }
  | { cel: "tematy" }
  | { cel: "kolejnosc" };

interface FormularzNowejLekcji {
  temat: number;
  tytul: string;
  opis: string;
  czas: string;
}

interface FormularzKursu {
  tytul: string;
  opis: string;
  identyfikator: string;
  typ: CourseType;
  grupaProduktowa: ProductGroup;
}

type BledyKursu = Partial<Record<"tytul" | "opis" | "identyfikator" | "typ" | "grupaProduktowa" | "ogolny", string>>;

const OPCJE_TYPU = (Object.keys(COURSE_TYPE_LABELS) as CourseType[]).map((wartosc) => ({
  wartosc,
  etykieta: COURSE_TYPE_LABELS[wartosc],
}));

const OPCJE_GRUPY = (Object.keys(PRODUCT_GROUP_LABELS) as ProductGroup[]).map((wartosc) => ({
  wartosc,
  etykieta: PRODUCT_GROUP_LABELS[wartosc],
}));

/** Lekcja po zapisie z formularza przy wierszu — tyle, ile pokazuje drzewo. */
export interface LekcjaPoZapisie {
  id: number;
  title: string;
  duration_seconds: number;
}

/**
 * Formularz edycji lekcji rysowany pod jej wierszem. Podanie tej funkcji
 * zamienia w wierszu „Zmień nazwę” na „Edytuj”: lekcja ma wtedy jedną drogę
 * edycji i jeden zapis — ten z formularza.
 */
export type EdycjaLekcjiWiersza = (idLekcji: number, akcje: AkcjeEdycjiLekcji) => ReactNode;

export interface AkcjeEdycjiLekcji {
  zamknij: () => void;
  zapisano: (lekcja: LekcjaPoZapisie) => void;
  /** Formularz zgłasza, czy ma niezapisane zmiany — ekran pyta przed ich porzuceniem. */
  zmieniono: (zmieniony: boolean) => void;
  /** Lekcja usunięta na serwerze: znika z drzewa, formularz się zamyka. */
  usunieto: () => void;
  /** Wyjście na inny ekran z formularza — przez pytanie o niezapisane zmiany. */
  przejdz: (adres: string) => void;
  /** Ekran pokazuje okno pytania; formularz nie reaguje wtedy na Escape. */
  wstrzymany: boolean;
}

interface WlasciwosciEdytora {
  grupa: GrupaTras;
  kursPoczatkowy: AdminCourse;
  lekcje: AdminLesson[];
  podDrzewem?: (kurs: AdminCourse, lekcje: AdminLesson[]) => ReactNode;
  ostatniBlok?: (kurs: AdminCourse) => ReactNode;
  edycjaLekcji?: EdycjaLekcjiWiersza;
  /** Odczyt kursu z lekcjami od nowa; bez niej ekran czyta od nowa same tematy. */
  onWczytajPonownie?: () => void;
  wroc: () => void;
  przejdz: (adres: string) => void;
}

function EdytorTematow({
  grupa,
  kursPoczatkowy,
  lekcje: lekcjePoczatkowe,
  podDrzewem,
  ostatniBlok,
  edycjaLekcji,
  onWczytajPonownie,
  wroc,
  przejdz,
}: WlasciwosciEdytora) {
  const baza = useId();
  const [edytowanaLekcja, setEdytowanaLekcja] = useState<number | null>(null);
  const [lekcjaZmieniona, setLekcjaZmieniona] = useState(false);
  // Nowy obiekt przy każdym zamknięciu — efekt fokusu rusza także dla tej samej lekcji drugi raz.
  const [fokus, setFokus] = useState<CelFokusu | null>(null);
  // Jeden cichy obszar ogłoszeń ekranu (czytnik ekranu): dokąd trafiła
  // przeniesiona lekcja i że zmiany zostały zapisane. Zdarzenia, które mają już
  // `Toast` albo `Notice`, tu nie trafiają — nie byłyby czytane dwa razy.
  const [ogloszenie, setOgloszenie] = useState("");
  const [nowaLekcja, setNowaLekcja] = useState<FormularzNowejLekcji | null>(null);
  const [bledyNowejLekcji, setBledyNowejLekcji] = useState<BledyFormularza & { ogolny?: string }>({});
  // Lekcje założone i usunięte na tym ekranie — drzewo zmienia się bez ponownego
  // odczytu kursu, więc niezapisane zmiany kolejności zostają.
  const [dodane, setDodane] = useState<AdminLesson[]>([]);
  const [usuniete, setUsuniete] = useState<number[]>([]);
  const [czasyPoZapisie, setCzasyPoZapisie] = useState<Record<number, number>>({});
  const teksty = tekstyDlaGrupy(grupa);
  const zapis = zapisDlaGrupy(grupa);
  const idPrzyciskuPublikacji = `${baza}-opublikuj`;
  const [kurs, setKurs] = useState(kursPoczatkowy);
  const [stan, setStan] = useState<StanTematow>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [bladTresci, setBladTresci] = useState<string | null>(null);
  // Serwer odrzucił zapis układu, bo kurs ma już inne tematy albo lekcje
  // (`422 validation_failed` na `topics`): ponowny zapis da tę samą odmowę,
  // więc ekran proponuje wczytanie układu z serwera.
  const [ukladNieaktualny, setUkladNieaktualny] = useState(false);
  // Temat, którego nie da się usunąć, bo ma lekcje — zdanie przy liście tematów.
  const [odmowaUsuniecia, setOdmowaUsuniecia] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [checklistaOtwarta, setChecklistaOtwarta] = useState(false);
  const [gotowyDoPublikacji, setGotowyDoPublikacji] = useState(false);
  const [dialog, setDialog] = useState<StanDialogu | null>(null);
  const [poleDialogu, setPoleDialogu] = useState("");
  const [bladDialogu, setBladDialogu] = useState<string | null>(null);
  // Błąd, który nie dotyczy pola okna (sieć, odmowa serwera): komunikat w oknie.
  const [bladOkna, setBladOkna] = useState<string | null>(null);
  const [formularz, setFormularz] = useState<FormularzKursu | null>(null);
  const [bledyFormularza, setBledyFormularza] = useState<BledyKursu>({});
  const [publikowanie, setPublikowanie] = useState(false);
  const [brakiSerwera, setBrakiSerwera] = useState<PozycjaChecklisty[]>([]);
  const [bladPublikacji, setBladPublikacji] = useState<{ tytul: string; tresc: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Żądania, które już poszły: drugie zatwierdzenie tego samego formularza albo
  // okna przed odpowiedzią serwera nie wysyła drugiego żądania. Flagi żyją tutaj,
  // bo `FormSection` i `Dialog` nie mają stanu „w toku” dla swoich przycisków.
  const dodawanieLekcji = useRef(false);
  const wysylanieDialogu = useRef(false);

  useEffect(() => {
    let aktualne = true;
    pobierzTematy(grupa, kursPoczatkowy.id)
      .then((tematy) => {
        if (!aktualne) return;
        const serwer = ukladZSerwera(tematy, lekcjePoczatkowe);
        setStan({ rodzaj: "gotowy", serwer, lokalny: serwer, historia: [], ostatniTytul: null });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        if (blad instanceof ApiError && blad.status === 401) {
          setStan({ rodzaj: "brak-sesji" });
          return;
        }
        if (blad instanceof ApiError && blad.status === 403) {
          setStan({ rodzaj: "brak-uprawnien" });
          return;
        }
        if (blad instanceof ApiError && blad.status === 404) {
          setStan({ rodzaj: "nie-znaleziono" });
          return;
        }
        setStan({ rodzaj: "blad", tresc: zdanieBleduTematow(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [grupa, kursPoczatkowy.id, lekcjePoczatkowe, proba]);

  const lekcje = [...lekcjePoczatkowe.filter((lekcja) => !usuniete.includes(lekcja.id)), ...dodane];

  const liczbaZmian = stan.rodzaj === "gotowy" ? stan.historia.length : 0;

  const nowaLekcjaZmieniona =
    nowaLekcja !== null && (nowaLekcja.tytul !== "" || nowaLekcja.opis !== "" || nowaLekcja.czas !== "");
  const niezapisanaLekcja = (edytowanaLekcja !== null && lekcjaZmieniona) || nowaLekcjaZmieniona;
  // Otwarty formularz danych kursu bez żadnej zmiany nie jest niezapisaną pracą.
  const daneKursuZmienione =
    formularz !== null &&
    (formularz.tytul !== kurs.title ||
      formularz.opis !== (kurs.description ?? "") ||
      formularz.identyfikator !== kurs.slug ||
      formularz.typ !== kurs.type ||
      formularz.grupaProduktowa !== kurs.product_group);
  const saNiezapisaneDane = liczbaZmian > 0 || niezapisanaLekcja || daneKursuZmienione;

  // Wyjście z niezapisanymi zmianami pyta (M13) — także zamknięcie karty; liczą
  // się zmiany w drzewie, formularz lekcji i formularz danych kursu.
  useEffect(() => {
    if (!saNiezapisaneDane) return;
    function naWyjscie(zdarzenie: BeforeUnloadEvent) {
      zdarzenie.preventDefault();
    }
    window.addEventListener("beforeunload", naWyjscie);
    return () => window.removeEventListener("beforeunload", naWyjscie);
  }, [saNiezapisaneDane]);

  const zamknijChecklist = useCallback(() => {
    setChecklistaOtwarta(false);
    document.getElementById(idPrzyciskuPublikacji)?.focus();
  }, [idPrzyciskuPublikacji]);

  const zamknijBrakiSerwera = useCallback(() => {
    setBrakiSerwera([]);
    document.getElementById(idPrzyciskuPublikacji)?.focus();
  }, [idPrzyciskuPublikacji]);

  const zamknijToast = useCallback(() => setToast(null), []);

  // Zamknięcie formularza albo okna pytania oddaje fokus przyciskowi, który
  // istnieje i jest widoczny: „Edytuj” tej lekcji, „Dodaj lekcję” tematu albo
  // pierwsze pole formularza, a gdy go nie ma („Edytuj” ukryte w trybie
  // kolejności na wąskim oknie) — przełącznik „Kolejność”. Fokus nigdy nie
  // zostaje na `body`.
  useEffect(() => {
    if (fokus === null) return;
    const selektory: string[] = [];
    if (fokus.cel === "edytuj") selektory.push(`[data-edytuj-lekcje="${fokus.lekcja}"]`);
    if (fokus.cel === "dodaj") selektory.push(`[data-testid="ct-dodaj-${fokus.temat}"]`);
    if (fokus.cel === "formularz") selektory.push("[data-rozwiniecie-lekcji] input", "[data-pod-tematem] input");
    if (fokus.cel === "tematy") selektory.push("[data-dodaj-temat]");
    // Przełącznik „Kolejność” istnieje tylko na wąskim oknie; na szerokim
    // ostatnim celem jest pierwszy przycisk „Dodaj lekcję” drzewa.
    // Kurs bez tematów ma w tym miejscu tylko przycisk stanu pustego.
    selektory.push(
      `#${KOTWICA_LEKCJI} button[aria-pressed]`,
      `#${KOTWICA_LEKCJI} [data-testid^="ct-dodaj-"]`,
      `#${KOTWICA_LEKCJI} button`,
    );
    for (const selektor of selektory) {
      const element = document.querySelector<HTMLElement>(selektor);
      if (!element) continue;
      element.focus();
      if (document.activeElement === element) return;
    }
  }, [fokus]);

  // Pasek zapisu znika razem z ostatnią niezapisaną zmianą (zapis, cofnięcie,
  // porzucenie), a z nim przycisk, który miał fokus. Fokus wraca wtedy do
  // drzewa, zamiast spaść na `body`.
  const liczbaZmianTeraz = stan.rodzaj === "gotowy" ? stan.historia.length : 0;
  const poprzedniaLiczbaZmian = useRef(0);
  useEffect(() => {
    const bylo = poprzedniaLiczbaZmian.current;
    poprzedniaLiczbaZmian.current = liczbaZmianTeraz;
    if (bylo === 0 || liczbaZmianTeraz !== 0) return;
    const aktywny = document.activeElement;
    if (aktywny === null || aktywny === document.body || !document.body.contains(aktywny)) setFokus({ cel: "kolejnosc" });
  }, [liczbaZmianTeraz]);

  if (stan.rodzaj === "brak-sesji" || stan.rodzaj === "nie-znaleziono") {
    return <BezKursu rodzaj={stan.rodzaj} idKursu={String(kursPoczatkowy.id)} grupa={grupa} wroc={wroc} />;
  }
  if (stan.rodzaj === "brak-uprawnien") {
    return <BrakUprawnien idKursu={String(kursPoczatkowy.id)} grupa={grupa} wroc={wroc} />;
  }

  const { braki, gotowe } = checklistaPublikacji({ kurs, lekcje });

  /**
   * Każde wyjście z ekranu idzie tędy. Najpierw formularz lekcji (to samo
   * pytanie co na drogach wewnątrz drzewa), potem zmiany w drzewie i w danych
   * kursu — jedno pytanie, które nazywa to, co przepadnie.
   */
  function wyjdz(dokad: () => void) {
    zFormularzaLekcji(() => {
      if (liczbaZmian > 0 || daneKursuZmienione) {
        const tresc =
          liczbaZmian > 0 && daneKursuZmienione
            ? "Niezapisane zmiany w drzewie kursu i w danych kursu zostaną utracone."
            : daneKursuZmienione
              ? "Niezapisane zmiany w danych kursu zostaną utracone."
              : "Niezapisane zmiany w drzewie kursu zostaną utracone.";
        setDialog({ rodzaj: "wyjscie", dokad, tresc });
        return;
      }
      dokad();
    });
  }

  /**
   * Administracja: prawdziwa zmiana stanu kursu — ta sama funkcja
   * `zmienPublikacje` (`PATCH /admin/courses/{course}` z `is_published`), którą
   * woła ekran „Publikacja kursu”. Serwer odrzuca kurs z brakami
   * (`422 conditions_not_met`, `reason.missing`) — kurs zostaje bez zmian,
   * a braki pokazuje panel O7.
   */
  async function ustawPublikacje(opublikowany: boolean) {
    if (publikowanie) return;
    const idKursu = String(kurs.id);
    setPublikowanie(true);
    setBladPublikacji(null);
    setBrakiSerwera([]);
    try {
      const po = await zmienPublikacje(idKursu, opublikowany);
      setKurs(po);
      setToast(opublikowany ? "Kurs został opublikowany." : "Publikacja kursu została cofnięta.");
    } catch (wyjatek) {
      const blad = sklasyfikujBlad(idKursu, wyjatek);
      const tytul = opublikowany ? "Nie udało się opublikować kursu" : "Nie udało się cofnąć publikacji";
      if (wyjatek instanceof ApiError && wyjatek.status === 401) {
        setBladPublikacji({ tytul, tresc: "Sesja wygasła. Zaloguj się ponownie." });
      } else if (blad.rodzaj === "braki") {
        // Braki uzupełnia się na tym ekranie, więc odnośnik prowadzi do drzewa lekcji.
        setBrakiSerwera(blad.braki.map((brak) => ({ ...brak, href: `#${KOTWICA_LEKCJI}` })));
      } else if (blad.rodzaj === "zakazane") {
        setBladPublikacji({ tytul, tresc: zdanieOdmowyRoli(teksty.rolaOdmowy) });
      } else if (blad.rodzaj === "nie-znaleziono") {
        setBladPublikacji({ tytul, tresc: "Kurs nie istnieje albo został usunięty." });
      } else if (blad.rodzaj === "siec") {
        setBladPublikacji({ tytul, tresc: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie." });
      } else {
        setBladPublikacji({ tytul, tresc: blad.komunikat });
      }
    } finally {
      setPublikowanie(false);
    }
  }

  function opublikuj() {
    if (grupa === "admin") {
      // Serwer publikuje układ zapisany, nie ten z ekranu — z niezapisanymi
      // zmianami w drzewie żądanie nie rusza, a ekran mówi, co zrobić najpierw.
      if (liczbaZmian > 0) {
        setBrakiSerwera([]);
        setBladPublikacji({
          tytul: "Kurs nie został opublikowany",
          tresc:
            "Najpierw zapisz albo porzuć zmiany w tematach i lekcjach. Publikacja obejmuje układ zapisany na serwerze, a nie ten z ekranu.",
        });
        return;
      }
      void ustawPublikacje(true);
      return;
    }
    // Prowadzący nie publikuje kursu: `PATCH /instructor/courses/{course}`
    // zapisuje wyłącznie `title` i `description`
    // (`InstructorCourseController::EDITABLE_FIELDS`), publikacja zostaje
    // przy administracji. Przycisk otwiera więc panel braków O7 i nie woła
    // żadnej trasy zapisu — ta sama ścieżka, którą miała trasa dotąd.
    if (braki.length === 0) {
      setGotowyDoPublikacji(true);
      return;
    }
    setGotowyDoPublikacji(false);
    setChecklistaOtwarta(true);
  }

  function zmien(nastepny: (lokalny: Uklad) => Uklad, tytulLekcji: number | null = null) {
    setStan((poprzedni) => {
      if (poprzedni.rodzaj !== "gotowy") return poprzedni;
      const lokalny = nastepny(poprzedni.lokalny);
      if (lokalny === poprzedni.lokalny) return poprzedni;
      // Kolejne litery tytułu tej samej lekcji są jedną zmianą, nie n zmianami.
      const scal = tytulLekcji !== null && poprzedni.ostatniTytul === tytulLekcji;
      return {
        ...poprzedni,
        lokalny,
        historia: scal ? poprzedni.historia : [...poprzedni.historia, poprzedni.lokalny],
        ostatniTytul: tytulLekcji,
      };
    });
  }

  /**
   * Zapis lekcji z formularza przy wierszu jest już na serwerze, więc nowy
   * tytuł wchodzi do stanu serwera, do stanu lokalnego i do każdego kroku
   * historii — niezapisane zmiany kolejności i ich licznik zostają bez zmian.
   */
  function przyjmijZapisLekcji(lekcja: LekcjaPoZapisie) {
    setCzasyPoZapisie((poprzednie) => ({ ...poprzednie, [lekcja.id]: lekcja.duration_seconds }));
    setStan((poprzedni) =>
      poprzedni.rodzaj === "gotowy"
        ? {
            ...poprzedni,
            serwer: zmienTytulLekcji(poprzedni.serwer, lekcja.id, lekcja.title),
            lokalny: zmienTytulLekcji(poprzedni.lokalny, lekcja.id, lekcja.title),
            historia: poprzedni.historia.map((krok) => zmienTytulLekcji(krok, lekcja.id, lekcja.title)),
          }
        : poprzedni,
    );
  }

  function zamknijEdycjeLekcji() {
    if (edytowanaLekcja !== null) setFokus({ cel: "edytuj", lekcja: edytowanaLekcja });
    setEdytowanaLekcja(null);
    setLekcjaZmieniona(false);
  }

  /**
   * Każda droga, która zamknęłaby formularz lekcji (inna lekcja, „Dodaj
   * lekcję”, tryb kolejności, wyjście na ekran lekcji), idzie tędy: gdy
   * formularz ma niezapisane zmiany, ekran najpierw pyta.
   */
  function zFormularzaLekcji(dokad: () => void) {
    if (niezapisanaLekcja) {
      setDialog({ rodzaj: "porzuc-lekcje", dokad });
      return;
    }
    dokad();
  }

  function zamknijFormularzeLekcji() {
    setEdytowanaLekcja(null);
    setLekcjaZmieniona(false);
    setNowaLekcja(null);
    setBledyNowejLekcji({});
  }

  /** Lekcja usunięta na serwerze znika z drzewa — także z niezapisanego układu. */
  function przyjmijUsuniecieLekcji(idLekcji: number) {
    setUsuniete((poprzednie) => [...poprzednie, idLekcji]);
    setDodane((poprzednie) => poprzednie.filter((lekcja) => lekcja.id !== idLekcji));
    setStan((poprzedni) =>
      poprzedni.rodzaj === "gotowy"
        ? {
            ...poprzedni,
            serwer: usunLekcjeZUkladu(poprzedni.serwer, idLekcji),
            lokalny: usunLekcjeZUkladu(poprzedni.lokalny, idLekcji),
            historia: poprzedni.historia.map((krok) => usunLekcjeZUkladu(krok, idLekcji)),
          }
        : poprzedni,
    );
    zamknijFormularzeLekcji();
    // Wiersza już nie ma: fokus dostaje „Dodaj lekcję” tematu, w którym stała.
    const temat = stan.rodzaj === "gotowy" ? stan.lokalny.tematy.find((wpis) => wpis.lekcje.includes(idLekcji)) : null;
    setFokus(temat ? { cel: "dodaj", temat: temat.id } : { cel: "kolejnosc" });
    setToast("Lekcja została usunięta.");
  }

  async function dodajNowaLekcje() {
    if (!nowaLekcja || !zapis.nowaLekcja || zapisywanie || dodawanieLekcji.current) return;
    const pola = { title: nowaLekcja.tytul, description: nowaLekcja.opis, content: "", duration: nowaLekcja.czas };
    const lokalne = walidujLokalnie(pola);
    if (Object.keys(lokalne).length > 0) {
      setBledyNowejLekcji(lokalne);
      return;
    }
    const { title, description, duration_seconds } = cialoZapisu(pola);
    dodawanieLekcji.current = true;
    try {
      const lekcja = await zapis.nowaLekcja(kurs.id, {
        title,
        description,
        duration_seconds,
        topic_id: nowaLekcja.temat,
      });
      setDodane((poprzednie) => [
        ...poprzednie,
        {
          id: lekcja.id,
          course_id: kurs.id,
          title: lekcja.title,
          description,
          sequence_order: null,
          video_provider_id: null,
          duration_seconds: lekcja.duration_seconds,
          materials_count: 0,
          created_at: null,
          updated_at: null,
        },
      ]);
      setStan((poprzedni) =>
        poprzedni.rodzaj === "gotowy"
          ? {
              ...poprzedni,
              serwer: dopiszLekcje(poprzedni.serwer, lekcja),
              lokalny: dopiszLekcje(poprzedni.lokalny, lekcja),
              historia: poprzedni.historia.map((krok) => dopiszLekcje(krok, lekcja)),
            }
          : poprzedni,
      );
      setNowaLekcja(null);
      setBledyNowejLekcji({});
      setFokus({ cel: "edytuj", lekcja: lekcja.id });
      setToast("Lekcja została dodana.");
    } catch (blad) {
      const bledyPol = bledyZSerwera(blad);
      setBledyNowejLekcji(bledyPol ?? { ogolny: zdanieBleduTematow(blad) });
    } finally {
      dodawanieLekcji.current = false;
    }
  }

  function cofnij() {
    setStan((poprzedni) => {
      if (poprzedni.rodzaj !== "gotowy" || poprzedni.historia.length === 0) return poprzedni;
      const historia = poprzedni.historia.slice(0, -1);
      return { ...poprzedni, lokalny: poprzedni.historia[poprzedni.historia.length - 1], historia, ostatniTytul: null };
    });
  }

  function porzucWszystko() {
    setStan((poprzedni) =>
      poprzedni.rodzaj === "gotowy"
        ? { ...poprzedni, lokalny: poprzedni.serwer, historia: [], ostatniTytul: null }
        : poprzedni,
    );
    setBladTresci(null);
  }

  async function zapisz() {
    if (stan.rodzaj !== "gotowy" || zapisywanie) return;
    const { serwer, lokalny } = stan;
    setZapisywanie(true);
    setBladTresci(null);
    setUkladNieaktualny(false);
    let wysylanyUklad = false;
    try {
      let potwierdzony = serwer;
      if (kolejnoscZmieniona(serwer, lokalny)) {
        wysylanyUklad = true;
        const tematy = await zapiszUkladTematow(grupa, kurs.id, cialoUkladu(lokalny));
        wysylanyUklad = false;
        potwierdzony = { ...ukladZSerwera(tematy, lekcje), tytulyLekcji: serwer.tytulyLekcji };
      }
      for (const { id, title } of tytulyDoZapisu(serwer, lokalny)) {
        const lekcja = await zapis.tytulLekcji(id, title);
        potwierdzony = zmienTytulLekcji(potwierdzony, id, lekcja.title);
      }
      // Drzewo zostaje czynne w trakcie zapisu, więc stan po odpowiedzi liczy się
      // od stanu bieżącego, nie od tego z chwili kliknięcia: zmiana zrobiona
      // w trakcie zapisu zostaje na ekranie jako niezapisana.
      const zapisany = potwierdzony;
      setStan((poprzedni) => {
        if (poprzedni.rodzaj !== "gotowy") return poprzedni;
        if (poprzedni.lokalny === lokalny) {
          return { rodzaj: "gotowy", serwer: zapisany, lokalny: zapisany, historia: [], ostatniTytul: null };
        }
        const zmienionyPoWyslaniu =
          kolejnoscZmieniona(lokalny, poprzedni.lokalny) || tytulyDoZapisu(lokalny, poprzedni.lokalny).length > 0;
        if (!zmienionyPoWyslaniu) {
          // Ten sam układ w nowym obiekcie (np. nazwa tematu zmieniona w oknie):
          // tematy z bieżącego stanu, tytuły lekcji z odpowiedzi serwera.
          const biezacy = { tematy: poprzedni.lokalny.tematy, tytulyLekcji: zapisany.tytulyLekcji };
          return { rodzaj: "gotowy", serwer: biezacy, lokalny: biezacy, historia: [], ostatniTytul: null };
        }
        const odWyslanego = poprzedni.historia.indexOf(lokalny);
        return {
          rodzaj: "gotowy",
          serwer: zapisany,
          lokalny: poprzedni.lokalny,
          historia: odWyslanego >= 0 ? [zapisany, ...poprzedni.historia.slice(odWyslanego + 1)] : [zapisany],
          ostatniTytul: poprzedni.ostatniTytul,
        };
      });
      setOgloszenie("Zmiany w kursie zostały zapisane.");
    } catch (blad) {
      // Stan lokalny zostaje nietknięty — osoba poprawia i zapisuje ponownie.
      setOgloszenie("");
      setBladTresci(zdanieBleduTematow(blad));
      setUkladNieaktualny(wysylanyUklad && blad instanceof ApiError && (blad.status === 409 || blad.status === 422));
    } finally {
      setZapisywanie(false);
    }
  }

  /**
   * Układ z serwera od nowa. Administracja czyta cały kurs z lekcjami (ktoś
   * mógł dopisać lekcję), więc ekran montuje się od zera; bez tej drogi ekran
   * czyta od nowa same tematy. Niezapisane zmiany z ekranu przepadają — mówi
   * to zdanie przy przycisku.
   */
  function wczytajUklad() {
    setBladTresci(null);
    setUkladNieaktualny(false);
    if (onWczytajPonownie) {
      onWczytajPonownie();
      return;
    }
    setStan({ rodzaj: "ladowanie" });
    setProba((poprzednia) => poprzednia + 1);
  }

  function otworzDialog(nowy: StanDialogu, wartosc = "") {
    setPoleDialogu(wartosc);
    setBladDialogu(null);
    setBladOkna(null);
    setDialog(nowy);
  }

  /**
   * Serwer usuwa wyłącznie temat bez lekcji. Ekran zna liczbę lekcji tematu —
   * na ekranie i w ostatnio zapisanym układzie — więc dla tematu z lekcjami nie
   * otwiera okna z potwierdzeniem, które na pewno zostanie odrzucone, tylko
   * mówi przy liście tematów, co zrobić najpierw.
   */
  function poprosOUsuniecieTematu(temat: TematUkladu) {
    const naSerwerze =
      stan.rodzaj === "gotowy" ? (stan.serwer.tematy.find((wpis) => wpis.id === temat.id)?.lekcje.length ?? 0) : 0;
    if (temat.lekcje.length > 0) {
      setOdmowaUsuniecia(`Temat „${temat.tytul}” ma ${zdanieLiczbyLekcji(temat.lekcje.length)}, a potem usuń temat.`);
      return;
    }
    if (naSerwerze > 0) {
      setOdmowaUsuniecia(
        `Temat „${temat.tytul}” ma lekcje na serwerze, bo zmiany w drzewie nie są jeszcze zapisane. Zapisz zmiany, a potem usuń temat.`,
      );
      return;
    }
    setOdmowaUsuniecia(null);
    otworzDialog({ rodzaj: "usun", temat });
  }

  async function potwierdzDialog() {
    if (!dialog) return;
    if (dialog.rodzaj === "porzuc") {
      porzucWszystko();
      setDialog(null);
      return;
    }
    if (dialog.rodzaj === "wyjscie") {
      setDialog(null);
      dialog.dokad();
      return;
    }
    if (dialog.rodzaj === "porzuc-lekcje") {
      setDialog(null);
      zamknijFormularzeLekcji();
      dialog.dokad();
      return;
    }
    if (dialog.rodzaj === "cofnij-publikacje") {
      setDialog(null);
      void ustawPublikacje(false);
      return;
    }
    if (dialog.rodzaj === "usun") {
      const { temat } = dialog;
      if (wysylanieDialogu.current) return;
      wysylanieDialogu.current = true;
      setBladOkna(null);
      try {
        await usunTemat(grupa, temat.id);
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy"
            ? {
                ...poprzedni,
                serwer: usunTematZUkladu(poprzedni.serwer, temat.id),
                lokalny: usunTematZUkladu(poprzedni.lokalny, temat.id),
                historia: poprzedni.historia.map((wpis) => usunTematZUkladu(wpis, temat.id)),
              }
            : poprzedni,
        );
        setDialog(null);
        // Przycisk „Usuń” tego tematu znika razem z nim.
        setFokus({ cel: "tematy" });
      } catch (blad) {
        // Odmowa (np. 422 `conditions_not_met`: ktoś dopisał do tematu lekcję):
        // drzewo bez zmian, okno zostaje, zdanie stoi w oknie przy przycisku.
        setBladOkna(zdanieBleduTematow(blad));
      } finally {
        wysylanieDialogu.current = false;
      }
      return;
    }
    const tytul = poleDialogu.trim();
    if (tytul === "") {
      setBladDialogu("Podaj nazwę tematu.");
      return;
    }
    if (wysylanieDialogu.current) return;
    wysylanieDialogu.current = true;
    setBladDialogu(null);
    setBladOkna(null);
    try {
      if (dialog.rodzaj === "dodaj") {
        const pierwszy = stan.rodzaj === "gotowy" && stan.lokalny.tematy.length === 0;
        const temat = await dodajTemat(grupa, kurs.id, tytul);
        // Pierwszy temat zdejmuje z ekranu przycisk stanu pustego, który otworzył okno.
        if (pierwszy) setFokus({ cel: "dodaj", temat: temat.id });
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy"
            ? {
                ...poprzedni,
                serwer: dopiszTemat(poprzedni.serwer, temat),
                lokalny: dopiszTemat(poprzedni.lokalny, temat),
                historia: poprzedni.historia.map((wpis) => dopiszTemat(wpis, temat)),
              }
            : poprzedni,
        );
      } else {
        const temat = await zmienTytulTematuApi(grupa, dialog.temat.id, tytul);
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy"
            ? {
                ...poprzedni,
                serwer: zmienTytulTematu(poprzedni.serwer, temat.id, temat.title),
                lokalny: zmienTytulTematu(poprzedni.lokalny, temat.id, temat.title),
                historia: poprzedni.historia.map((wpis) => zmienTytulTematu(wpis, temat.id, temat.title)),
              }
            : poprzedni,
        );
      }
      setDialog(null);
    } catch (blad) {
      // Do pola „Nazwa tematu” trafia wyłącznie błąd nazwy (422 na `title`);
      // sieć i każda inna odmowa to komunikat okna, nie błąd wpisanej nazwy.
      const nazwy = blad instanceof ApiError && blad.code === "validation_failed" ? blad.errors?.title?.[0] : undefined;
      if (nazwy) setBladDialogu(nazwy);
      else setBladOkna(zdanieBleduTematow(blad));
    } finally {
      wysylanieDialogu.current = false;
    }
  }

  async function zapiszDaneKursu() {
    if (!formularz) return;
    const tytul = formularz.tytul.trim();
    if (tytul === "") {
      setBledyFormularza({ tytul: "Podaj tytuł kursu." });
      return;
    }
    const identyfikator = formularz.identyfikator.trim();
    if (grupa === "admin" && identyfikator === "") {
      setBledyFormularza({ identyfikator: "Podaj identyfikator kursu." });
      return;
    }
    const podstawowe = { title: tytul, description: formularz.opis.trim() === "" ? null : formularz.opis };
    try {
      // Pozycji kursu w ścieżce ten formularz nie wysyła — pokazuje ją tylko do odczytu.
      const zapisany = await zapis.daneKursu(
        kurs.id,
        grupa === "admin"
          ? { ...podstawowe, slug: identyfikator, type: formularz.typ, product_group: formularz.grupaProduktowa }
          : podstawowe,
      );
      setKurs(zapisany);
      setFormularz(null);
      setBledyFormularza({});
    } catch (blad) {
      if (blad instanceof ApiError && blad.code === "validation_failed") {
        const pol: BledyKursu = {
          tytul: blad.errors?.title?.[0],
          opis: blad.errors?.description?.[0],
          identyfikator: blad.errors?.slug?.[0],
          typ: blad.errors?.type?.[0],
          grupaProduktowa: blad.errors?.product_group?.[0],
        };
        if (Object.values(pol).some(Boolean)) {
          setBledyFormularza(pol);
          return;
        }
        // Odmowa bez błędu na którymkolwiek polu formularza (inny klucz albo
        // sama wiadomość): zdanie serwera nad formularzem, nigdy cisza.
      }
      setBledyFormularza({ ogolny: zdanieBleduTematow(blad) });
    }
  }

  const stanDrzewa: StanDanych =
    stan.rodzaj === "ladowanie"
      ? { rodzaj: "ladowanie" }
      : stan.rodzaj === "blad"
        ? {
            rodzaj: "blad",
            tresc: stan.tresc,
            onPonow: () => {
              setStan({ rodzaj: "ladowanie" });
              setProba((p) => p + 1);
            },
          }
        : { rodzaj: "gotowy" };

  const lekcjeDrzewa = lekcje.map((lekcja) =>
    lekcja.id in czasyPoZapisie ? { ...lekcja, duration_seconds: czasyPoZapisie[lekcja.id] } : lekcja,
  );
  const tematy = stan.rodzaj === "gotowy" ? tematyDrzewa(stan.serwer, stan.lokalny, lekcjeDrzewa) : [];
  const tematyUkladu = stan.rodzaj === "gotowy" ? stan.lokalny.tematy : [];

  const drzewo = (
    <div id={KOTWICA_LEKCJI} className={style.sekcja}>
      {/* Ekran z sekcjami pod drzewem (administracja): tematy są nagłówkami
          trzeciego stopnia, więc drzewo dostaje własny nagłówek drugiego. */}
      {podDrzewem && tematyUkladu.length > 0 && <Heading stopien={2}>Tematy i lekcje</Heading>}
      {bladPublikacji && (
        <Notice wariant="error" tytul={bladPublikacji.tytul}>
          {bladPublikacji.tresc}
        </Notice>
      )}
      {bladTresci && (
        <Notice
          wariant="error"
          tytul="Zmiana nie została zapisana"
          akcja={
            ukladNieaktualny ? (
              <Button poziom="outline" onClick={wczytajUklad}>
                Wczytaj aktualny układ
              </Button>
            ) : undefined
          }
        >
          {ukladNieaktualny
            ? "Układ kursu na serwerze jest inny niż na tym ekranie. Wczytaj aktualny układ — niezapisane zmiany z tego ekranu przepadną."
            : bladTresci}
        </Notice>
      )}
      {gotowyDoPublikacji && (
        <Notice wariant="ok" tytul="Kurs nie ma braków">
          Wszystkie pozycje listy są gotowe. Publikację kursu zatwierdza administracja.
        </Notice>
      )}
      <CourseTree
        tematy={tematy}
        liczbaZmian={liczbaZmian}
        stan={stanDrzewa}
        onPrzenies={(zTematu, lekcja, doTematu, indeks) => {
          zmien((lokalny) => przeniesLekcje(lokalny, Number(zTematu), Number(lekcja), Number(doTematu), indeks));
          if (stan.rodzaj !== "gotowy") return;
          const poPrzeniesieniu = przeniesLekcje(stan.lokalny, Number(zTematu), Number(lekcja), Number(doTematu), indeks);
          const cel = poPrzeniesieniu.tematy.find((temat) => temat.id === Number(doTematu));
          const miejsce = cel ? cel.lekcje.indexOf(Number(lekcja)) + 1 : 0;
          if (!cel || miejsce === 0) return;
          const tytul = stan.lokalny.tytulyLekcji[Number(lekcja)] ?? "";
          setOgloszenie(
            `Lekcja „${tytul}” przeniesiona do tematu „${cel.tytul}”, miejsce ${miejsce} z ${cel.lekcje.length}.`,
          );
        }}
        // Administracja zakłada lekcję tutaj, w wybranym temacie (`topic_id`).
        // Prowadzący — w istniejącym edytorze treści kursu; tam lekcja bez
        // `topic_id` trafia na koniec ostatniego tematu (aneks kontraktu, pkt 3).
        onDodajLekcje={(temat) => {
          if (!zapis.nowaLekcja) {
            wyjdz(() => przejdz(teksty.adresDodaniaLekcji(kurs.id)));
            return;
          }
          zFormularzaLekcji(() => {
            zamknijFormularzeLekcji();
            setNowaLekcja({ temat: Number(temat), tytul: "", opis: "", czas: "" });
          });
        }}
        onZmienTytulLekcji={(_temat, lekcja, tytul) =>
          zmien((lokalny) => zmienTytulLekcji(lokalny, Number(lekcja), tytul), Number(lekcja))
        }
        onZapisz={() => void zapisz()}
        onCofnij={cofnij}
        onPorzucWszystko={() => otworzDialog({ rodzaj: "porzuc" })}
        onEdytujLekcje={
          edycjaLekcji
            ? (_temat, lekcja) => {
                const id = Number(lekcja);
                zFormularzaLekcji(() => {
                  if (edytowanaLekcja === id) {
                    zamknijEdycjeLekcji();
                    return;
                  }
                  zamknijFormularzeLekcji();
                  setEdytowanaLekcja(id);
                });
              }
            : undefined
        }
        // Tryb kolejności przy otwartym formularzu lekcji: pytanie, gdy są
        // zmiany, a bez zmian formularz się zamyka. Fokus zostaje na przełączniku.
        onPrzedTrybemKolejnosci={
          edycjaLekcji
            ? (wlacz) =>
                zFormularzaLekcji(() => {
                  zamknijFormularzeLekcji();
                  wlacz();
                  setFokus({ cel: "kolejnosc" });
                })
            : undefined
        }
        podTematem={
          nowaLekcja
            ? {
                tematId: String(nowaLekcja.temat),
                tresc: (
                  <>
                    {bledyNowejLekcji.ogolny && (
                      <Notice wariant="error" tytul="Lekcja nie została dodana">
                        {bledyNowejLekcji.ogolny}
                      </Notice>
                    )}
                    <FormSection
                      fokusPrzyOtwarciu
                      tytul="Nowa lekcja"
                      szerokosc="lekcja"
                      pola={[
                        {
                          id: `${baza}-nowa-tytul`,
                          etykieta: "Tytuł lekcji",
                          rodzaj: "tekst",
                          wymagane: true,
                          wartosc: nowaLekcja.tytul,
                          onZmiana: (tytul) => setNowaLekcja({ ...nowaLekcja, tytul }),
                          blad: bledyNowejLekcji.title,
                        },
                        {
                          id: `${baza}-nowa-opis`,
                          etykieta: "Krótki opis lekcji",
                          rodzaj: "wieloliniowy",
                          wartosc: nowaLekcja.opis,
                          onZmiana: (opis) => setNowaLekcja({ ...nowaLekcja, opis }),
                          blad: bledyNowejLekcji.description,
                        },
                        {
                          id: `${baza}-nowa-czas`,
                          etykieta: "Czas trwania w sekundach",
                          rodzaj: "liczba",
                          wartosc: nowaLekcja.czas,
                          onZmiana: (czas) => setNowaLekcja({ ...nowaLekcja, czas }),
                          podpowiedz:
                            "Lekcja z czasem 0 nie może zostać ukończona przez uczestnika. Treść, materiały i nagranie dodasz po założeniu lekcji.",
                          blad: bledyNowejLekcji.duration,
                        },
                      ]}
                      etykietaZapisz="Dodaj lekcję"
                      onAnuluj={() => {
                        if (dialog !== null) return;
                        const temat = nowaLekcja.temat;
                        zFormularzaLekcji(() => {
                          zamknijFormularzeLekcji();
                          setFokus({ cel: "dodaj", temat });
                        });
                      }}
                      onZapisz={() => void dodajNowaLekcje()}
                    />
                  </>
                ),
              }
            : undefined
        }
        rozwiniecie={
          edycjaLekcji && edytowanaLekcja !== null
            ? {
                lekcjaId: String(edytowanaLekcja),
                tresc: edycjaLekcji(edytowanaLekcja, {
                  zamknij: zamknijEdycjeLekcji,
                  zapisano: przyjmijZapisLekcji,
                  zmieniono: setLekcjaZmieniona,
                  usunieto: () => przyjmijUsuniecieLekcji(edytowanaLekcja),
                  przejdz: (adres) => wyjdz(() => przejdz(adres)),
                  wstrzymany: dialog !== null,
                }),
              }
            : undefined
        }
        pusty={{
          naglowek: "Kurs nie ma jeszcze tematów",
          tresc: "Tematy porządkują lekcje kursu. Zacznij od pierwszego tematu, potem dodasz do niego lekcje.",
          przycisk: { etykieta: "Dodaj pierwszy temat", onClick: () => otworzDialog({ rodzaj: "dodaj" }) },
        }}
      />
    </div>
  );

  const glowna = podDrzewem ? (
    <div className={style.kolumna}>
      {drzewo}
      {podDrzewem(kurs, lekcjeDrzewa)}
    </div>
  ) : (
    drzewo
  );

  const wspierajaca = (
    <div className={style.kolumna}>
      {tematyUkladu.length > 0 && (
        <section className={style.sekcja} aria-labelledby={`${baza}-tematy`}>
          <Heading stopien={2} id={`${baza}-tematy`}>
            Tematy kursu
          </Heading>
          <ul className={style.listaTematow}>
            {tematyUkladu.map((temat) => (
              <li key={temat.id} className={style.wierszTematu}>
                <span className={style.tytulTematu}>{temat.tytul}</span>
                <Button
                  poziom="quiet"
                  aria-label={`Zmień nazwę tematu „${temat.tytul}”`}
                  onClick={() => otworzDialog({ rodzaj: "zmien", temat }, temat.tytul)}
                >
                  Zmień nazwę
                </Button>
                <Button
                  poziom="quiet"
                  niebezpieczny
                  aria-label={`Usuń temat „${temat.tytul}”`}
                  onClick={() => poprosOUsuniecieTematu(temat)}
                >
                  Usuń
                </Button>
              </li>
            ))}
          </ul>
          {odmowaUsuniecia && (
            <Notice wariant="warn" tytul="Tematu nie można jeszcze usunąć">
              {odmowaUsuniecia}
            </Notice>
          )}
          <div>
            <Button poziom="outline" data-dodaj-temat onClick={() => otworzDialog({ rodzaj: "dodaj" })}>
              Dodaj temat
            </Button>
          </div>
        </section>
      )}

      <section
        id="opis"
        className={style.sekcja}
        aria-label={formularz ? "Dane kursu" : undefined}
        aria-labelledby={formularz ? undefined : `${baza}-dane`}
      >
        {formularz ? (
          <>
            {bledyFormularza.ogolny && (
              <Notice wariant="error" tytul="Dane kursu nie zostały zapisane">
                {bledyFormularza.ogolny}
              </Notice>
            )}
            <FormSection
              fokusPrzyOtwarciu
              tytul="Dane kursu"
              pola={[
                {
                  id: `${baza}-tytul`,
                  etykieta: "Tytuł kursu",
                  rodzaj: "tekst",
                  wymagane: true,
                  wartosc: formularz.tytul,
                  onZmiana: (tytul) => setFormularz({ ...formularz, tytul }),
                  blad: bledyFormularza.tytul,
                },
                {
                  id: `${baza}-opis`,
                  etykieta: "Opis kursu",
                  rodzaj: "wieloliniowy",
                  wartosc: formularz.opis,
                  onZmiana: (opis) => setFormularz({ ...formularz, opis }),
                  blad: bledyFormularza.opis,
                },
                ...(grupa === "admin"
                  ? [
                      {
                        id: `${baza}-typ`,
                        etykieta: "Typ",
                        rodzaj: "wybor" as const,
                        opcje: OPCJE_TYPU,
                        wartosc: formularz.typ,
                        onZmiana: (typ: string) => setFormularz({ ...formularz, typ: typ as CourseType }),
                        blad: bledyFormularza.typ,
                      },
                      {
                        id: `${baza}-grupa`,
                        etykieta: "Grupa produktowa",
                        rodzaj: "wybor" as const,
                        opcje: OPCJE_GRUPY,
                        wartosc: formularz.grupaProduktowa,
                        onZmiana: (wybrana: string) =>
                          setFormularz({ ...formularz, grupaProduktowa: wybrana as ProductGroup }),
                        blad: bledyFormularza.grupaProduktowa,
                      },
                      {
                        id: `${baza}-identyfikator`,
                        etykieta: "Identyfikator",
                        rodzaj: "tekst" as const,
                        wymagane: true,
                        wartosc: formularz.identyfikator,
                        onZmiana: (identyfikator: string) => setFormularz({ ...formularz, identyfikator }),
                        podpowiedz: "Krótka nazwa w adresie kursu: litery, cyfry, myślniki i podkreślenia.",
                        blad: bledyFormularza.identyfikator,
                      },
                    ]
                  : []),
              ]}
              onAnuluj={() => {
                setFormularz(null);
                setBledyFormularza({});
              }}
              onZapisz={() => void zapiszDaneKursu()}
            />
          </>
        ) : (
          <>
            <Heading stopien={2} id={`${baza}-dane`}>
              Dane kursu
            </Heading>
            <Text>{kurs.description && kurs.description.trim() !== "" ? kurs.description : "Kurs bez opisu."}</Text>
            {grupa === "admin" && (
              <dl className={style.daneKursu}>
                <div>
                  <dt>Typ</dt>
                  <dd>{COURSE_TYPE_LABELS[kurs.type]}</dd>
                </div>
                <div>
                  <dt>Grupa produktowa</dt>
                  <dd>{PRODUCT_GROUP_LABELS[kurs.product_group]}</dd>
                </div>
                <div>
                  <dt>Identyfikator</dt>
                  <dd>{kurs.slug}</dd>
                </div>
                <div>
                  <dt>Pozycja w ścieżce</dt>
                  <dd>{kurs.sequence_order === null ? "Poza ścieżką" : kurs.sequence_order}</dd>
                </div>
              </dl>
            )}
            <div>
              <Button
                poziom="quiet"
                onClick={() =>
                  setFormularz({
                    tytul: kurs.title,
                    opis: kurs.description ?? "",
                    identyfikator: kurs.slug,
                    typ: kurs.type,
                    grupaProduktowa: kurs.product_group,
                  })
                }
              >
                Zmień dane kursu
              </Button>
            </div>
          </>
        )}
      </section>
      {ostatniBlok?.(kurs)}
    </div>
  );

  // Administracja: kurs opublikowany nie ma już czego publikować — w tym samym
  // miejscu stoi drugorzędne „Cofnij publikację”. Prowadzący zawsze widzi
  // „Opublikuj kurs”, bo jego przycisk tylko otwiera panel braków.
  const cofniecie = grupa === "admin" && kurs.is_published;

  return (
    <>
      <DetailTemplate
        naglowek={{
          okruszki: teksty.okruszki,
          tytul: kurs.title,
          status: kurs.is_published
            ? { wariant: "ok", etykieta: "Opublikowany" }
            : { wariant: "neutral", etykieta: "Szkic" },
          onPowrot: () => wyjdz(wroc),
          dzieci: (
            <div>
              {/* W toku: przycisk zostaje w kolejce fokusu (`aria-disabled`, nie
                  `disabled`), bo okno potwierdzenia oddaje mu fokus w tej samej
                  chwili, w której rusza żądanie; drugi klik zatrzymuje `publikowanie`. */}
              {cofniecie ? (
                <Button
                  id={idPrzyciskuPublikacji}
                  poziom="outline"
                  aria-busy={publikowanie}
                  aria-disabled={publikowanie}
                  onClick={() => {
                    if (!publikowanie) otworzDialog({ rodzaj: "cofnij-publikacje" });
                  }}
                >
                  {publikowanie ? "Cofanie publikacji…" : "Cofnij publikację"}
                </Button>
              ) : (
                <Button
                  id={idPrzyciskuPublikacji}
                  poziom="primary"
                  aria-busy={publikowanie}
                  aria-disabled={publikowanie}
                  onClick={opublikuj}
                >
                  {publikowanie ? "Publikowanie…" : "Opublikuj kurs"}
                </Button>
              )}
            </div>
          ),
        }}
        checklist={
          brakiSerwera.length > 0
            ? { tytul: "Braki przed publikacją", braki: brakiSerwera, gotowe: [], onZamknij: zamknijBrakiSerwera }
            : checklistaOtwarta
              ? { tytul: "Braki przed publikacją", braki, gotowe, onZamknij: zamknijChecklist }
              : undefined
        }
        glowna={glowna}
        wspierajaca={wspierajaca}
      />
      {dialog && (
        <OknoDialogu
          dialog={dialog}
          idPola={`${baza}-pole-dialogu`}
          wartosc={poleDialogu}
          blad={bladDialogu}
          bladOkna={bladOkna}
          onZmiana={setPoleDialogu}
          onWycofaj={() => {
            // „Zostań” wraca do formularza lekcji, nie na przycisk, który wywołał pytanie.
            if (dialog.rodzaj === "porzuc-lekcje") setFokus({ cel: "formularz" });
            setDialog(null);
          }}
          onPotwierdz={() => void potwierdzDialog()}
        />
      )}
      {toast && <Toast komunikat={toast} onZamknij={zamknijToast} />}
      {/* Bez roli „status”: tę rolę ma `Toast`, a obszar żywy wystarcza czytnikowi. */}
      <p aria-live="polite" aria-atomic="true" data-ogloszenia className={style.ogloszenia}>
        {ogloszenie}
      </p>
    </>
  );
}

interface WlasciwosciOkna {
  dialog: StanDialogu;
  idPola: string;
  wartosc: string;
  /** Błąd pola „Nazwa tematu”. */
  blad: string | null;
  /** Błąd, który nie dotyczy pola: komunikat w treści okna. */
  bladOkna: string | null;
  onZmiana: (wartosc: string) => void;
  onWycofaj: () => void;
  onPotwierdz: () => void;
}

/** „ma 1 lekcję. Przenieś ją do innego tematu” / „ma 3 lekcje. Przenieś je…” / „ma 5 lekcji. Przenieś je…”. */
function zdanieLiczbyLekcji(liczba: number): string {
  if (liczba === 1) return "1 lekcję. Przenieś ją do innego tematu";
  const jednosci = liczba % 10;
  const dziesiatki = liczba % 100;
  const kilka = jednosci >= 2 && jednosci <= 4 && (dziesiatki < 12 || dziesiatki > 14);
  return `${liczba} ${kilka ? "lekcje" : "lekcji"}. Przenieś je do innego tematu`;
}

function OknoDialogu({ dialog, idPola, wartosc, blad, bladOkna, onZmiana, onWycofaj, onPotwierdz }: WlasciwosciOkna) {
  if (dialog.rodzaj === "dodaj" || dialog.rodzaj === "zmien") {
    return (
      <Dialog
        tytul={dialog.rodzaj === "dodaj" ? "Nowy temat" : "Zmień nazwę tematu"}
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia={dialog.rodzaj === "dodaj" ? "Dodaj temat" : "Zapisz nazwę"}
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        {bladOkna && (
          <Notice
            wariant="error"
            tytul={dialog.rodzaj === "dodaj" ? "Temat nie został dodany" : "Nazwa tematu nie została zapisana"}
          >
            {bladOkna}
          </Notice>
        )}
        <Field
          id={idPola}
          etykieta="Nazwa tematu"
          rodzaj="tekst"
          wymagane
          wartosc={wartosc}
          onZmiana={onZmiana}
          blad={blad ?? undefined}
        />
      </Dialog>
    );
  }
  if (dialog.rodzaj === "usun") {
    return (
      <Dialog
        tytul={`Usunąć temat „${dialog.temat.tytul}”?`}
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Usuń temat"
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        {bladOkna && (
          <Notice wariant="error" tytul="Temat nie został usunięty">
            {bladOkna}
          </Notice>
        )}
        <Text>Usunąć można tylko temat bez lekcji. Lekcje zostają w kursie.</Text>
      </Dialog>
    );
  }
  if (dialog.rodzaj === "porzuc") {
    return (
      <Dialog
        tytul="Porzucić wszystkie zmiany?"
        etykietaWycofania="Wróć do edycji"
        etykietaPotwierdzenia="Porzuć wszystko"
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Text>Drzewo wróci do ostatnio zapisanego układu tematów i lekcji.</Text>
      </Dialog>
    );
  }
  if (dialog.rodzaj === "porzuc-lekcje") {
    return (
      <Dialog
        tytul="Porzucić niezapisane zmiany w lekcji?"
        etykietaWycofania="Zostań"
        etykietaPotwierdzenia="Porzuć zmiany"
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Text>To, co wpisano w formularzu lekcji, nie zostało zapisane i przepadnie.</Text>
      </Dialog>
    );
  }
  if (dialog.rodzaj === "cofnij-publikacje") {
    return (
      <Dialog
        tytul="Cofnąć publikację kursu?"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Cofnij publikację"
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Text>Kurs wróci do stanu „Szkic”.</Text>
      </Dialog>
    );
  }
  return (
    <Dialog
      tytul="Wyjść bez zapisu?"
      etykietaWycofania="Zostań"
      etykietaPotwierdzenia="Wyjdź bez zapisu"
      onWycofaj={onWycofaj}
      onPotwierdz={onPotwierdz}
    >
      <Text>{dialog.tresc}</Text>
    </Dialog>
  );
}
