"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/klient";
import {
  dodajTemat,
  usunTemat,
  zapiszUkladTematow,
  zdanieBleduTematow,
  zmienTytulTematu as zmienTytulTematuNaSerwerze,
  type Topic,
} from "@/lib/api/h08-tematy";
import type { AdminCourse } from "@/lib/h08/types";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { Text } from "@/design-system/atomy/Text/Text";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import {
  zdanieRuchuGrupy,
  zdanieRuchuMiedzyGrupami,
  zdanieRuchuWiersza,
} from "@/design-system/molekuly/StrzalkiKolejnosci/zdania";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { useNawigacjaZPytaniem } from "@/design-system/szablony/NiezapisaneZmiany";
import { UkladEdycji } from "@/design-system/szablony/UkladEdycji/UkladEdycji";
import {
  cialoUkladu,
  dopiszLekcje,
  dopiszTemat,
  przeniesTemat,
  przesunLekcje,
  ukladZSerwera,
  usunTematZUkladu,
  zmienTytulTematu,
  type TematUkladu,
  type Uklad,
} from "@/nowy-front/kurs-tematy/uklad";
import {
  dodajLekcje,
  pobierzStanNagrania,
  type LekcjaAdmin,
  type StanNagrania,
} from "@/nowy-front/lekcja-edycja/dane";
import { procentWyslania } from "@/nowy-front/lekcja-edycja/nagranie";
import { pobierzKurs, sklasyfikujBlad, zmienPublikacje } from "@/nowy-front/publikacja-kursu/dane";
import { useWysylanie } from "@/nowy-front/wysylanie-nagrania/useWysylanie";
import { minutyZSekund } from "@/nowy-front/wspolne/minuty";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import {
  KOTWICA_DANYCH_KURSU,
  KOTWICA_DRZEWA,
  DOPISKI_NOWEGO_NAGRANIA,
  brakiZSerwera,
  kodStanuZOdpowiedzi,
  maStanZSerwera,
  nagranieWDrodze,
  noweNagranie,
  powodyOdmowy,
  stanPublikacji,
  stanWiersza,
  type PozycjaPublikacji,
  type StanyNagran,
  type WysylanieNaEkranie,
} from "./braki";
import { imieNazwisko, pobierzPrzypisania, pobierzTestKursu, zdanieBledu, type PrzypisanieKursu } from "./dane";
import { DrzewoKursu, type TematDrzewa, type TestDrzewa } from "./DrzewoKursu";
import {
  ID_ODMOWY_PUBLIKACJI,
  KOTWICA_PUBLIKACJI,
  KartaKoncowa,
  KartaPublikacji,
  OknoKursu,
  PasPublikacji,
  StarszePlikiKursu,
  UstawieniaKursu,
  type RodzajOknaKursu,
  type WierszUstawien,
} from "./KolumnaBoczna";
import { utworzKolejkeZapisu, type KolejkaZapisu } from "./kolejka-zapisu";
import { odczytajOstrzezeniePoUtworzeniu, zapomnijOstrzezeniePoUtworzeniu } from "./ostrzezenie-po-utworzeniu";
import { useOdswiezanieNagran } from "./odswiezanie-nagran";
import style from "./EkranKursu.module.css";
import { KOMUNIKAT_INTERNET } from "@/nowy-front/wspolne/komunikaty";

const ADRES_LISTY_KURSOW = "/admin/kursy";

/**
 * Adres strony lekcji (treść, nagranie, pliki) w panelu, z kursem w ścieżce.
 * `null`, dopóki grupa strony lekcji jest wyłączona — wiersz nie ma wtedy „Otwórz”.
 */
export function adresStronyLekcji(idLekcji: number, idKursu: string): string | null {
  if (!czyNowaTrasaDostepna(GRUPY.edycjaLekcji)) return null;
  const [ekran] = GRUPY.edycjaLekcji.ekrany;
  return ekran.nowaTrasa.replace("[id]", idKursu).replace("[idLekcji]", String(idLekcji));
}

function dopisekNowegoNagrania(lekcja: LekcjaAdmin): string | null {
  const nowe = noweNagranie(lekcja);
  return nowe === null ? null : DOPISKI_NOWEGO_NAGRANIA[nowe];
}

type OknoTematu =
  | { rodzaj: "dodaj" }
  | { rodzaj: "zmien"; temat: TematUkladu }
  | { rodzaj: "usun"; temat: TematUkladu };

interface Uklady {
  /** Ostatni układ potwierdzony przez serwer. */
  serwer: Uklad;
  /** Układ z ekranu — po ruchu od razu, przed odpowiedzią serwera. */
  lokalny: Uklad;
}

interface WlasciwosciEkranuKursu {
  idKursu: string;
  kursPoczatkowy: AdminCourse;
  lekcjePoczatkowe: LekcjaAdmin[];
  tematyPoczatkowe: Topic[];
  onKoniec: (rodzaj: "usuniety" | "nie-znaleziono") => void;
}

/**
 * Ekran kursu administracji w dwóch kolumnach: po lewej karta „Tematy i
 * lekcje”, po prawej „Publikacja”, „Ustawienia kursu” i działania rzadkie.
 * Kolejność lekcji i tematów zapisuje się sama po każdym ruchu — jednym
 * żądaniem z całym układem, przez kolejkę, która nie wysyła dwóch naraz.
 */
export function EkranKursu({
  idKursu,
  kursPoczatkowy,
  lekcjePoczatkowe,
  tematyPoczatkowe,
  onKoniec,
}: WlasciwosciEkranuKursu) {
  const router = useRouter();
  const nawigacja = useNawigacjaZPytaniem();
  const idLiczbowy = kursPoczatkowy.id;
  const [kurs, setKurs] = useState(kursPoczatkowy);
  const [lekcje, setLekcje] = useState(lekcjePoczatkowe);
  const [uklady, setUklady] = useState<Uklady>(() => {
    const uklad = ukladZSerwera(tematyPoczatkowe, lekcjePoczatkowe);
    return { serwer: uklad, lokalny: uklad };
  });
  // Kopia do odczytu poza rysowaniem: kolejka i czynności po odpowiedzi serwera
  // liczą od stanu bieżącego, nie od tego z chwili kliknięcia.
  const biezaceUklady = useRef(uklady);
  const [nagrania, setNagrania] = useState<StanyNagran>({});
  const [przypisania, setPrzypisania] = useState<PrzypisanieKursu[] | null>(null);
  const [test, setTest] = useState<TestDrzewa | null>(null);
  const [otwartyWiersz, setOtwartyWiersz] = useState<WierszUstawien | null>(null);
  const [odmowaPublikacji, setOdmowaPublikacji] = useState<PozycjaPublikacji[] | null>(null);
  const [bladKolejnosci, setBladKolejnosci] = useState<string | null>(null);
  const [bladWyjscia, setBladWyjscia] = useState<string | null>(null);
  // Zdanie z listy kursów (kurs utworzony, prowadzącego nie przypisano): czytane raz, zdejmowane po zamontowaniu.
  const [ostrzezeniePoUtworzeniu] = useState(() => odczytajOstrzezeniePoUtworzeniu(kursPoczatkowy.id));
  // Zdanie z listy kursów jest od początku w ogłoszeniach, więc czytnik słyszy je razem z komunikatem na ekranie.
  const [ogloszenie, setOgloszenie] = useState({ tresc: ostrzezeniePoUtworzeniu ?? "", numer: 0 });
  const [oknoTematu, setOknoTematu] = useState<OknoTematu | null>(null);
  const [nazwaTematu, setNazwaTematu] = useState("");
  const [bladPola, setBladPola] = useState<string | null>(null);
  const [bladOkna, setBladOkna] = useState<string | null>(null);
  const [oknoKursu, setOknoKursu] = useState<RodzajOknaKursu | null>(null);
  const publikowanie = useRef(false);
  const wychodzenie = useRef(false);
  const wysylanieOkna = useRef(false);
  // Dokąd ma trafić fokus, gdy element, który otworzył okno, już nie istnieje.
  const fokusPoOknie = useRef<string | null>(null);
  const zamontowany = useRef(true);
  const stanWysylania = useWysylanie();

  useEffect(() => {
    zamontowany.current = true;
    return () => {
      zamontowany.current = false;
    };
  }, []);

  // Zdanie z listy kursów jest czytane raz: pamięć karty zdejmuje je po zamontowaniu ekranu.
  useEffect(() => {
    zapomnijOstrzezeniePoUtworzeniu(kursPoczatkowy.id);
  }, [kursPoczatkowy.id]);

  // Odmowa publikacji: fokus staje na komunikacie z powodami, gdy ten jest już na ekranie.
  useEffect(() => {
    if (odmowaPublikacji !== null) document.getElementById(ID_ODMOWY_PUBLIKACJI)?.focus();
  }, [odmowaPublikacji]);

  /** Braki kursu liczy serwer: po zmianie, która je rusza, ekran czyta kurs od nowa. */
  function odswiezKurs() {
    pobierzKurs(idKursu)
      .then((pobrany) => {
        if (zamontowany.current) setKurs(pobrany);
      })
      // Bez odpowiedzi karta zostaje przy ostatnich brakach z serwera.
      .catch(() => {});
  }

  /** Odpowiedź o stanie nagrania w drodze: pola lekcji, a po zakończeniu — braki kursu. */
  function przyjmijStanNagrania(idLekcji: number, stan: StanNagrania) {
    const kod = kodStanuZOdpowiedzi(stan);
    setLekcje((poprzednie) =>
      poprzednie.map((lekcja) =>
        lekcja.id === idLekcji
          ? {
              ...lekcja,
              video_status: kod,
              video_status_at: stan.video_status_at ?? lekcja.video_status_at,
              video_ready: stan.video_ready ?? lekcja.video_ready,
              video_pending: stan.video_pending ?? lekcja.video_pending,
            }
          : lekcja,
      ),
    );
    if (!nagranieWDrodze({ video_status: kod })) odswiezKurs();
  }

  // Pytania o stan wyłącznie dla nagrań wysyłanych albo przetwarzanych.
  useOdswiezanieNagran(
    lekcje.filter(nagranieWDrodze).map((lekcja) => lekcja.id),
    przyjmijStanNagrania,
  );

  function ustawUklady(nastepne: Uklady) {
    biezaceUklady.current = nastepne;
    setUklady(nastepne);
  }

  function oglos(tresc: string) {
    setOgloszenie((poprzednie) => ({ tresc, numer: poprzednie.numer + 1 }));
  }

  // Kolejka powstaje przy pierwszym ruchu — w obsłudze zdarzenia, nie przy rysowaniu.
  const kolejkaZapisu = useRef<KolejkaZapisu<Uklad> | null>(null);
  function wezKolejke(): KolejkaZapisu<Uklad> {
    kolejkaZapisu.current ??= utworzKolejkeZapisu<Uklad>((uklad) => zapiszUkladTematow("admin", idLiczbowy, cialoUkladu(uklad)), {
      zapisano(uklad) {
        const { lokalny } = biezaceUklady.current;
        // Kolejność z wysłanego układu, nazwy z ekranu (zmiana nazwy ma własny zapis).
        const serwer: Uklad = {
          tematy: uklad.tematy.map((temat) => ({
            ...temat,
            tytul: lokalny.tematy.find((kandydat) => kandydat.id === temat.id)?.tytul ?? temat.tytul,
          })),
          tytulyLekcji: lokalny.tytulyLekcji,
        };
        ustawUklady({ serwer, lokalny });
      },
      odmowa(blad) {
        const { serwer } = biezaceUklady.current;
        ustawUklady({ serwer, lokalny: serwer });
        const zdanie = `${zdanieBleduTematow(blad)} Wiersze wróciły na poprzednie miejsca.`;
        setBladKolejnosci(zdanie);
        oglos(`Kolejność nie została zapisana. ${zdanie}`);
      },
    });
    return kolejkaZapisu.current;
  }

  useEffect(() => {
    let aktualne = true;
    // Dane dodatkowe: gdy serwer ich nie poda, ekran pomija element, zamiast zgadywać.
    pobierzPrzypisania(idLiczbowy)
      .then((pobrane) => {
        if (aktualne) setPrzypisania(pobrane);
      })
      .catch(() => {});
    pobierzTestKursu(idLiczbowy)
      .then((pobrany) => {
        if (!aktualne) return;
        setTest(
          typeof pobrany?.id === "number"
            ? { rodzaj: "jest", adres: `/admin/testy/${pobrany.id}/pytania` }
            : { rodzaj: "brak" },
        );
      })
      .catch(() => {});
    for (const lekcja of lekcjePoczatkowe) {
      // Lekcja ze stanem nagrania z serwera nie wymaga pytania; pyta tylko odpowiedź starszego serwera.
      if (!lekcja.video_provider_id || maStanZSerwera(lekcja)) continue;
      pobierzStanNagrania(lekcja.id)
        .then((stan) => {
          if (aktualne) setNagrania((poprzednie) => ({ ...poprzednie, [lekcja.id]: stan.status }));
        })
        .catch(() => {});
    }
    return () => {
      aktualne = false;
    };
  }, [idLiczbowy, lekcjePoczatkowe]);

  useEffect(() => {
    if (oknoTematu !== null || fokusPoOknie.current === null) return;
    const cel = fokusPoOknie.current;
    fokusPoOknie.current = null;
    const wezel =
      document.querySelector<HTMLElement>(cel) ?? document.querySelector<HTMLElement>("[data-dodaj-temat]");
    wezel?.focus();
  }, [oknoTematu]);

  const lekcjePoId = useMemo(() => new Map(lekcje.map((lekcja) => [lekcja.id, lekcja])), [lekcje]);
  const lekcjeWKolejnosci = useMemo(
    () =>
      uklady.lokalny.tematy
        .flatMap((temat) => temat.lekcje)
        .map((id) => lekcjePoId.get(id))
        .filter((lekcja): lekcja is LekcjaAdmin => lekcja !== undefined),
    [uklady.lokalny, lekcjePoId],
  );
  const adresLekcji = (idLekcji: number) => adresStronyLekcji(idLekcji, idKursu);
  let wysylanie: WysylanieNaEkranie | null = null;
  if (stanWysylania.rodzaj === "wysylanie") {
    wysylanie = {
      idLekcji: stanWysylania.lekcja.id,
      rodzaj: "wysylanie",
      procent: procentWyslania(stanWysylania.wyslano, stanWysylania.rozmiar),
    };
  } else if (stanWysylania.rodzaj === "przerwane") {
    wysylanie = { idLekcji: stanWysylania.lekcja.id, rodzaj: "przerwane" };
  }
  const miejscaLekcji = { lekcje: lekcjeWKolejnosci, adresLekcji, wysylanie };
  const publikacja = stanPublikacji({ kurs, nagrania, ...miejscaLekcji });
  const brakiKursu = brakiZSerwera(kurs);

  function prowadzacyLekcji(idLekcji: number): string | null {
    if (przypisania === null) return null;
    const przypisanie =
      przypisania.find((wpis) => wpis.lesson_id === idLekcji) ?? przypisania.find((wpis) => wpis.lesson_id === null);
    return przypisanie ? imieNazwisko(przypisanie.instructor) : null;
  }

  const numery = new Map(lekcjeWKolejnosci.map((lekcja, indeks) => [lekcja.id, indeks + 1]));
  const tematyDrzewa: TematDrzewa[] = uklady.lokalny.tematy.map((temat) => {
    const wiersze = temat.lekcje.flatMap((id) => {
      const lekcja = lekcjePoId.get(id);
      if (!lekcja) return [];
      const meta: string[] = [];
      const minuty = minutyZSekund(lekcja.duration_seconds);
      if (minuty > 0) meta.push(`${minuty} min`);
      const prowadzacy = prowadzacyLekcji(id);
      if (prowadzacy) meta.push(prowadzacy);
      const pliki = lekcja.materials_count;
      meta.push(pliki > 0 ? `${pliki} ${odmien(pliki, "plik", "pliki", "plików")}` : "bez plików");
      return [
        {
          id,
          tytul: uklady.lokalny.tytulyLekcji[id] ?? lekcja.title,
          numer: numery.get(id) ?? 0,
          meta,
          stan: stanWiersza(lekcja, nagrania[id], brakiKursu),
          dopisek: dopisekNowegoNagrania(lekcja),
          adres: adresLekcji(id),
        },
      ];
    });
    const sekundy = temat.lekcje.reduce((suma, id) => suma + (lekcjePoId.get(id)?.duration_seconds ?? 0), 0);
    return { id: temat.id, tytul: temat.tytul, minuty: minutyZSekund(sekundy), lekcje: wiersze };
  });

  /** Ruch w kolejności: ekran zmienia się od razu, zapis idzie przez kolejkę. */
  function zmienKolejnosc(nastepny: Uklad, zdanie: () => string) {
    if (nastepny === biezaceUklady.current.lokalny) return;
    setBladKolejnosci(null);
    setBladWyjscia(null);
    ustawUklady({ ...biezaceUklady.current, lokalny: nastepny });
    wezKolejke().zlec(nastepny);
    oglos(zdanie());
  }

  /** Zmiana już potwierdzona przez serwer (nowy temat, nazwa, lekcja): oba układy naraz. */
  function wObuUkladach(zmiana: (uklad: Uklad) => Uklad) {
    const { serwer, lokalny } = biezaceUklady.current;
    const nastepne = { serwer: zmiana(serwer), lokalny: zmiana(lokalny) };
    ustawUklady(nastepne);
    // Zapis kolejności w toku niósłby układ sprzed tej zmiany — wysyłamy bieżący.
    const kolejka = wezKolejke();
    if (kolejka.zajeta()) kolejka.zlec(nastepne.lokalny);
  }

  function przesunLekcjeNaEkranie(idLekcji: number, kierunek: -1 | 1) {
    const przed = biezaceUklady.current.lokalny;
    const nastepny = przesunLekcje(przed, idLekcji, kierunek);
    zmienKolejnosc(nastepny, () => {
      const tytul = nastepny.tytulyLekcji[idLekcji] ?? "";
      const temat = nastepny.tematy.find((kandydat) => kandydat.lekcje.includes(idLekcji));
      if (!temat) return "";
      const miejsce = temat.lekcje.indexOf(idLekcji) + 1;
      const dawnyTemat = przed.tematy.find((kandydat) => kandydat.lekcje.includes(idLekcji));
      return dawnyTemat?.id === temat.id
        ? zdanieRuchuWiersza(tytul, miejsce, temat.lekcje.length)
        : zdanieRuchuMiedzyGrupami(tytul, temat.tytul, miejsce, temat.lekcje.length);
    });
  }

  function przesunTematNaEkranie(idTematu: number, kierunek: -1 | 1) {
    const nastepny = przeniesTemat(biezaceUklady.current.lokalny, idTematu, kierunek);
    zmienKolejnosc(nastepny, () => {
      const miejsce = nastepny.tematy.findIndex((temat) => temat.id === idTematu) + 1;
      return zdanieRuchuGrupy(nastepny.tematy[miejsce - 1]?.tytul ?? "", miejsce, nastepny.tematy.length);
    });
  }

  async function dodajLekcjeWTemacie(idTematu: number, tytul: string): Promise<string | null> {
    try {
      const nowa = await dodajLekcje(idLiczbowy, {
        title: tytul,
        description: null,
        duration_seconds: 0,
        topic_id: idTematu,
      });
      setLekcje((poprzednie) => [...poprzednie, nowa]);
      setKurs((poprzedni) => ({ ...poprzedni, lessons_count: poprzedni.lessons_count + 1 }));
      setOdmowaPublikacji(null);
      wObuUkladach((uklad) => dopiszLekcje(uklad, nowa));
      // Nowa lekcja zmienia braki kursu; serwer, który je podaje, liczy je od nowa.
      if (brakiZSerwera(kurs) !== null) odswiezKurs();
      const miejsce = biezaceUklady.current.lokalny.tematy.flatMap((temat) => temat.lekcje).indexOf(nowa.id) + 1;
      oglos(`Dodano lekcję ${miejsce}: ${nowa.title}`);
      return null;
    } catch (blad) {
      if (blad instanceof ApiError && blad.status === 404) {
        onKoniec("nie-znaleziono");
        return "Kurs nie istnieje albo został usunięty.";
      }
      const pola = blad instanceof ApiError ? blad.errors?.title?.[0] : undefined;
      return pola ?? zdanieBledu(blad, "Nie udało się dodać lekcji. Spróbuj ponownie.");
    }
  }

  function otworzOknoTematu(okno: OknoTematu, nazwa = "", zapasFokusu: string | null = null) {
    setNazwaTematu(nazwa);
    setBladPola(null);
    setBladOkna(null);
    fokusPoOknie.current = zapasFokusu;
    setOknoTematu(okno);
  }

  function tematUkladu(idTematu: number): TematUkladu | undefined {
    return biezaceUklady.current.lokalny.tematy.find((temat) => temat.id === idTematu);
  }

  async function potwierdzOknoTematu() {
    const okno = oknoTematu;
    if (okno === null || wysylanieOkna.current) return;
    if (okno.rodzaj === "usun" && okno.temat.lekcje.length > 0) {
      setOknoTematu(null);
      return;
    }
    const nazwa = nazwaTematu.trim();
    if (okno.rodzaj !== "usun" && nazwa === "") {
      setBladPola("Podaj nazwę tematu.");
      return;
    }
    wysylanieOkna.current = true;
    setBladPola(null);
    setBladOkna(null);
    try {
      if (okno.rodzaj === "dodaj") {
        const nowy = await dodajTemat("admin", idLiczbowy, nazwa);
        wObuUkladach((uklad) => dopiszTemat(uklad, nowy));
        oglos(`Dodano temat „${nowy.title}”.`);
      } else if (okno.rodzaj === "zmien") {
        const zapisany = await zmienTytulTematuNaSerwerze("admin", okno.temat.id, nazwa);
        wObuUkladach((uklad) => zmienTytulTematu(uklad, zapisany.id, zapisany.title));
        oglos(`Zmieniono nazwę tematu na „${zapisany.title}”.`);
      } else {
        await usunTemat("admin", okno.temat.id);
        wObuUkladach((uklad) => usunTematZUkladu(uklad, okno.temat.id));
        oglos(`Usunięto temat „${okno.temat.tytul}”.`);
      }
      setOknoTematu(null);
    } catch (blad) {
      const pola = blad instanceof ApiError ? blad.errors?.title?.[0] : undefined;
      if (pola && okno.rodzaj !== "usun") setBladPola(pola);
      else setBladOkna(zdanieBleduTematow(blad));
    } finally {
      wysylanieOkna.current = false;
    }
  }

  function fokusNaKartePublikacji() {
    // Po odmowie fokus staje na komunikacie z powodami; bez odmowy — na nagłówku
    // karty, który istnieje w obu stanach kursu.
    window.setTimeout(() => {
      const cel =
        document.getElementById(ID_ODMOWY_PUBLIKACJI) ?? document.getElementById(`${KOTWICA_PUBLIKACJI}-tytul`);
      cel?.focus();
    }, 0);
  }

  async function opublikuj() {
    if (publikowanie.current) return;
    publikowanie.current = true;
    try {
      const po = await zmienPublikacje(idKursu, true);
      setKurs(po);
      setOdmowaPublikacji(null);
      oglos("Kurs został opublikowany.");
    } catch (wyjatek) {
      const klasa = sklasyfikujBlad(idKursu, wyjatek);
      if (klasa.rodzaj === "nie-znaleziono") {
        onKoniec("nie-znaleziono");
        return;
      }
      // Powody z serwera (`reason.items`): te same zdania i odnośniki co lista braków.
      const zSerwera =
        wyjatek instanceof ApiError && wyjatek.status === 422 && wyjatek.code === "conditions_not_met"
          ? powodyOdmowy(wyjatek, miejscaLekcji)
          : null;
      let powody: PozycjaPublikacji[];
      if (wyjatek instanceof ApiError && wyjatek.status === 401) {
        powody = [{ id: "sesja", tekst: "Sesja wygasła. Zaloguj się ponownie." }];
      } else if (zSerwera !== null) {
        powody = zSerwera;
      } else if (klasa.rodzaj === "braki") {
        powody = klasa.braki.map((brak) => ({ id: brak.id, tekst: `${brak.tekst}.`, href: `#${KOTWICA_DRZEWA}` }));
      } else if (klasa.rodzaj === "zakazane") {
        powody = [{ id: "rola", tekst: zdanieOdmowyRoli("administracji") }];
      } else if (klasa.rodzaj === "siec") {
        powody = [{ id: "siec", tekst: KOMUNIKAT_INTERNET }];
      } else {
        powody = [{ id: "serwer", tekst: klasa.komunikat }];
      }
      setOdmowaPublikacji(powody);
      oglos(`Kurs nie został opublikowany. ${powody.map((powod) => powod.tekst).join(" ")}`);
    } finally {
      publikowanie.current = false;
      fokusNaKartePublikacji();
    }
  }

  function otworzMiejsceNaprawy(pozycja: PozycjaPublikacji, zdarzenie: MouseEvent<HTMLAnchorElement>) {
    if (pozycja.href === `#${KOTWICA_DANYCH_KURSU}`) {
      zdarzenie.preventDefault();
      setOtwartyWiersz("dane");
      document.getElementById(KOTWICA_DANYCH_KURSU)?.focus();
    } else if (pozycja.href === `#${KOTWICA_DRZEWA}`) {
      zdarzenie.preventDefault();
      document.getElementById(`${KOTWICA_DRZEWA}-tytul`)?.focus();
    }
  }

  /**
   * „Zapisz szkic i wyjdź”: układ kursu zapisuje się sam, więc przycisk czeka tylko na zapis w toku
   * i dopiero potem prowadzi na listę kursów. Odmowa serwera zostawia na ekranie, ze zdaniem.
   */
  async function zapiszSzkicIWyjdz() {
    if (wychodzenie.current) return;
    wychodzenie.current = true;
    setBladWyjscia(null);
    try {
      const zapisano = (await kolejkaZapisu.current?.poczekaj()) ?? true;
      if (!zamontowany.current) return;
      if (!zapisano) {
        const zdanie = "Zostajesz na ekranie kursu: ostatnia zmiana kolejności nie została zapisana. Sprawdź kolejność lekcji i spróbuj ponownie.";
        setBladWyjscia(zdanie);
        oglos(zdanie);
        return;
      }
      nawigacja.przejdz(ADRES_LISTY_KURSOW);
    } finally {
      wychodzenie.current = false;
    }
  }

  const przyciskGlowny = { kurs, onOpublikuj: () => void opublikuj(), onZapiszIWyjdz: () => void zapiszSzkicIWyjdz() };

  return (
    <>
      <UkladEdycji
        naglowek={{
          okruszki: [{ etykieta: "Kursy", href: ADRES_LISTY_KURSOW }, { etykieta: kurs.title }],
          tytul: kurs.title,
          status: kurs.is_published
            ? { wariant: "ok", etykieta: "Opublikowany" }
            : { wariant: "neutral", etykieta: "Szkic — zapisany" },
          opis: kurs.is_published ? undefined : "Zmiany zapisują się same.",
          statusObokTytulu: true,
          onPowrot: () => router.back(),
        }}
        pasekWaski={<PasPublikacji {...przyciskGlowny} stan={publikacja} />}
        komunikaty={
          (ostrzezeniePoUtworzeniu !== null || bladWyjscia !== null) && (
            <div className={style.komunikatyEkranu}>
              {ostrzezeniePoUtworzeniu !== null && (
                <Notice wariant="warn" tytul="Prowadzący nie został przypisany">
                  {ostrzezeniePoUtworzeniu}
                </Notice>
              )}
              {bladWyjscia !== null && (
                <Notice wariant="error" tytul="Szkic nie został zapisany">
                  {bladWyjscia}
                </Notice>
              )}
            </div>
          )
        }
        glowna={
          <>
            <DrzewoKursu
              tematy={tematyDrzewa}
              test={test}
              komunikat={
                bladKolejnosci && (
                  <Notice wariant="error" tytul="Kolejność nie została zapisana">
                    {bladKolejnosci}
                  </Notice>
                )
              }
              onPrzesunLekcje={przesunLekcjeNaEkranie}
              onPrzesunTemat={przesunTematNaEkranie}
              onZmienNazwe={(idTematu) => {
                const temat = tematUkladu(idTematu);
                if (temat) otworzOknoTematu({ rodzaj: "zmien", temat }, temat.tytul);
              }}
              onUsunTemat={(idTematu) => {
                const temat = tematUkladu(idTematu);
                if (temat) otworzOknoTematu({ rodzaj: "usun", temat }, "", `[data-fokus="wiecej-${idTematu}"]`);
              }}
              onDodajTemat={() => otworzOknoTematu({ rodzaj: "dodaj" })}
              onDodajLekcje={dodajLekcjeWTemacie}
            />
            <div className={style.tylkoCzytnik} role="status" aria-live="polite" data-ogloszenia>
              <p key={ogloszenie.numer}>{ogloszenie.tresc}</p>
            </div>
          </>
        }
        boczna={
          <>
            <KartaPublikacji
              {...przyciskGlowny}
              stan={publikacja}
              odmowa={odmowaPublikacji}
              onPozycja={otworzMiejsceNaprawy}
            />
            <UstawieniaKursu
              kurs={kurs}
              lekcje={lekcjeWKolejnosci}
              przypisania={przypisania}
              otwarty={otwartyWiersz}
              onOtwarty={setOtwartyWiersz}
              onKurs={(zapisany) => {
                setKurs(zapisany);
                setOdmowaPublikacji(null);
              }}
              onPrzypisania={setPrzypisania}
              onOgloszenie={oglos}
            />
            <StarszePlikiKursu kurs={kurs} />
            <KartaKoncowa kurs={kurs} onOkno={setOknoKursu} />
          </>
        }
      />

      {oknoTematu !== null && (
        <OknoTematuKursu
          okno={oknoTematu}
          nazwa={nazwaTematu}
          bladPola={bladPola}
          bladOkna={bladOkna}
          onNazwa={setNazwaTematu}
          onWycofaj={() => setOknoTematu(null)}
          onPotwierdz={() => void potwierdzOknoTematu()}
        />
      )}
      {oknoKursu !== null && (
        <OknoKursu
          kurs={kurs}
          rodzaj={oknoKursu}
          onZamknij={() => setOknoKursu(null)}
          onKurs={(po) => {
            setKurs(po);
            setOdmowaPublikacji(null);
            fokusNaKartePublikacji();
          }}
          onUsunieto={() => onKoniec("usuniety")}
          onNieZnaleziono={() => onKoniec("nie-znaleziono")}
          onOgloszenie={oglos}
        />
      )}
    </>
  );
}

function OknoTematuKursu({
  okno,
  nazwa,
  bladPola,
  bladOkna,
  onNazwa,
  onWycofaj,
  onPotwierdz,
}: {
  okno: OknoTematu;
  nazwa: string;
  bladPola: string | null;
  bladOkna: string | null;
  onNazwa: (nazwa: string) => void;
  onWycofaj: () => void;
  onPotwierdz: () => void;
}) {
  if (okno.rodzaj === "usun") {
    const liczba = okno.temat.lekcje.length;
    if (liczba > 0) {
      return (
        <Dialog
          tytul={`Tematu „${okno.temat.tytul}” nie można jeszcze usunąć`}
          etykietaWycofania="Zamknij"
          etykietaPotwierdzenia="Rozumiem"
          onWycofaj={onWycofaj}
          onPotwierdz={onPotwierdz}
        >
          <Text>
            {`Temat ma ${liczba} ${odmien(liczba, "lekcję", "lekcje", "lekcji")}. Lekcje nie znikają razem z tematem: przenieś je strzałkami do innego tematu, a potem usuń pusty temat.`}
          </Text>
        </Dialog>
      );
    }
    return (
      <Dialog
        tytul={`Usunąć temat „${okno.temat.tytul}”?`}
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
        <Text>Temat nie ma lekcji. Zniknie z kursu, żadna lekcja nie zostanie usunięta.</Text>
      </Dialog>
    );
  }
  return (
    <Dialog
      tytul={okno.rodzaj === "dodaj" ? "Nowy temat" : "Zmień nazwę tematu"}
      etykietaWycofania="Anuluj"
      etykietaPotwierdzenia={okno.rodzaj === "dodaj" ? "Dodaj temat" : "Zapisz nazwę"}
      onWycofaj={onWycofaj}
      onPotwierdz={onPotwierdz}
    >
      {bladOkna && (
        <Notice wariant="error" tytul={okno.rodzaj === "dodaj" ? "Temat nie został dodany" : "Nazwa tematu nie została zapisana"}>
          {bladOkna}
        </Notice>
      )}
      <Field
        id="okno-tematu-nazwa"
        etykieta="Nazwa tematu"
        rodzaj="tekst"
        wymagane
        wartosc={nazwa}
        onZmiana={onNazwa}
        blad={bladPola ?? undefined}
      />
    </Dialog>
  );
}
