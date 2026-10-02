"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { EdytorTresci } from "@/design-system/molekuly/EdytorTresci/EdytorTresci";
import { Field } from "@/design-system/molekuly/Field/Field";
import { FileDropZone } from "@/design-system/molekuly/FileDropZone/FileDropZone";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { KartaBoczna } from "@/design-system/szablony/UkladEdycji/KartaBoczna";
import { TylkoOdDwochKolumn, UkladEdycji } from "@/design-system/szablony/UkladEdycji/UkladEdycji";
import {
  pobierzStanNagrania,
  usunLekcje,
  usunMaterial,
  wgrajMaterial,
  zapiszLekcje,
  type LekcjaAdmin,
  type MaterialAdmin,
  type StanNagrania,
} from "./dane";
import {
  bledyZSerwera,
  cialoZapisu,
  formularzZLekcji,
  powodNieaktywnegoNagrania,
  walidujLokalnie,
  zdanieBleduPliku,
  zdanieBleduUsuniecia,
  ZDANIE_O_WCZESNIEJSZYCH_MATERIALACH,
  zdanieBleduUsunieciaMaterialu,
  zdanieLiczbyMaterialow,
  zdanieBleduZapisu,
  type BledyFormularza,
  type PolaFormularza,
  type StanFormularza,
} from "./formularz";
import { KartaNagrania } from "./KartaNagrania";
import { useWgrywanieMaterialow } from "./materialy";
import {
  czasDoPytaniaOStan,
  miejsceWKursie,
  nagranieZSerwera,
  opisPliku,
  poWyslaniuCalegoPliku,
  stanLekcji,
  type NagranieZSerwera,
  type StanKartyNagrania,
} from "./nagranie";
import { godzinaZapisu, opisStanuZapisu, zmienionePola, type OpisStanuZapisu } from "./stan-zapisu";
import { uchwytWysylania, type TrybWysylania } from "@/nowy-front/wysylanie-nagrania/uchwyt";
import { useWysylanieLekcji } from "@/nowy-front/wysylanie-nagrania/useWysylanie";
import style from "./StronaLekcji.module.css";

export interface WlasciwosciStronyLekcji {
  lekcja: LekcjaAdmin;
  /** Wszystkie lekcje kursu — z nich wynika „lekcja n z m” i sąsiednie lekcje. */
  lekcjeKursu: LekcjaAdmin[];
  rola: string | null;
  nagranieStart: StanNagrania | null;
  okruszki: { etykieta: string; href?: string }[];
  /** Adres ekranu kursu; `null`, gdy strona nie zna kursu. */
  adresKursu: string | null;
  /** Adres strony innej lekcji tego kursu. */
  adresLekcji: (idLekcji: number) => string;
}

/** Wyjście ze strony wstrzymane pytaniem o niezapisany tekst. */
interface Wyjscie {
  adres: string;
  /** Element, który wywołał wyjście — po „Zostań” fokus wraca na niego. */
  wyzwalacz: HTMLElement | null;
}

const SELEKTOR_STRONY = '[data-style-id="szablon-edycja"]';
/**
 * Kolejność pól na ekranie — fokus idzie na pierwsze z błędem. Treść edytuje się
 * w obszarze edytora, który nosi identyfikator edytora z dopiskiem `-obszar`.
 */
const KOLEJNOSC_POL: ReadonlyArray<[PolaFormularza, string]> = [
  ["title", "tytul"],
  ["description", "opis"],
  ["duration", "czas"],
  ["content", "tresc-obszar"],
];

function StanZapisu({ opis, zapisywanie }: { opis: OpisStanuZapisu; zapisywanie: boolean }) {
  return (
    <p role="status" aria-live="polite" className={style.stanZapisu}>
      {zapisywanie ? (
        <strong>Zapisywanie…</strong>
      ) : (
        <>
          <span>
            <strong>{opis.glowne}</strong>
          </span>
          {opis.dodatek !== null && (
            <>
              <span className={style.kropka}> · </span>
              <span>{opis.dodatek}</span>
            </>
          )}
        </>
      )}
    </p>
  );
}

function Sasiednia({
  slowo,
  lekcja,
  adres,
  skraj,
}: {
  slowo: "Poprzednia" | "Następna";
  lekcja: LekcjaAdmin | null;
  adres: string | null;
  skraj: string;
}) {
  const tresc = (
    <>
      {slowo}
      <span className={style.slowoLekcja}> lekcja</span>
    </>
  );
  if (lekcja === null || adres === null) {
    return (
      <span className={style.nieczynna}>
        <Link role="link" aria-disabled="true" aria-label={`${slowo} lekcja: brak, ${skraj}`}>
          {tresc}
        </Link>
      </span>
    );
  }
  return (
    <Link href={adres} aria-label={`${slowo} lekcja: ${lekcja.title}`}>
      {tresc}
    </Link>
  );
}

/**
 * Strona lekcji administracji w układzie dwóch kolumn. Lewa kolumna idzie w
 * kolejności, w jakiej lekcję widzi uczestnik: tytuł, opis i czas → nagranie →
 * treść → pliki. Prawa: „Zapis” (jedyny zielony przycisk strony), „Stan lekcji”
 * i zwinięte „Usunięcie lekcji”. Poniżej 1100 px stan zapisu i przycisk stoją w
 * wąskim pasie pod tytułem, a karty „Zapis” nie ma na ekranie.
 *
 * Tekst (tytuł, opis, czas, treść) zapisuje przycisk; nagranie i pliki zapisują
 * się same. Każde wyjście odnośnikiem ze strony przy niezapisanym tekście pyta
 * jednym oknem: zapisać i przejść, przejść bez zapisu albo zostać.
 */
export function StronaLekcji({
  lekcja,
  lekcjeKursu,
  rola,
  nagranieStart,
  okruszki,
  adresKursu,
  adresLekcji,
}: WlasciwosciStronyLekcji) {
  const router = useRouter();
  const baza = useId();
  const [zapisana, setZapisana] = useState(lekcja);
  const [formularz, setFormularz] = useState<StanFormularza>(() => formularzZLekcji(lekcja));
  const [bledy, setBledy] = useState<BledyFormularza>({});
  const [bladOgolny, setBladOgolny] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [ostatniZapis, setOstatniZapis] = useState<string | null>(null);
  const [wyjscie, setWyjscie] = useState<Wyjscie | null>(null);
  const [dialogUsuniecia, setDialogUsuniecia] = useState(false);
  const [usuwanie, setUsuwanie] = useState(false);
  const [bladUsuniecia, setBladUsuniecia] = useState<string | null>(null);

  const [liczbaMaterialow, setLiczbaMaterialow] = useState(lekcja.materials_count);
  const [ogloszenieMaterialu, setOgloszenieMaterialu] = useState("");
  const [materialDoUsuniecia, setMaterialDoUsuniecia] = useState<MaterialAdmin | null>(null);
  const [bladMaterialu, setBladMaterialu] = useState<string | null>(null);
  const materialy = useWgrywanieMaterialow(
    (plik) => wgrajMaterial(zapisana.id, plik),
    (material) => {
      setLiczbaMaterialow((poprzednia) => poprzednia + 1);
      setOgloszenieMaterialu(`Wgrano plik „${material.name}”.`);
    },
  );
  // Plik wgrany do końca stoi w jednym wierszu — na liście z „Usuń”. Wiersz stanu zostaje
  // tylko dla pliku, który się jeszcze wgrywa albo którego wgranie się nie udało.
  const plikiWToku = materialy.pliki.filter((plik) => plik.stan !== "gotowy");
  // Licznik z zaplecza obejmuje też pliki dodane teraz; reszta to pliki wgrane wcześniej,
  // których listy ekran jeszcze nie ma.
  const wczesniejszeMaterialy = liczbaMaterialow - materialy.wgrane.length;

  // Stan nagrania z serwera; trwające albo przerwane wysyłanie tej lekcji (z uchwytu ponad ekranami) go zasłania.
  // Trasa stanu nie odpowiedziała przy otwarciu: stan z pól zasobu lekcji, o ile je niesie.
  const [serwer, setSerwer] = useState<NagranieZSerwera>(() => nagranieZSerwera(nagranieStart, lekcja));
  const [bladWyboruNagrania, setBladWyboruNagrania] = useState<string | null>(null);
  const wysylanie = useWysylanieLekcji(lekcja.id);
  // Uczestnicy mają nagranie i serwer trzyma je do gotowości nowego: wysyłanie stąd to wymiana.
  const dotychczasoweGra = serwer.serwerZnaStan && serwer.karta.rodzaj === "gotowe";
  /** Chwila ostatniego pytania o stan nagrania; `null` do pierwszego efektu po otwarciu. */
  const ostatniePytanieOStan = useRef<number | null>(null);
  const nagranie: StanKartyNagrania =
    wysylanie === null
      ? serwer.karta
      : wysylanie.rodzaj === "wysylanie"
        ? {
            rodzaj: "wysylanie",
            nazwa: wysylanie.nazwa,
            rozmiar: wysylanie.rozmiar,
            wyslano: wysylanie.wyslano,
            zostaloSekund: wysylanie.zostaloSekund,
          }
        : wysylanie.rodzaj === "przerwane"
          ? {
              rodzaj: "przerwane",
              nazwa: wysylanie.nazwa,
              rozmiar: wysylanie.rozmiar,
              wyslano: wysylanie.wyslano,
              innyPlik: wysylanie.innyPlik,
            }
          : poWyslaniuCalegoPliku(serwer).karta;
  // Lekcja miała nagranie, zanim osoba zaczęła wysyłać nowe — karta mówi wtedy, co widzą uczestnicy.
  const zastapionoNagranie = wysylanie?.zastepuje === true;
  const wyslanoCalyPlik = wysylanie?.rodzaj === "wyslane";
  const poleDoFokusu = useRef<string | null>(null);

  const zapisanyFormularz = formularzZLekcji(zapisana);
  const zmienione = zmienionePola(formularz, zapisanyFormularz);
  const zmieniony = zmienione.length > 0;
  const opisZapisu = opisStanuZapisu(zmienione, ostatniZapis);
  const wysylanieTrwa = nagranie.rodzaj === "wysylanie";
  const miejsce = miejsceWKursie(lekcjeKursu, zapisana.id);
  const stan = stanLekcji(
    { ...zapisanyFormularz, duration_seconds: zapisana.duration_seconds },
    liczbaMaterialow,
    nagranie,
    dotychczasoweGra,
  );

  /** Odpowiedź trasy stanu: stan karty, a po gotowości nagrania także czas trwania lekcji. */
  function przyjmijStanNagrania(stanNagrania: StanNagrania) {
    const nowy = nagranieZSerwera(stanNagrania);
    setSerwer(nowy);
    const gotowe = nowy.karta.rodzaj === "gotowe" && nowy.karta.nowe === undefined;
    if (!nowy.serwerZnaStan || !gotowe || stanNagrania.status === "no_video") return;
    const czas = stanNagrania.duration_seconds;
    if (typeof czas !== "number" || czas <= 0 || czas === zapisana.duration_seconds) return;
    // Serwer zapisał czas trwania gotowego nagrania w lekcji: pole czasu idzie za nim tylko
    // wtedy, gdy osoba go nie zmieniła — wpisanej wartości nic nie nadpisuje.
    const poprzedniCzas = formularzZLekcji(zapisana).duration;
    const nastepna = { ...zapisana, duration_seconds: czas };
    setZapisana(nastepna);
    setFormularz((pola) =>
      pola.duration === poprzedniCzas ? { ...pola, duration: formularzZLekcji(nastepna).duration } : pola,
    );
  }

  // Efekty wołają zawsze bieżącą wersję: czyta ona ostatnio zapisaną lekcję.
  const przyjmijStanRef = useRef(przyjmijStanNagrania);
  useEffect(() => {
    przyjmijStanRef.current = przyjmijStanNagrania;
  });

  // Plik jest u dostawcy w całości: stan nagrania mówi odtąd serwer, uchwyt nie ma nic więcej do pokazania.
  useEffect(() => {
    if (!wyslanoCalyPlik) return;
    let aktualne = true;
    ostatniePytanieOStan.current = Date.now();
    pobierzStanNagrania(lekcja.id)
      .catch(() => null)
      .then((stanNagrania) => {
        if (!aktualne) return;
        // Bez odpowiedzi trasy stanu wiadomo tyle, że nagranie czeka na przetworzenie.
        if (stanNagrania === null || stanNagrania.status === "no_video") setSerwer(poWyslaniuCalegoPliku);
        else przyjmijStanRef.current(stanNagrania);
        uchwytWysylania.zamknijWyslane(lekcja.id);
      });
    return () => {
      aktualne = false;
    };
  }, [wyslanoCalyPlik, lekcja.id]);

  // Nagranie w drodze (wysyłane skądinąd albo przetwarzane): pytanie o stan idzie ponownie, nie
  // częściej niż co 30 s i tylko gdy karta przeglądarki jest widoczna. Stan końcowy (gotowe,
  // błąd, brak) kończy pytania. Wysyłanie z tej karty przeglądarki pokazuje uchwyt — bez pytań.
  const odswiezajStan = serwer.wDrodze && wysylanie === null;
  useEffect(() => {
    if (!odswiezajStan) return;
    let aktualne = true;
    let zegar: ReturnType<typeof setTimeout> | undefined;
    // Pierwszy odczyt stanu poszedł tuż przed otwarciem tego ekranu.
    if (ostatniePytanieOStan.current === null) ostatniePytanieOStan.current = Date.now();

    function zaplanuj() {
      if (zegar !== undefined) clearTimeout(zegar);
      zegar = undefined;
      if (!aktualne || document.hidden) return;
      zegar = setTimeout(zapytaj, czasDoPytaniaOStan(ostatniePytanieOStan.current ?? Date.now(), Date.now()));
    }

    function zapytaj() {
      zegar = undefined;
      if (!aktualne || document.hidden) return;
      ostatniePytanieOStan.current = Date.now();
      pobierzStanNagrania(lekcja.id)
        .catch(() => null)
        .then((stanNagrania) => {
          if (!aktualne) return;
          // Nieudany odczyt niczego nie zmienia: stan zostaje, następne pytanie za 30 s.
          if (stanNagrania !== null) przyjmijStanRef.current(stanNagrania);
          zaplanuj();
        });
    }

    zaplanuj();
    document.addEventListener("visibilitychange", zaplanuj);
    return () => {
      aktualne = false;
      if (zegar !== undefined) clearTimeout(zegar);
      document.removeEventListener("visibilitychange", zaplanuj);
    };
  }, [odswiezajStan, lekcja.id]);

  // Zamknięcie karty przeglądarki pyta, gdy jest niezapisany tekst albo trwa wysyłanie nagrania.
  useEffect(() => {
    if (!zmieniony && !wysylanieTrwa) return;
    function naWyjscie(zdarzenie: BeforeUnloadEvent) {
      zdarzenie.preventDefault();
    }
    window.addEventListener("beforeunload", naWyjscie);
    return () => window.removeEventListener("beforeunload", naWyjscie);
  }, [zmieniony, wysylanieTrwa]);

  // Każdy odnośnik strony (wróć, sąsiednia lekcja, okruszek) wychodzi tą samą drogą:
  // przy niezapisanym tekście pyta, bez zmian przechodzi od razu.
  useEffect(() => {
    function naKlik(zdarzenie: MouseEvent) {
      if (zdarzenie.defaultPrevented || zdarzenie.button !== 0) return;
      if (zdarzenie.metaKey || zdarzenie.ctrlKey || zdarzenie.shiftKey || zdarzenie.altKey) return;
      const cel = zdarzenie.target instanceof Element ? zdarzenie.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!cel || !cel.closest(SELEKTOR_STRONY)) return;
      const adres = cel.getAttribute("href");
      // Tylko adresy tej aplikacji w tej samej karcie przeglądarki; resztę obsługuje przeglądarka.
      if (!adres || !adres.startsWith("/") || (cel.target !== "" && cel.target !== "_self")) return;
      zdarzenie.preventDefault();
      if (zmieniony) setWyjscie({ adres, wyzwalacz: cel });
      else router.push(adres);
    }
    document.addEventListener("click", naKlik);
    return () => document.removeEventListener("click", naKlik);
  }, [zmieniony, router]);

  function zmien(pole: PolaFormularza, wartosc: string) {
    setFormularz((poprzedni) => ({ ...poprzedni, [pole]: wartosc }));
  }

  // Fokus na pierwsze pole z błędem idzie po narysowaniu błędów i dopiero wtedy, gdy okno
  // pytania o wyjście jest zamknięte — okno przy zamknięciu oddaje fokus elementowi, który
  // je otworzył, a pole z błędem ma mieć ostatnie słowo.
  useEffect(() => {
    if (wyjscie !== null || poleDoFokusu.current === null) return;
    document.getElementById(poleDoFokusu.current)?.focus();
    poleDoFokusu.current = null;
  }, [wyjscie, bledy]);

  function pokazBledyPol(bledyPol: BledyFormularza) {
    const pierwsze = KOLEJNOSC_POL.find(([pole]) => bledyPol[pole]);
    poleDoFokusu.current = pierwsze ? `${baza}-${pierwsze[1]}` : null;
    setBledy(bledyPol);
  }

  /** Zapis tekstu lekcji. `true` = na serwerze jest to, co w polach (także gdy nie było czego zapisywać). */
  async function zapisz(): Promise<boolean> {
    if (zapisywanie) return false;
    setBladOgolny(null);
    // Bez zmian nie ma czego wysyłać: przycisk zostaje czynny, żądanie nie idzie.
    if (!zmieniony) {
      setBledy({});
      return true;
    }
    const lokalne = walidujLokalnie(formularz);
    if (Object.keys(lokalne).length > 0) {
      pokazBledyPol(lokalne);
      return false;
    }
    setBledy({});
    setZapisywanie(true);
    try {
      const wynik = await zapiszLekcje(zapisana.id, cialoZapisu(formularz, zapisana));
      setZapisana(wynik);
      setFormularz(formularzZLekcji(wynik));
      setLiczbaMaterialow(wynik.materials_count);
      setOstatniZapis(godzinaZapisu(new Date()));
      return true;
    } catch (blad) {
      const bledyPol = bledyZSerwera(blad);
      if (bledyPol) pokazBledyPol(bledyPol);
      else {
        setBladOgolny(zdanieBleduZapisu(blad));
        document.querySelector(`${SELEKTOR_STRONY} [data-obszar="komunikaty"]`)?.scrollIntoView?.({ block: "center" });
      }
      return false;
    } finally {
      setZapisywanie(false);
    }
  }

  /** Wyjście wywołane przyciskiem (nie odnośnikiem) — ta sama droga co odnośniki. */
  function wyjdz(adres: string) {
    const aktywny = document.activeElement;
    if (zmieniony) setWyjscie({ adres, wyzwalacz: aktywny instanceof HTMLElement ? aktywny : null });
    else router.push(adres);
  }

  function zostan() {
    const wyzwalacz = wyjscie?.wyzwalacz ?? null;
    setWyjscie(null);
    wyzwalacz?.focus();
  }

  async function zapiszIPrzejdz() {
    if (wyjscie === null) return;
    const { adres } = wyjscie;
    const zapisano = await zapisz();
    setWyjscie(null);
    if (zapisano) router.push(adres);
  }

  async function usun() {
    if (usuwanie) return;
    setDialogUsuniecia(false);
    setUsuwanie(true);
    setBladUsuniecia(null);
    try {
      await usunLekcje(zapisana.id);
      // Nagranie usuniętej lekcji nie ma dokąd trafić: wysyłanie kończy się razem z lekcją.
      uchwytWysylania.porzuc(zapisana.id);
      if (adresKursu !== null) router.push(adresKursu);
      else router.back();
    } catch (blad) {
      setBladUsuniecia(zdanieBleduUsuniecia(blad));
      setUsuwanie(false);
    }
  }

  async function usunWgranyMaterial(material: MaterialAdmin) {
    setMaterialDoUsuniecia(null);
    setBladMaterialu(null);
    try {
      await usunMaterial(material.id);
      // Przycisk „Usuń” tego pliku znika razem z wierszem — fokus idzie na pole dodawania.
      document.getElementById(`${baza}-plik-materialu-obszar`)?.focus();
      materialy.zdejmij(material);
      setLiczbaMaterialow((poprzednia) => Math.max(0, poprzednia - 1));
    } catch (blad) {
      setBladMaterialu(zdanieBleduUsunieciaMaterialu(blad));
    }
  }

  async function wyslijNagranie(lista: FileList, tryb: TrybWysylania) {
    const plik = lista[0];
    if (!plik || wysylanieTrwa) return;
    if (plik.type !== "" && !plik.type.startsWith("video/")) {
      setBladWyboruNagrania("Wybierz plik wideo.");
      return;
    }
    setBladWyboruNagrania(null);
    // Wysyłanie prowadzi uchwyt ponad ekranami: trwa dalej po przejściu do kursu albo innej lekcji.
    const wynik = await uchwytWysylania.wyslij(
      plik,
      { id: zapisana.id, tytul: zapisana.title, adres: adresLekcji(zapisana.id) },
      tryb,
      // Zaplecze przypina nowe nagranie do lekcji już przy zleceniu — poprzednie przestaje być widoczne.
      serwer.karta.rodzaj === "gotowe" ? { zastepuje: true } : {},
    );
    if (wynik.rodzaj === "odmowa") setBladWyboruNagrania(zdanieBleduPliku(wynik.blad));
    if (wynik.rodzaj === "zajete") {
      setBladWyboruNagrania(
        `Trwa wysyłanie nagrania lekcji „${wynik.lekcja.tytul}”. Poczekaj, aż się skończy, albo je przerwij.`,
      );
    }
  }

  const naglowek = {
    okruszki,
    tytul: zapisana.title,
    opis: miejsce === null ? undefined : `lekcja ${miejsce.numer} z ${miejsce.razem}`,
    onPowrot: () => (adresKursu === null ? router.back() : wyjdz(adresKursu)),
    etykietaPowrotu: "Wstecz",
    dzieci: (
      <nav className={style.nawigacja} aria-label="Nawigacja lekcji">
        {adresKursu !== null && <Link href={adresKursu}>← Wróć do kursu</Link>}
        {miejsce !== null && (
          <span className={style.sasiednie}>
            <Sasiednia
              slowo="Poprzednia"
              lekcja={miejsce.poprzednia}
              adres={miejsce.poprzednia ? adresLekcji(miejsce.poprzednia.id) : null}
              skraj="to pierwsza lekcja kursu"
            />
            <Sasiednia
              slowo="Następna"
              lekcja={miejsce.nastepna}
              adres={miejsce.nastepna ? adresLekcji(miejsce.nastepna.id) : null}
              skraj="to ostatnia lekcja kursu"
            />
          </span>
        )}
      </nav>
    ),
  };

  const przyciskZapisu = (
    <Button poziom="primary" type="button" onClick={() => void zapisz()}>
      Zapisz lekcję
    </Button>
  );

  return (
    <>
      <UkladEdycji
        naglowek={naglowek}
        pasekWaski={
          <>
            <StanZapisu opis={opisZapisu} zapisywanie={zapisywanie} />
            {przyciskZapisu}
          </>
        }
        komunikaty={
          bladOgolny || bladUsuniecia ? (
            <div className={style.kolumna}>
              {bladOgolny && (
                <Notice wariant="error" tytul="Lekcja nie została zapisana">
                  {bladOgolny}
                </Notice>
              )}
              {bladUsuniecia && (
                <Notice wariant="error" tytul="Lekcja nie została usunięta">
                  {bladUsuniecia}
                </Notice>
              )}
            </div>
          ) : undefined
        }
        glowna={
          <div className={style.kolumna}>
            <KartaBoczna tytul="Tytuł, opis i czas">
              <div className={style.trescKarty}>
                <Field
                  id={`${baza}-tytul`}
                  etykieta="Tytuł lekcji"
                  rodzaj="tekst"
                  wymagane
                  wartosc={formularz.title}
                  onZmiana={(wartosc) => zmien("title", wartosc)}
                  blad={bledy.title}
                />
                <Field
                  id={`${baza}-opis`}
                  etykieta="Krótki opis"
                  rodzaj="wieloliniowy"
                  wartosc={formularz.description}
                  onZmiana={(wartosc) => zmien("description", wartosc)}
                  blad={bledy.description}
                />
                <Field
                  id={`${baza}-czas`}
                  etykieta="Czas trwania w minutach"
                  rodzaj="liczba"
                  wartosc={formularz.duration}
                  onZmiana={(wartosc) => zmien("duration", wartosc)}
                  podpowiedz="Lekcja z czasem 0 nie może zostać ukończona przez uczestnika."
                  blad={bledy.duration}
                />
              </div>
            </KartaBoczna>

            <KartaNagrania
              id={`${baza}-nagranie`}
              stan={nagranie}
              powodBrakuWysylania={powodNieaktywnegoNagrania(rola)}
              niezapisanyTekst={zmieniony}
              wymiana={
                wysylanie === null
                  ? "brak"
                  : dotychczasoweGra
                    ? "zachowuje-poprzednie"
                    : zastapionoNagranie && !serwer.serwerZnaStan
                      ? "podmienia-od-razu"
                      : "brak"
              }
              serwerZnaStan={serwer.serwerZnaStan}
              bladWyboru={bladWyboruNagrania}
              onWybierzPlik={(lista) => void wyslijNagranie(lista, nagranie.rodzaj === "przerwane" ? "dokoncz" : "nowe")}
              onPrzerwij={() => uchwytWysylania.przerwij()}
              onOdNowa={(lista) => void wyslijNagranie(lista, "od-nowa")}
            />

            <KartaBoczna tytul="Treść lekcji" kotwica={`${baza}-karta-tresci`}>
              <div className={style.trescKarty}>
                {/* Edytor oddaje ten sam tekst ze znacznikami, który idzie do zapisu; samo otwarcie niczego nie zgłasza. */}
                <EdytorTresci
                  id={`${baza}-tresc`}
                  wartosc={formularz.content}
                  onZmiana={(tekst) => zmien("content", tekst)}
                  blad={bledy.content}
                />
              </div>
            </KartaBoczna>

            <KartaBoczna tytul="Pliki do tej lekcji" opis="Zapisuje się samo">
              <div className={style.trescKarty}>
                <p className={style.mocne}>
                  Uczestnik zobaczy te pliki w tej lekcji, pod treścią, oraz na stronie kursu.
                </p>
                <Text>{zdanieLiczbyMaterialow(liczbaMaterialow)}</Text>
                {wczesniejszeMaterialy > 0 && <Hint>{ZDANIE_O_WCZESNIEJSZYCH_MATERIALACH}</Hint>}
                {materialy.wgrane.length > 0 && (
                  <ul className={style.pliki} aria-label="Pliki dodane teraz">
                    {materialy.wgrane.map((material) => (
                      <li key={material.id} className={style.plik}>
                        <span className={style.nazwaPliku}>
                          <strong className={style.nazwaDwieLinie} title={material.name}>
                            {material.name}
                          </strong>
                          {opisPliku(material.name, material.size) !== "" && (
                            <span className={style.drobne}>{opisPliku(material.name, material.size)}</span>
                          )}
                        </span>
                        <Button
                          poziom="quiet"
                          type="button"
                          aria-label={`Usuń plik ${material.name}`}
                          onClick={() => setMaterialDoUsuniecia(material)}
                        >
                          Usuń
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {bladMaterialu && (
                  <Notice wariant="error" tytul="Plik nie został usunięty">
                    {bladMaterialu}
                  </Notice>
                )}
                <FileDropZone
                  id={`${baza}-plik-materialu`}
                  etykieta="Dodaj plik"
                  podpowiedz="Dozwolone formaty: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG. Plik może mieć najwyżej 10 MB."
                  pliki={plikiWToku}
                  onWybierzPliki={(lista) => void materialy.dodaj(lista)}
                />
                <p role="status" className={style.tylkoCzytnika}>
                  {ogloszenieMaterialu}
                </p>
              </div>
            </KartaBoczna>
          </div>
        }
        boczna={
          <>
            <TylkoOdDwochKolumn>
              <KartaBoczna tytul="Zapis">
                <div className={style.trescKarty}>
                  <StanZapisu opis={opisZapisu} zapisywanie={zapisywanie} />
                  <div className={style.przyciskKarty}>{przyciskZapisu}</div>
                  <Hint>Nagranie i pliki zapisują się same.</Hint>
                </div>
              </KartaBoczna>
            </TylkoOdDwochKolumn>

            <KartaBoczna tytul="Stan lekcji">
              <div className={style.stanLekcji}>
                {stan.uwaga.length > 0 && (
                  <p>
                    <strong className={style.uwaga}>Wymaga uwagi:</strong> {stan.uwaga.join(", ")}.
                  </p>
                )}
                {stan.gotowe.length > 0 && (
                  <p>
                    <strong>Gotowe:</strong> {stan.gotowe.join(", ")}.
                  </p>
                )}
                {stan.czekamy.length > 0 && (
                  <p>
                    <strong>Czekamy:</strong> {stan.czekamy.join(", ")}.
                  </p>
                )}
              </div>
            </KartaBoczna>

            <KartaBoczna tytul="Usunięcie lekcji" zwijana niebezpieczna>
              <div className={style.trescKarty}>
                <Text>Lekcja zniknie razem z nagraniem i plikami. Tego nie da się cofnąć.</Text>
                <div>
                  <Button poziom="outline" niebezpieczny type="button" onClick={() => setDialogUsuniecia(true)}>
                    Usuń lekcję
                  </Button>
                </div>
              </div>
            </KartaBoczna>
          </>
        }
      />

      {wyjscie && (
        <Dialog
          tytul="Zapisać zmiany przed przejściem?"
          etykietaWycofania="Zostań"
          etykietaPotwierdzenia="Zapisz i przejdź"
          onWycofaj={zostan}
          onPotwierdz={() => void zapiszIPrzejdz()}
        >
          <Text>Niezapisane: {zmienione.join(", ")}. Bez zapisu te zmiany przepadną.</Text>
          <div>
            <Button
              poziom="outline"
              type="button"
              onClick={() => {
                const { adres } = wyjscie;
                setWyjscie(null);
                router.push(adres);
              }}
            >
              Przejdź bez zapisu
            </Button>
          </div>
        </Dialog>
      )}
      {dialogUsuniecia && (
        <Dialog
          tytul={`Usunąć lekcję „${zapisana.title}”?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń lekcję"
          onWycofaj={() => setDialogUsuniecia(false)}
          onPotwierdz={() => void usun()}
        >
          <Text>Lekcja zniknie z kursu. Postęp historyczny uczestników zostaje zachowany.</Text>
        </Dialog>
      )}
      {materialDoUsuniecia && (
        <Dialog
          tytul={`Usunąć plik „${materialDoUsuniecia.name}”?`}
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Usuń plik"
          onWycofaj={() => setMaterialDoUsuniecia(null)}
          onPotwierdz={() => void usunWgranyMaterial(materialDoUsuniecia)}
        >
          <Text>Pliku nie da się przywrócić.</Text>
        </Dialog>
      )}
    </>
  );
}
