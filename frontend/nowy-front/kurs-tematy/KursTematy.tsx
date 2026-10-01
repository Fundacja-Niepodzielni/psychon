"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AdminCourse, AdminLesson } from "@/lib/h08/types";
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
import { sklasyfikujBlad, zmienPublikacje } from "@/nowy-front/publikacja-kursu/dane";
import {
  cialoUkladu,
  dopiszTemat,
  kolejnoscZmieniona,
  przeniesLekcje,
  tematyDrzewa,
  tytulyDoZapisu,
  ukladZSerwera,
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

interface WlasciwosciKursTematy {
  idKursu: string;
  wynik: WynikDanychKursu;
  /**
   * Grupa tras ekranu: tą samą grupą ekran czyta kurs, zapisuje tematy, dane
   * kursu i tytuły lekcji. `instructor` — dane z tras `/instructor/…`
   * (`pobierzDaneKursu`), publikacja zostaje przy administracji. `admin` —
   * dane z tras `/admin/…` (`pobierzDaneKursuAdministracji`), a „Opublikuj
   * kurs” naprawdę zmienia stan kursu.
   */
  grupa: GrupaTras;
  /** Ponowienie odczytu kursu po błędzie; bez niej odświeżenie trasy. */
  onPonow?: () => void;
  /** Sekcje pod drzewem tematów, w kolumnie głównej — z bieżącym stanem kursu. */
  podDrzewem?: (kurs: AdminCourse) => ReactNode;
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

  if (wynik.status === "brak-sesji" || wynik.status === "brak-uprawnien") {
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

type StanTematow =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; tresc: string }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "gotowy"; serwer: Uklad; lokalny: Uklad; historia: Uklad[]; ostatniTytul: number | null };

type StanDialogu =
  | { rodzaj: "dodaj" }
  | { rodzaj: "zmien"; temat: TematUkladu }
  | { rodzaj: "usun"; temat: TematUkladu }
  | { rodzaj: "porzuc" }
  | { rodzaj: "wyjscie"; dokad: () => void };

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
export type EdycjaLekcjiWiersza = (
  idLekcji: number,
  akcje: { zamknij: () => void; zapisano: (lekcja: LekcjaPoZapisie) => void },
) => ReactNode;

interface WlasciwosciEdytora {
  grupa: GrupaTras;
  kursPoczatkowy: AdminCourse;
  lekcje: AdminLesson[];
  podDrzewem?: (kurs: AdminCourse) => ReactNode;
  ostatniBlok?: (kurs: AdminCourse) => ReactNode;
  edycjaLekcji?: EdycjaLekcjiWiersza;
  wroc: () => void;
  przejdz: (adres: string) => void;
}

function EdytorTematow({
  grupa,
  kursPoczatkowy,
  lekcje,
  podDrzewem,
  ostatniBlok,
  edycjaLekcji,
  wroc,
  przejdz,
}: WlasciwosciEdytora) {
  const baza = useId();
  const [edytowanaLekcja, setEdytowanaLekcja] = useState<number | null>(null);
  // Nowy obiekt przy każdym zamknięciu — efekt fokusu rusza także dla tej samej lekcji drugi raz.
  const [fokusNaEdytuj, setFokusNaEdytuj] = useState<{ lekcja: number } | null>(null);
  const [czasyPoZapisie, setCzasyPoZapisie] = useState<Record<number, number>>({});
  const teksty = tekstyDlaGrupy(grupa);
  const zapis = zapisDlaGrupy(grupa);
  const idPrzyciskuPublikacji = `${baza}-opublikuj`;
  const [kurs, setKurs] = useState(kursPoczatkowy);
  const [stan, setStan] = useState<StanTematow>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [bladTresci, setBladTresci] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [checklistaOtwarta, setChecklistaOtwarta] = useState(false);
  const [gotowyDoPublikacji, setGotowyDoPublikacji] = useState(false);
  const [dialog, setDialog] = useState<StanDialogu | null>(null);
  const [poleDialogu, setPoleDialogu] = useState("");
  const [bladDialogu, setBladDialogu] = useState<string | null>(null);
  const [formularz, setFormularz] = useState<{ tytul: string; opis: string } | null>(null);
  const [bledyFormularza, setBledyFormularza] = useState<{ tytul?: string; opis?: string; ogolny?: string }>({});
  const [publikowanie, setPublikowanie] = useState(false);
  const [brakiSerwera, setBrakiSerwera] = useState<PozycjaChecklisty[]>([]);
  const [bladPublikacji, setBladPublikacji] = useState<{ tytul: string; tresc: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let aktualne = true;
    pobierzTematy(grupa, kursPoczatkowy.id)
      .then((tematy) => {
        if (!aktualne) return;
        const serwer = ukladZSerwera(tematy, lekcje);
        setStan({ rodzaj: "gotowy", serwer, lokalny: serwer, historia: [], ostatniTytul: null });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        if (blad instanceof ApiError && (blad.status === 401 || blad.status === 403 || blad.status === 404)) {
          setStan({ rodzaj: "brak-uprawnien" });
          return;
        }
        setStan({ rodzaj: "blad", tresc: zdanieBleduTematow(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [grupa, kursPoczatkowy.id, lekcje, proba]);

  const liczbaZmian = stan.rodzaj === "gotowy" ? stan.historia.length : 0;

  // Wyjście z niezapisanymi zmianami pyta (M13) — także zamknięcie karty.
  useEffect(() => {
    if (liczbaZmian === 0) return;
    function naWyjscie(zdarzenie: BeforeUnloadEvent) {
      zdarzenie.preventDefault();
    }
    window.addEventListener("beforeunload", naWyjscie);
    return () => window.removeEventListener("beforeunload", naWyjscie);
  }, [liczbaZmian]);

  const zamknijChecklist = useCallback(() => {
    setChecklistaOtwarta(false);
    document.getElementById(idPrzyciskuPublikacji)?.focus();
  }, [idPrzyciskuPublikacji]);

  const zamknijBrakiSerwera = useCallback(() => {
    setBrakiSerwera([]);
    document.getElementById(idPrzyciskuPublikacji)?.focus();
  }, [idPrzyciskuPublikacji]);

  const zamknijToast = useCallback(() => setToast(null), []);

  // Zamknięcie formularza przy wierszu oddaje fokus przyciskowi „Edytuj” tej lekcji.
  useEffect(() => {
    if (fokusNaEdytuj === null) return;
    document.querySelector<HTMLElement>(`[data-edytuj-lekcje="${fokusNaEdytuj.lekcja}"]`)?.focus();
  }, [fokusNaEdytuj]);

  if (stan.rodzaj === "brak-uprawnien") {
    return <BrakUprawnien idKursu={String(kursPoczatkowy.id)} grupa={grupa} wroc={wroc} />;
  }

  const { braki, gotowe } = checklistaPublikacji({ kurs, lekcje });

  function wyjdz(dokad: () => void) {
    if (liczbaZmian > 0) {
      setDialog({ rodzaj: "wyjscie", dokad });
      return;
    }
    dokad();
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
      if (blad.rodzaj === "braki") {
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
    if (edytowanaLekcja !== null) setFokusNaEdytuj({ lekcja: edytowanaLekcja });
    setEdytowanaLekcja(null);
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
    try {
      let potwierdzony = serwer;
      if (kolejnoscZmieniona(serwer, lokalny)) {
        const tematy = await zapiszUkladTematow(grupa, kurs.id, cialoUkladu(lokalny));
        potwierdzony = { ...ukladZSerwera(tematy, lekcje), tytulyLekcji: serwer.tytulyLekcji };
      }
      for (const { id, title } of tytulyDoZapisu(serwer, lokalny)) {
        const lekcja = await zapis.tytulLekcji(id, title);
        potwierdzony = zmienTytulLekcji(potwierdzony, id, lekcja.title);
      }
      setStan({ rodzaj: "gotowy", serwer: potwierdzony, lokalny: potwierdzony, historia: [], ostatniTytul: null });
    } catch (blad) {
      // Stan lokalny zostaje nietknięty — osoba poprawia i zapisuje ponownie.
      setBladTresci(zdanieBleduTematow(blad));
    } finally {
      setZapisywanie(false);
    }
  }

  function otworzDialog(nowy: StanDialogu, wartosc = "") {
    setPoleDialogu(wartosc);
    setBladDialogu(null);
    setDialog(nowy);
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
    if (dialog.rodzaj === "usun") {
      const { temat } = dialog;
      setDialog(null);
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
        setBladTresci(null);
      } catch (blad) {
        // 422 `conditions_not_met`: temat ma lekcje — drzewo bez zmian, jedno zdanie.
        setBladTresci(zdanieBleduTematow(blad));
      }
      return;
    }
    const tytul = poleDialogu.trim();
    if (tytul === "") {
      setBladDialogu("Podaj nazwę tematu.");
      return;
    }
    try {
      if (dialog.rodzaj === "dodaj") {
        const temat = await dodajTemat(grupa, kurs.id, tytul);
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
      setBladDialogu(zdanieBleduTematow(blad));
    }
  }

  async function zapiszDaneKursu() {
    if (!formularz) return;
    const tytul = formularz.tytul.trim();
    if (tytul === "") {
      setBledyFormularza({ tytul: "Podaj tytuł kursu." });
      return;
    }
    try {
      const zapisany = await zapis.daneKursu(kurs.id, {
        title: tytul,
        description: formularz.opis.trim() === "" ? null : formularz.opis,
      });
      setKurs(zapisany);
      setFormularz(null);
      setBledyFormularza({});
    } catch (blad) {
      if (blad instanceof ApiError && blad.code === "validation_failed") {
        setBledyFormularza({ tytul: blad.errors?.title?.[0], opis: blad.errors?.description?.[0] });
        return;
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
      {bladPublikacji && (
        <Notice wariant="error" tytul={bladPublikacji.tytul}>
          {bladPublikacji.tresc}
        </Notice>
      )}
      {bladTresci && (
        <Notice wariant="error" tytul="Zmiana nie została zapisana">
          {bladTresci}
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
        onPrzenies={(zTematu, lekcja, doTematu, indeks) =>
          zmien((lokalny) => przeniesLekcje(lokalny, Number(zTematu), Number(lekcja), Number(doTematu), indeks))
        }
        // Lekcję zakłada istniejący edytor treści kursu (prowadzącego albo
        // administracji); bez `topic_id` trafia na koniec ostatniego tematu
        // (aneks kontraktu, pkt 3).
        onDodajLekcje={() => wyjdz(() => przejdz(teksty.adresDodaniaLekcji(kurs.id)))}
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
                if (edytowanaLekcja === id) zamknijEdycjeLekcji();
                else setEdytowanaLekcja(id);
              }
            : undefined
        }
        rozwiniecie={
          edycjaLekcji && edytowanaLekcja !== null
            ? {
                lekcjaId: String(edytowanaLekcja),
                tresc: edycjaLekcji(edytowanaLekcja, { zamknij: zamknijEdycjeLekcji, zapisano: przyjmijZapisLekcji }),
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
      {podDrzewem(kurs)}
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
                  onClick={() => otworzDialog({ rodzaj: "usun", temat })}
                >
                  Usuń
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button poziom="outline" onClick={() => otworzDialog({ rodzaj: "dodaj" })}>
              Dodaj temat
            </Button>
          </div>
        </section>
      )}

      <section id="opis" className={style.sekcja} aria-labelledby={`${baza}-dane`}>
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
            <div>
              <Button
                poziom="quiet"
                onClick={() => setFormularz({ tytul: kurs.title, opis: kurs.description ?? "" })}
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
              {cofniecie ? (
                <Button id={idPrzyciskuPublikacji} poziom="outline" onClick={() => void ustawPublikacje(false)}>
                  Cofnij publikację
                </Button>
              ) : (
                <Button id={idPrzyciskuPublikacji} poziom="primary" onClick={opublikuj}>
                  Opublikuj kurs
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
          onZmiana={setPoleDialogu}
          onWycofaj={() => setDialog(null)}
          onPotwierdz={() => void potwierdzDialog()}
        />
      )}
      {toast && <Toast komunikat={toast} onZamknij={zamknijToast} />}
    </>
  );
}

interface WlasciwosciOkna {
  dialog: StanDialogu;
  idPola: string;
  wartosc: string;
  blad: string | null;
  onZmiana: (wartosc: string) => void;
  onWycofaj: () => void;
  onPotwierdz: () => void;
}

function OknoDialogu({ dialog, idPola, wartosc, blad, onZmiana, onWycofaj, onPotwierdz }: WlasciwosciOkna) {
  if (dialog.rodzaj === "dodaj" || dialog.rodzaj === "zmien") {
    return (
      <Dialog
        tytul={dialog.rodzaj === "dodaj" ? "Nowy temat" : "Zmień nazwę tematu"}
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia={dialog.rodzaj === "dodaj" ? "Dodaj temat" : "Zapisz nazwę"}
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
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
        niebezpieczne
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
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
        niebezpieczne
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        <Text>Drzewo wróci do ostatnio zapisanego układu tematów i lekcji.</Text>
      </Dialog>
    );
  }
  return (
    <Dialog
      tytul="Wyjść bez zapisu?"
      etykietaWycofania="Zostań"
      etykietaPotwierdzenia="Wyjdź bez zapisu"
      niebezpieczne
      onWycofaj={onWycofaj}
      onPotwierdz={onPotwierdz}
    >
      <Text>Niezapisane zmiany w drzewie kursu zostaną utracone.</Text>
    </Dialog>
  );
}
