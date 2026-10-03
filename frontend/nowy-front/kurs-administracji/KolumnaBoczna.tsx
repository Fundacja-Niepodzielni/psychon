"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { ApiError } from "@/lib/api/klient";
import { zdanieBleduTematow } from "@/lib/api/h08-tematy";
import {
  COURSE_TYPE_LABELS,
  type AdminCourse,
  type CourseType,
} from "@/lib/h08/types";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { KartaBoczna } from "@/design-system/szablony/UkladEdycji/KartaBoczna";
import { TylkoOdDwochKolumn } from "@/design-system/szablony/UkladEdycji/UkladEdycji";
import { sklasyfikujBlad, usunKurs, zmienPublikacje } from "@/nowy-front/publikacja-kursu/dane";
import { useRolaKursu } from "@/nowy-front/rola-kursu/kontekst";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import { SekcjaZaproszenKursu } from "@/nowy-front/zaproszenia-kursu/ZaproszeniaKursu";
import { kursPozaKolejnoscia } from "@/nowy-front/zaproszenia-kursu/dane";
import { zdanieDoZrobienia, type PozycjaPublikacji, type StanPublikacji } from "./braki";
import { imieNazwisko, type PrzypisanieKursu } from "./dane";
import { PrzypisaniaKursu } from "./SekcjeKursu";
import style from "./EkranKursu.module.css";

export const KOTWICA_PUBLIKACJI = "publikacja";
/** Komunikat odmowy publikacji — po odmowie serwera fokus staje na nim. */
export const ID_ODMOWY_PUBLIKACJI = "publikacja-odmowa";

/**
 * Adres kursu w panelu uczestnika w trybie podglądu (`?podglad=1`). Personel
 * czyta tam także szkic (kontrakt, aneks „podgląd kursu nieopublikowanego”).
 * Jedyne miejsce, które składa ten adres — każdy odnośnik podglądu bierze go stąd.
 */
export function adresPodgladu(kurs: Pick<AdminCourse, "slug">): string {
  return `/panel/kursy/${kurs.slug}?podglad=1`;
}

interface WlasciwosciPrzyciskuGlownego {
  kurs: AdminCourse;
  onOpublikuj: () => void;
  /** Wyjście z ekranu po zapisie szkicu; tylko w szkicu stoi obok przycisku głównego. */
  onZapiszIWyjdz?: () => void;
}

/** Powód przy nieczynnej publikacji w roli prowadzącego. */
export const ZDANIE_PUBLIKACJI_ADMINISTRACJI = "Kurs publikuje administracja.";

/**
 * Jedyny zielony przycisk ekranu: „Opublikuj kurs” w szkicu, „Podgląd jako
 * uczestnik” po publikacji. Ten sam stoi w karcie „Publikacja” (od dwóch
 * kolumn) i w wąskim pasie (poniżej) — arkusz szablonu pokazuje zawsze jeden.
 * W roli prowadzącego „Opublikuj kurs” jest nieczynny z wyglądu (kłódka,
 * `aria-disabled`), z powodem obok: kurs publikuje administracja.
 */
export function PrzyciskGlowny({ kurs, onOpublikuj }: WlasciwosciPrzyciskuGlownego) {
  const { zarzadzanieKursem } = useRolaKursu();
  const idPowodu = useId();
  if (kurs.is_published) {
    return (
      <a className={style.przyciskGlowny} href={adresPodgladu(kurs)}>
        Podgląd jako uczestnik
      </a>
    );
  }
  if (!zarzadzanieKursem) {
    return (
      <span className={style.publikacjaNieczynna} data-nieczynny="true">
        <Button poziom="primary" aria-disabled="true" aria-describedby={idPowodu}>
          <Icon nazwa="lock" rozmiar={16} />
          Opublikuj kurs
        </Button>
        <span id={idPowodu} className={style.maly} data-powod-publikacji>
          {ZDANIE_PUBLIKACJI_ADMINISTRACJI}
        </span>
      </span>
    );
  }
  return (
    <Button poziom="primary" onClick={onOpublikuj}>
      Opublikuj kurs
    </Button>
  );
}

/**
 * Przyciski publikacji: główny (zielony) i — tylko w szkicu — pod nim
 * „Podgląd jako uczestnik” oraz „Zapisz szkic i wyjdź”, oba z obrysem, bez
 * tła. Zielony zostaje jeden; pozostałe nie są głównymi.
 */
export function PrzyciskiPublikacji({ kurs, onOpublikuj, onZapiszIWyjdz }: WlasciwosciPrzyciskuGlownego) {
  return (
    <>
      <PrzyciskGlowny kurs={kurs} onOpublikuj={onOpublikuj} />
      {!kurs.is_published && (
        <a className={style.przyciskPodgladu} href={adresPodgladu(kurs)}>
          <span>
            Podgląd<span className={style.tylkoSzeroki}> jako uczestnik</span>
          </span>
        </a>
      )}
      {!kurs.is_published && onZapiszIWyjdz && (
        <Button poziom="outline" onClick={onZapiszIWyjdz}>
          <span>
            Zapisz<span className={style.tylkoSzeroki}> szkic</span> i wyjdź
          </span>
        </Button>
      )}
    </>
  );
}

/** Treść wąskiego pasa: stan słowem, skrót braków i przyciski publikacji. */
export function PasPublikacji({
  kurs,
  stan,
  onOpublikuj,
  onZapiszIWyjdz,
}: WlasciwosciPrzyciskuGlownego & { stan: StanPublikacji }) {
  const liczba = stan.doZrobienia.length;
  return (
    <div className={style.pasKarta}>
      <p className={style.pasStan}>
        <b>{kurs.is_published ? "Opublikowany" : "Szkic"}</b>
        {liczba > 0 && (
          <span>
            <Link href={`#${KOTWICA_PUBLIKACJI}`}>
              {kurs.is_published
                ? `${odmien(liczba, "wymaga", "wymagają", "wymaga")} uwagi: ${liczba}`
                : zdanieDoZrobienia(liczba)}
            </Link>
          </span>
        )}
      </p>
      <div className={style.pasDzialania}>
        <PrzyciskiPublikacji kurs={kurs} onOpublikuj={onOpublikuj} onZapiszIWyjdz={onZapiszIWyjdz} />
      </div>
    </div>
  );
}

interface WlasciwosciKartyPublikacji extends WlasciwosciPrzyciskuGlownego {
  stan: StanPublikacji;
  /** Powody odmowy serwera przy publikacji — stają w miejscu listy braków. */
  odmowa: PozycjaPublikacji[] | null;
  /** Kliknięcie pozycji z odnośnikiem; ekran otwiera miejsce naprawy. */
  onPozycja: (pozycja: PozycjaPublikacji, zdarzenie: MouseEvent<HTMLAnchorElement>) => void;
}

function ListaPozycji({
  id,
  pozycje,
  onPozycja,
}: {
  id?: string;
  pozycje: PozycjaPublikacji[];
  onPozycja: WlasciwosciKartyPublikacji["onPozycja"];
}) {
  return (
    <ul id={id} className={style.listaPozycji}>
      {pozycje.map((pozycja) => (
        <li key={pozycja.id}>
          {pozycja.href ? (
            <Link href={pozycja.href} onClick={(zdarzenie) => onPozycja(pozycja, zdarzenie)}>
              {pozycja.tekst}
            </Link>
          ) : (
            <span className={style.maly}>{pozycja.tekst}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Karta „Publikacja” — pierwsza w prawej kolumnie. */
export function KartaPublikacji({
  kurs,
  stan,
  odmowa,
  onOpublikuj,
  onZapiszIWyjdz,
  onPozycja,
}: WlasciwosciKartyPublikacji) {
  const pozycje = odmowa ?? stan.doZrobienia;
  return (
    <KartaBoczna tytul="Publikacja" kotwica={KOTWICA_PUBLIKACJI}>
      <div className={style.trescKarty}>
        {kurs.is_published ? (
          <>
            <Text>Kurs jest opublikowany.</Text>
            <Hint>Zmiany w lekcjach uczestnicy widzą od razu po zapisaniu.</Hint>
          </>
        ) : (
          <Text>Kurs jest szkicem. Uczestnicy go nie widzą.</Text>
        )}
        {pozycje.length > 0 && (
          <div
            className={style.grupaPozycji}
            data-lista={odmowa ? "odmowa" : "braki"}
            {...(odmowa
              ? {
                  id: ID_ODMOWY_PUBLIKACJI,
                  role: "group",
                  tabIndex: -1,
                  "aria-labelledby": `${ID_ODMOWY_PUBLIKACJI}-tytul`,
                  "aria-describedby": `${ID_ODMOWY_PUBLIKACJI}-powody`,
                }
              : {})}
          >
            <Heading stopien={3} id={odmowa ? `${ID_ODMOWY_PUBLIKACJI}-tytul` : undefined}>
              {odmowa
                ? `Nie udało się opublikować (${pozycje.length})`
                : `${kurs.is_published ? "Wymaga uwagi" : "Do zrobienia"} (${pozycje.length})`}
            </Heading>
            <ListaPozycji
              id={odmowa ? `${ID_ODMOWY_PUBLIKACJI}-powody` : undefined}
              pozycje={pozycje}
              onPozycja={onPozycja}
            />
          </div>
        )}
        {!odmowa && stan.czekamy.length > 0 && (
          <div className={style.grupaPozycji}>
            <Heading stopien={3}>{`Czekamy (${stan.czekamy.length})`}</Heading>
            <ListaPozycji pozycje={stan.czekamy} onPozycja={onPozycja} />
          </div>
        )}
        {!odmowa && !kurs.is_published && stan.gotowe.length > 0 && <Hint>{`Gotowe: ${stan.gotowe.join(", ")}.`}</Hint>}
        <TylkoOdDwochKolumn>
          <div className={style.glownyWKarcie}>
            <PrzyciskiPublikacji kurs={kurs} onOpublikuj={onOpublikuj} onZapiszIWyjdz={onZapiszIWyjdz} />
          </div>
        </TylkoOdDwochKolumn>
      </div>
    </KartaBoczna>
  );
}

export type WierszUstawien = "dane" | "prowadzacy" | "zaproszenia";

/**
 * Wiersz „Zaproszenia” w karcie ustawień nie jest pokazywany, dopóki zaproszenia
 * na kurs nie wrócą po MVP. Kod wiersza i sekcji zostaje; powrót panelu to
 * zmiana tej jednej wartości.
 */
const ZAPROSZENIA_W_USTAWIENIACH: boolean = false;

interface WlasciwosciUstawien {
  kurs: AdminCourse;
  lekcje: { id: number; title: string }[];
  /** `null`, dopóki serwer nie odpowiedział albo gdy odmówił — wiersz nie ma wtedy stanu. */
  przypisania: PrzypisanieKursu[] | null;
  /** Najwyżej jeden wiersz jest rozwinięty; `null` — wszystkie zwinięte. */
  otwarty: WierszUstawien | null;
  onOtwarty: (wiersz: WierszUstawien | null) => void;
  onKurs: (kurs: AdminCourse) => void;
  onPrzypisania: (przypisania: PrzypisanieKursu[]) => void;
  onOgloszenie: (tresc: string) => void;
}

function stanDanych(kurs: AdminCourse): string {
  const miejsce = kurs.sequence_order === null ? "poza ścieżką" : `${kurs.sequence_order}. miejsce w ścieżce`;
  return `${COURSE_TYPE_LABELS[kurs.type]} · ${miejsce}`;
}

function stanProwadzacych(przypisania: PrzypisanieKursu[] | null): string | null {
  if (przypisania === null) return null;
  const kursu = przypisania.find((przypisanie) => przypisanie.lesson_id === null);
  if (kursu) return `${imieNazwisko(kursu.instructor)}, cały kurs`;
  const lekcji = przypisania.length;
  if (lekcji === 0) return "Brak prowadzącego";
  return `Bez prowadzącego całego kursu · ${lekcji} ${odmien(lekcji, "lekcja", "lekcje", "lekcji")} z prowadzącym`;
}

/** Karta „Ustawienia kursu”: wiersze ze stanem, rozwijane w miejscu. */
export function UstawieniaKursu({
  kurs,
  lekcje,
  przypisania,
  otwarty,
  onOtwarty,
  onKurs,
  onPrzypisania,
  onOgloszenie,
}: WlasciwosciUstawien) {
  const { zarzadzanieKursem } = useRolaKursu();
  const przelacz = (wiersz: WierszUstawien) => onOtwarty(otwarty === wiersz ? null : wiersz);
  const zamknij = (wiersz: WierszUstawien) => {
    onOtwarty(null);
    document.getElementById(`ustawienia-${wiersz}`)?.focus();
  };
  return (
    <KartaBoczna tytul="Ustawienia kursu" bezOdstepu>
      <Wiersz
        id="dane"
        etykieta="Opis i dane kursu"
        stan={zarzadzanieKursem ? stanDanych(kurs) : null}
        otwarty={otwarty}
        onPrzelacz={przelacz}
      >
        <FormularzDanych kurs={kurs} onKurs={onKurs} onOgloszenie={onOgloszenie} />
      </Wiersz>
      {/* Prowadzący kursu ustawia wyłącznie administracja; zaproszenia wracają po MVP. */}
      {zarzadzanieKursem && (
        <>
          <Wiersz
            id="prowadzacy"
            etykieta="Prowadzący"
            stan={stanProwadzacych(przypisania)}
            otwarty={otwarty}
            onPrzelacz={przelacz}
          >
            <PrzypisaniaKursu kurs={kurs} lekcje={lekcje} wUstawieniach onPrzypisania={onPrzypisania} />
          </Wiersz>
          {ZAPROSZENIA_W_USTAWIENIACH && (
            <Wiersz
              id="zaproszenia"
              etykieta="Zaproszenia"
              stan={kursPozaKolejnoscia(kurs) ? "Kurs poza kolejnością ścieżki" : "Kurs w ścieżce programu"}
              otwarty={otwarty}
              onPrzelacz={przelacz}
            >
              <SekcjaZaproszenKursu kurs={kurs} onZamknij={() => zamknij("zaproszenia")} />
            </Wiersz>
          )}
        </>
      )}
      <div className={style.notaUstawien}>
        <Hint>Pliki do pobrania dodajesz w lekcjach.</Hint>
      </div>
    </KartaBoczna>
  );
}

function Wiersz({
  id,
  etykieta,
  stan,
  otwarty,
  onPrzelacz,
  children,
}: {
  id: WierszUstawien;
  etykieta: string;
  stan: string | null;
  otwarty: WierszUstawien | null;
  onPrzelacz: (wiersz: WierszUstawien) => void;
  children: ReactNode;
}) {
  const rozwiniety = otwarty === id;
  return (
    <div className={style.wierszUstawien} data-wiersz={id}>
      <h3 className={style.naglowekWiersza}>
        <button
          type="button"
          id={`ustawienia-${id}`}
          className={style.przyciskWiersza}
          aria-expanded={rozwiniety}
          aria-controls={`ustawienia-${id}-panel`}
          onClick={() => onPrzelacz(id)}
        >
          <span className={style.opisWiersza}>
            <span className={style.etykietaWiersza}>{etykieta}</span>
            {stan && <span className={style.maly}>{stan}</span>}
          </span>
          <span
            aria-hidden="true"
            className={rozwiniety ? `${style.daszek} ${style.daszekRozwiniety}` : style.daszek}
          />
        </button>
      </h3>
      {rozwiniety && (
        <div id={`ustawienia-${id}-panel`} className={style.panelUstawien}>
          {children}
        </div>
      )}
    </div>
  );
}

const OPCJE_TYPU = (Object.keys(COURSE_TYPE_LABELS) as CourseType[]).map((wartosc) => ({
  wartosc,
  etykieta: COURSE_TYPE_LABELS[wartosc],
}));

type BledyDanych = Partial<Record<"tytul" | "opis" | "adres" | "typ" | "ogolny", string>>;

/**
 * Formularz danych kursu — te same pola i to samo żądanie co dotąd
 * (`zapiszKurs`: tytuł, opis, nazwa w adresie, rodzaj; grupy produktowej nie wysyła). Miejsca kursu
 * w ścieżce ten zapis nie zmienia; pokazuje je stan wiersza. W roli
 * prowadzącego formularz ma tylko tytuł i opis — resztę ustawia administracja.
 */
function FormularzDanych({
  kurs,
  onKurs,
  onOgloszenie,
}: {
  kurs: AdminCourse;
  onKurs: (kurs: AdminCourse) => void;
  onOgloszenie: (tresc: string) => void;
}) {
  const { dane, zarzadzanieKursem } = useRolaKursu();
  const [tytul, setTytul] = useState(kurs.title);
  const [opis, setOpis] = useState(kurs.description ?? "");
  const [adres, setAdres] = useState(kurs.slug);
  const [typ, setTyp] = useState<CourseType>(kurs.type);
  const [bledy, setBledy] = useState<BledyDanych>({});
  const [zapisano, setZapisano] = useState(false);
  const [trwa, setTrwa] = useState(false);
  // Te same przycięcia co w żądaniu zapisu: po zapisie formularz nie różni się od kursu.
  useZgloszenieNiezapisanychZmian(
    tytul.trim() !== kurs.title ||
      (opis.trim() === "" ? "" : opis) !== (kurs.description ?? "") ||
      adres.trim() !== kurs.slug ||
      typ !== kurs.type,
    "Dane kursu",
  );

  async function zapisz() {
    if (trwa) return;
    setZapisano(false);
    if (tytul.trim() === "") {
      setBledy({ tytul: "Podaj tytuł kursu." });
      return;
    }
    if (zarzadzanieKursem && adres.trim() === "") {
      setBledy({ adres: "Podaj nazwę w adresie strony." });
      return;
    }
    setTrwa(true);
    try {
      const zapisany = await dane.zapiszDaneKursu(kurs.id, {
        title: tytul.trim(),
        description: opis.trim() === "" ? null : opis,
        slug: adres.trim(),
        type: typ,
      });
      setBledy({});
      setZapisano(true);
      onKurs(zapisany);
      onOgloszenie("Zapisano dane kursu.");
    } catch (blad) {
      if (blad instanceof ApiError && blad.code === "validation_failed") {
        const pol: BledyDanych = {
          tytul: blad.errors?.title?.[0],
          opis: blad.errors?.description?.[0],
          adres: blad.errors?.slug?.[0],
          typ: blad.errors?.type?.[0],
        };
        if (Object.values(pol).some(Boolean)) {
          setBledy(pol);
          return;
        }
      }
      setBledy({ ogolny: zdanieBleduTematow(blad) });
    } finally {
      setTrwa(false);
    }
  }

  return (
    <div className={style.formularz}>
      {bledy.ogolny && (
        <Notice wariant="error" tytul="Dane kursu nie zostały zapisane">
          {bledy.ogolny}
        </Notice>
      )}
      <Field
        id="dane-kursu-tytul"
        etykieta="Tytuł kursu"
        rodzaj="tekst"
        wymagane
        wartosc={tytul}
        onZmiana={setTytul}
        blad={bledy.tytul}
      />
      <Field
        id="dane-kursu-opis"
        etykieta="Opis kursu"
        rodzaj="wieloliniowy"
        wartosc={opis}
        onZmiana={setOpis}
        blad={bledy.opis}
      />
      {zarzadzanieKursem && (
        <>
          <Field
            id="dane-kursu-rodzaj"
            etykieta="Rodzaj"
            rodzaj="wybor"
            opcje={OPCJE_TYPU}
            wartosc={typ}
            onZmiana={(wartosc) => setTyp(wartosc as CourseType)}
            blad={bledy.typ}
          />
          <Field
            id="dane-kursu-adres"
            etykieta="Nazwa w adresie strony"
            rodzaj="tekst"
            wymagane
            wartosc={adres}
            onZmiana={setAdres}
            podpowiedz="Litery, cyfry, myślniki i podkreślenia."
            blad={bledy.adres}
          />
        </>
      )}
      <div className={style.wierszPrzyciskow}>
        <Button poziom="outline" disabled={trwa} onClick={() => void zapisz()}>
          Zapisz dane kursu
        </Button>
        {zapisano && <span className={style.maly}>Zapisano.</span>}
      </div>
    </div>
  );
}

/** Pliki dodane kiedyś wprost do kursu. Karta istnieje tylko wtedy, gdy kurs je ma. */
export function StarszePlikiKursu({ kurs }: { kurs: AdminCourse }) {
  const liczba = kurs.materials_count;
  if (liczba <= 0) return null;
  return (
    <KartaBoczna tytul="Starsze pliki kursu">
      <div className={style.trescKarty}>
        <Text>
          {`Kurs ma ${liczba} ${odmien(liczba, "plik dodany", "pliki dodane", "plików dodanych")} wcześniej, poza lekcjami.`}
        </Text>
        <Hint>Nowe pliki dodawaj w lekcjach.</Hint>
      </div>
    </KartaBoczna>
  );
}

export type RodzajOknaKursu = "usun" | "cofnij";

/**
 * Ostatnia karta, zwinięta: działania rzadkie i nieodwracalne. Karta tylko
 * prosi o okno pytania; okno (`OknoKursu`) stoi poza kolumnami ekranu.
 */
export function KartaKoncowa({ kurs, onOkno }: { kurs: AdminCourse; onOkno: (rodzaj: RodzajOknaKursu) => void }) {
  return (
    <KartaBoczna
      tytul={kurs.is_published ? "Cofnięcie publikacji i usunięcie kursu" : "Usunięcie kursu"}
      zwijana
      niebezpieczna
    >
      <div className={style.trescKarty}>
        {kurs.is_published ? (
          <>
            <Text>Po cofnięciu publikacji kurs wraca do szkicu i uczestnicy przestają go widzieć.</Text>
            <div>
              <Button poziom="outline" onClick={() => onOkno("cofnij")}>
                Cofnij publikację
              </Button>
            </div>
            <Text>Usunięty kurs znika razem z lekcjami, nagraniami i plikami. Tego nie da się cofnąć.</Text>
          </>
        ) : (
          <Text>Kurs zniknie razem z lekcjami, nagraniami i plikami. Tego nie da się cofnąć.</Text>
        )}
        <div>
          <Button poziom="outline" niebezpieczny onClick={() => onOkno("usun")}>
            Usuń kurs
          </Button>
        </div>
      </div>
    </KartaBoczna>
  );
}

interface WlasciwosciOknaKursu {
  kurs: AdminCourse;
  rodzaj: RodzajOknaKursu;
  onZamknij: () => void;
  onKurs: (kurs: AdminCourse) => void;
  onUsunieto: () => void;
  onNieZnaleziono: () => void;
  onOgloszenie: (tresc: string) => void;
}

/**
 * Okno pytania przed usunięciem kursu i przed cofnięciem publikacji. Oba
 * działania idą tymi samymi żądaniami co dotąd (`usunKurs`, `zmienPublikacje`).
 */
export function OknoKursu({
  kurs,
  rodzaj,
  onZamknij,
  onKurs,
  onUsunieto,
  onNieZnaleziono,
  onOgloszenie,
}: WlasciwosciOknaKursu) {
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);
  const idKursu = String(kurs.id);

  async function potwierdz() {
    if (trwa) return;
    setTrwa(true);
    setBlad(null);
    try {
      if (rodzaj === "usun") {
        await usunKurs(idKursu);
        onZamknij();
        onUsunieto();
      } else {
        const po = await zmienPublikacje(idKursu, false);
        onZamknij();
        onKurs(po);
        onOgloszenie("Publikacja kursu została cofnięta. Kurs jest szkicem.");
      }
    } catch (wyjatek) {
      const klasa = sklasyfikujBlad(idKursu, wyjatek);
      if (klasa.rodzaj === "nie-znaleziono") {
        onZamknij();
        onNieZnaleziono();
      } else if (klasa.rodzaj === "zakazane") {
        setBlad(zdanieOdmowyRoli("administracji"));
      } else if (klasa.rodzaj === "siec") {
        setBlad("Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.");
      } else {
        setBlad(klasa.komunikat);
      }
    } finally {
      setTrwa(false);
    }
  }

  return (
    <Dialog
      tytul={rodzaj === "usun" ? "Usunąć kurs?" : "Cofnąć publikację kursu?"}
      etykietaWycofania="Anuluj"
      etykietaPotwierdzenia={rodzaj === "usun" ? "Usuń kurs" : "Cofnij publikację"}
      onWycofaj={onZamknij}
      onPotwierdz={() => void potwierdz()}
    >
      {blad && (
        <Notice wariant="error" tytul={rodzaj === "usun" ? "Nie udało się usunąć kursu" : "Nie udało się cofnąć publikacji"}>
          {blad}
        </Notice>
      )}
      <Text>
        {rodzaj === "usun"
          ? `Kurs „${kurs.title}” zniknie razem z lekcjami, nagraniami i plikami. Tego nie da się cofnąć.`
          : `Kurs „${kurs.title}” wróci do szkicu i uczestnicy przestaną go widzieć.`}
      </Text>
    </Dialog>
  );
}
