import { Fragment, type ReactNode } from "react";
import { ListRow } from "../../molekuly/ListRow/ListRow";
import { EmptyState } from "../../molekuly/EmptyState/EmptyState";
import { Badge } from "../../atomy/Badge/Badge";
import { Button } from "../../atomy/Button/Button";
import { Heading } from "../../atomy/Heading/Heading";
import { Hint } from "../../atomy/Hint/Hint";
import { Link } from "../../atomy/Link/Link";
import { Num } from "../../atomy/Num/Num";
import { Text } from "../../atomy/Text/Text";
import style from "./RecordList.module.css";

type WariantPlakietkiRecordList = "neutral" | "ok" | "warn" | "error" | "pending";

interface PlakietkaRecordList {
  wariant: WariantPlakietkiRecordList;
  tekst: string;
}

interface AkcjaRecordList {
  /** Widoczny napis akcji (np. „Otwórz”). */
  etykieta: string;
  /** Pełna nazwa akcji dla czytnika (np. „Otwórz: Dyżury”); bez niej czytnik dostaje `etykieta`. */
  etykietaDostepna?: string;
  href?: string;
  onKliknij?: () => void;
}

/** Rodzaj kolumny w trybie kolumn; z rodzaju wynika wyrównanie i zawartość komórki. */
export type RodzajKolumnyRecordList = "tekst" | "stan" | "liczba" | "akcja";

/**
 * Kolumna listy w trybie kolumn. Pierwsza kolumna jest zawsze nazwą wiersza
 * (`tytul`, pod nim `tytulDodatek` i `podpowiedz`); kolumna `stan` pokazuje
 * `plakietka`, kolumna `akcja` — `akcja`. Kolumna `liczba` bez `klucz` bierze
 * `wartosc` wiersza z `jednostkaSumy` (i niesie sumę „Razem” w stopce);
 * pozostałe kolumny `liczba` i `tekst` biorą komórkę `komorki[klucz]`.
 * Nazwa kolumny `liczba` jest jednostką komórki z samą liczbą.
 */
export interface KolumnaRecordList {
  /** Nazwa kolumny: nagłówek od 640 px, podpis wartości poniżej 640 px. */
  nazwa: string;
  rodzaj: RodzajKolumnyRecordList;
  klucz?: string;
}

/**
 * Komórka kolumny z `klucz`: liczba z jednostką (przez `Num`), napis albo sama
 * liczba. Sama liczba (`bezJednostki`) jest dla kolumn, w których znaczenie
 * liczby niesie nazwa kolumny — nagłówek od 640 px, podpis przy wartości
 * poniżej (np. miejsce w kolejności).
 */
export type KomorkaRecordList =
  | { tekst: string }
  | { liczba: number; jednostka: string }
  | { liczba: number; bezJednostki: true };

export interface WierszRecordList {
  id: string;
  tytul: string;
  podpowiedz?: string;
  plakietka?: PlakietkaRecordList;
  /** Pogrubia tytuł wiersza (rodzaj w wierszu kolejki decyzji). */
  tytulPogrubiony?: boolean;
  /** Druga część tytułu po separatorze „·” (np. osoba); patrz `ListRow`. */
  tytulDodatek?: string;
  /** Podpowiedź (np. data) tylko dla czytnika ekranu; wzrokowo jej nie ma. */
  podpowiedzTylkoDlaCzytnika?: boolean;
  /** Wielkość wiersza („data, wielkość, stan, źródło”) —
   * wchodzi jednocześnie do licznika `ListRow` i do sumy w stopce, jedno
   * źródło prawdy, bez osobnego pola tylko do wyświetlenia. OPCJONALNA:
   * pomiń razem z `jednostkaSumy` niżej, gdy wiersz nie ma wartości, którą
   * miałoby sens sumować (np. ranga/kolejność) — wtedy ani licznik przy
   * wierszu, ani stopka „Razem” się nie renderują. */
  wartosc?: number;
  akcja: AkcjaRecordList;
  /** Tryb kolumn: wartości kolumn z `klucz`. */
  komorki?: Record<string, KomorkaRecordList>;
  /** Tryb kolumn: panel otwarty pod wierszem (np. decyzja). Wiersz z panelem
   * stoi na ciepłym tle i nie pokazuje akcji — akcje niesie panel. */
  panel?: ReactNode;
}

/** Wiersz bez akcji: nie ma ani odnośnika, ani przycisku (np. kolejka, której
 * ten ekran nie otwiera). Pozostałe pola jak w `WierszRecordList`. */
export type WierszBezAkcjiRecordList = Omit<WierszRecordList, "akcja"> & { akcja?: undefined };

type DowolnyWierszRecordList = WierszRecordList | WierszBezAkcjiRecordList;

interface WlasciwosciPustyRecordList {
  naglowek: string;
  tresc: string;
  przycisk: { etykieta: string; onClick: () => void };
}

interface WlasciwosciRecordList {
  tytul: string;
  wiersze: DowolnyWierszRecordList[];
  /** Jednostka/mianownik sumy w stopce (KO-6, jak `Num`/`StatTile`).
   * Napis stoi przy każdej liczbie bez zmian; funkcja `(liczba) => napis`
   * dostaje liczbę wiersza albo sumy i zwraca jednostkę w odpowiedniej
   * formie (odmiana liczebnika po stronie wołającego — DS nie zna języka).
   * OPCJONALNA — pomiń, gdy `wartosc` wierszy nie ma sensownej sumy
   * zbiorczej (np. ranga/kolejność); stopka „Razem” wtedy się nie
   * renderuje, zamiast pokazywać liczbę bez znaczenia. */
  jednostkaSumy?: string | ((liczba: number) => string);
  /** Renderowane zamiast listy i stopki, gdy `wiersze` jest puste
   * („EmptyState gdy zero wierszy”). */
  pusty: WlasciwosciPustyRecordList;
  /** Stopień nagłówka sekcji. Domyślnie 3 (jak dotąd); pulpity podają 2 dla
   * głównej listy — bezpośrednio pod `h1`, bez przeskoku stopnia
   * (makieta 2.0.4: „h2 z lewej”, reguła axe `heading-order`). */
  stopienNaglowka?: 2 | 3;
  /** Nagłówek sekcji tylko dla czytnika ekranu (zostaje w drzewie nagłówków,
   * ale wzrokowo go nie ma) — dla list, które stoją bezpośrednio pod `h1`
   * i same mówią, czym są. Domyślnie nagłówek jest widoczny. */
  naglowekTylkoDlaCzytnika?: boolean;
  /** Wiersze bez wcięcia poziomego: tekst równo z krawędzią treści ekranu. */
  wierszeBezWciecia?: boolean;
  /** Tryb kolumn: nazwa pierwsza, stan w osobnej kolumnie o szerokości treści,
   * liczby do prawej, akcja na końcu; od 640 px z nagłówkami kolumn, poniżej
   * układ piętrowy z podpisem przy każdej wartości. Bez tej właściwości lista
   * rysuje się jak dotąd (`ListRow` na wiersz). */
  kolumny?: KolumnaRecordList[];
  /** Lista w białej karcie (tło, ramka, zaokrąglenie z tokenów). */
  naKarcie?: boolean;
}

interface WlasciwosciTabeliRekordow {
  tytul: string;
  kolumny: KolumnaRecordList[];
  wiersze: DowolnyWierszRecordList[];
  bezWciecia: boolean;
  jednostka: (liczba: number) => string;
  maJednostke: boolean;
  /** Suma „Razem” albo `null`, gdy lista nie ma stopki. */
  suma: number | null;
}

function komorkaWartosci(
  kolumna: KolumnaRecordList,
  wiersz: DowolnyWierszRecordList,
  jednostka: (liczba: number) => string,
  maJednostke: boolean,
): ReactNode {
  if (kolumna.klucz !== undefined) {
    const komorka = wiersz.komorki?.[kolumna.klucz];
    if (!komorka) return null;
    if (!("liczba" in komorka)) return <span>{komorka.tekst}</span>;
    return "jednostka" in komorka ? (
      <Num wartosc={komorka.liczba} etykieta={komorka.jednostka} />
    ) : (
      <span className={style.samaLiczba}>{komorka.liczba.toLocaleString("pl-PL")}</span>
    );
  }
  if (kolumna.rodzaj === "liczba" && maJednostke && wiersz.wartosc !== undefined) {
    return <Num wartosc={wiersz.wartosc} etykieta={jednostka(wiersz.wartosc)} />;
  }
  return null;
}

/** Akcja wiersza w trybie kolumn: jedna reguła wyglądu dla odnośnika i przycisku. */
function akcjaWiersza(akcja: AkcjaRecordList): ReactNode {
  const napis = (
    <>
      {akcja.etykieta}{" "}
      <span className={style.strzalka} aria-hidden="true">
        ›
      </span>
    </>
  );
  return (
    <span className={style.akcja}>
      {akcja.href ? (
        <Link href={akcja.href} aria-label={akcja.etykietaDostepna}>
          {napis}
        </Link>
      ) : (
        <Button poziom="quiet" rozmiar="sm" onClick={akcja.onKliknij} aria-label={akcja.etykietaDostepna}>
          {napis}
        </Button>
      )}
    </span>
  );
}

/**
 * Lista w trybie kolumn. Semantyka tabeli rolami ARIA na elementach `div`
 * (`table` → `row` → `columnheader`/`cell`), nie natywną tabelą: ten sam
 * układ przechodzi z siatki (od 640 px) w piętrowy (poniżej), a role jawne
 * nie znikają przy zmianie `display`. Wiersz nagłówków poniżej 640 px jest
 * ukryty tylko wzrokowo, więc każda wartość zostaje powiązana z nazwą swojej
 * kolumny; widoczny podpis przy wartości jest wtedy poza drzewem dostępności,
 * żeby czytnik nie czytał nazwy kolumny dwa razy.
 */
function TabelaRekordow({
  tytul,
  kolumny,
  wiersze,
  bezWciecia,
  jednostka,
  maJednostke,
  suma,
}: WlasciwosciTabeliRekordow) {
  const klasy = bezWciecia ? `${style.tabela} ${style.bezWciecia}` : style.tabela;
  return (
    <div className={klasy} role="table" aria-label={tytul} data-liczba-kolumn={kolumny.length}>
      <div className={style.naglowki} role="row">
        {kolumny.map((kolumna, indeks) => (
          <span key={indeks} className={style.naglowekKolumny} role="columnheader" data-rodzaj={kolumna.rodzaj}>
            {kolumna.rodzaj === "akcja" ? <span className={style.ukryte}>{kolumna.nazwa}</span> : kolumna.nazwa}
          </span>
        ))}
      </div>
      {wiersze.map((wiersz) => {
        const otwarty = wiersz.panel !== undefined && wiersz.panel !== null;
        return (
          <Fragment key={wiersz.id}>
            <div
              className={otwarty ? `${style.wierszTabeli} ${style.otwarty}` : style.wierszTabeli}
              role="row"
              data-wiersz={wiersz.id}
            >
              {kolumny.map((kolumna, indeks) => {
                if (indeks === 0) {
                  return (
                    <div key={indeks} className={`${style.komorka} ${style.nazwa}`} role="cell" data-rodzaj={kolumna.rodzaj}>
                      <Text>{wiersz.tytul}</Text>
                      {wiersz.tytulDodatek && <Hint>{wiersz.tytulDodatek}</Hint>}
                      {wiersz.podpowiedz &&
                        (wiersz.podpowiedzTylkoDlaCzytnika ? (
                          <span className={style.ukryte}>{wiersz.podpowiedz}</span>
                        ) : (
                          <Hint>{wiersz.podpowiedz}</Hint>
                        ))}
                    </div>
                  );
                }
                if (kolumna.rodzaj === "akcja") {
                  return (
                    <div key={indeks} className={style.komorka} role="cell" data-rodzaj="akcja">
                      {!otwarty && wiersz.akcja ? akcjaWiersza(wiersz.akcja) : null}
                    </div>
                  );
                }
                const wartosc =
                  kolumna.rodzaj === "stan" ? (
                    wiersz.plakietka ? (
                      <span className={style.plakietka}>
                        <Badge wariant={wiersz.plakietka.wariant}>{wiersz.plakietka.tekst}</Badge>
                      </span>
                    ) : null
                  ) : (
                    komorkaWartosci(kolumna, wiersz, jednostka, maJednostke)
                  );
                return (
                  <div key={indeks} className={style.komorka} role="cell" data-rodzaj={kolumna.rodzaj}>
                    {wartosc !== null && (
                      <>
                        <span className={style.podpis} aria-hidden="true">
                          {kolumna.nazwa}
                        </span>
                        {wartosc}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {otwarty && (
              <div className={style.wierszPanelu} role="row">
                <div className={style.panel} role="cell" aria-colspan={kolumny.length}>
                  {wiersz.panel}
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
      {suma !== null && (
        <div className={style.wierszSumy} role="row">
          {kolumny.map((kolumna, indeks) => (
            <div key={indeks} className={style.komorka} role="cell" data-rodzaj={kolumna.rodzaj}>
              {indeks === 0 ? (
                "Razem"
              ) : kolumna.rodzaj === "liczba" && kolumna.klucz === undefined ? (
                <Num wartosc={suma} etykieta={jednostka(suma)} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Lista rekordów `RecordList` (O4). `ListRow` (M3) na wiersz + suma w
 * STOPCE liczona z `wiersze` (jedno źródło prawdy — nigdy osobny licznik
 * mogący się rozjechać z listą) + `EmptyState` (M17), gdy `wiersze` jest
 * puste. Składa 5 sekcji ekranu T3 „źródła liczb osoby”
 * (KARTA-EKRANU-T3-ZRODLA-LICZB-OSOBY): sam nie sprawdza rozjazdu sumy z
 * liczbą karty osoby — to porównanie i `Notice` żyją na poziomie strony,
 * która montuje po jednym `RecordList` na sekcję.
 */
export function RecordList({
  tytul,
  wiersze,
  jednostkaSumy,
  pusty,
  stopienNaglowka = 3,
  naglowekTylkoDlaCzytnika = false,
  wierszeBezWciecia = false,
  kolumny,
  naKarcie = false,
}: WlasciwosciRecordList) {
  const naglowek = naglowekTylkoDlaCzytnika ? (
    <div className={style.ukryte}>
      <Heading stopien={stopienNaglowka}>{tytul}</Heading>
    </div>
  ) : (
    <Heading stopien={stopienNaglowka}>{tytul}</Heading>
  );

  const klasaBazowa = naglowekTylkoDlaCzytnika ? `${style.sekcja} ${style.sekcjaZUkrytym}` : style.sekcja;
  const klasaSekcji = naKarcie
    ? `${klasaBazowa} ${style.karta} ${naglowekTylkoDlaCzytnika ? style.kartaBezNaglowka : style.kartaZNaglowkiem}`
    : klasaBazowa;

  if (wiersze.length === 0) {
    return (
      <section className={klasaSekcji} aria-label={tytul}>
        {naglowek}
        <EmptyState naglowek={pusty.naglowek} tresc={pusty.tresc} przycisk={pusty.przycisk} />
      </section>
    );
  }

  const jednostka = (liczba: number): string =>
    typeof jednostkaSumy === "function" ? jednostkaSumy(liczba) : (jednostkaSumy ?? "");
  const maSume = jednostkaSumy !== undefined && wiersze.every((wiersz) => wiersz.wartosc !== undefined);
  const suma = maSume ? wiersze.reduce((laczna, wiersz) => laczna + (wiersz.wartosc ?? 0), 0) : 0;

  if (kolumny) {
    return (
      <section className={klasaSekcji} aria-label={tytul}>
        {naglowek}
        <TabelaRekordow
          tytul={tytul}
          kolumny={kolumny}
          wiersze={wiersze}
          bezWciecia={wierszeBezWciecia}
          jednostka={jednostka}
          maJednostke={jednostkaSumy !== undefined}
          suma={maSume ? suma : null}
        />
      </section>
    );
  }

  return (
    <section className={klasaSekcji} aria-label={tytul}>
      {naglowek}
      <div className={style.lista}>
        {wiersze.map((wiersz) => (
          <ListRow
            key={wiersz.id}
            wariant="z-licznikiem"
            tytul={wiersz.tytul}
            tytulPogrubiony={wiersz.tytulPogrubiony}
            tytulDodatek={wiersz.tytulDodatek}
            podpowiedz={wiersz.podpowiedz}
            podpowiedzTylkoDlaCzytnika={wiersz.podpowiedzTylkoDlaCzytnika}
            bezWciecia={wierszeBezWciecia}
            plakietka={wiersz.plakietka}
            licznik={
              jednostkaSumy !== undefined && wiersz.wartosc !== undefined
                ? { wartosc: wiersz.wartosc, etykieta: jednostka(wiersz.wartosc) }
                : undefined
            }
            akcja={wiersz.akcja}
          />
        ))}
      </div>
      {maSume && (
        <div className={style.stopka}>
          <span>Razem</span>
          <Num wartosc={suma} etykieta={jednostka(suma)} />
        </div>
      )}
    </section>
  );
}
