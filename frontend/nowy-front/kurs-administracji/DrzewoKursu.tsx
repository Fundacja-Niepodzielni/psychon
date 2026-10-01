"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Input } from "@/design-system/atomy/Input/Input";
import { StrzalkiKolejnosci } from "@/design-system/molekuly/StrzalkiKolejnosci/StrzalkiKolejnosci";
import { useRuchWierszy } from "@/design-system/molekuly/StrzalkiKolejnosci/ruch";
import { KartaBoczna } from "@/design-system/szablony/UkladEdycji/KartaBoczna";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import { StanWysylaniaWWierszu } from "@/nowy-front/wysylanie-nagrania/StanWysylaniaWWierszu";
import { useWysylanieLekcji } from "@/nowy-front/wysylanie-nagrania/useWysylanie";
import { ETYKIETY_STANU_LEKCJI, KOTWICA_DRZEWA, wymagaUwagi, type StanLekcji } from "./braki";
import style from "./EkranKursu.module.css";

export interface LekcjaDrzewa {
  id: number;
  tytul: string;
  /** Miejsce lekcji w kolejności całego kursu, od 1. */
  numer: number;
  /** Drobne dane wiersza („25 min”, prowadzący, „2 pliki”) — tylko te, które są. */
  meta: string[];
  stan: StanLekcji;
  /** Adres strony lekcji; bez niego wiersz nie ma „Otwórz”. */
  adres: string | null;
}

export interface TematDrzewa {
  id: number;
  tytul: string;
  minuty: number;
  lekcje: LekcjaDrzewa[];
}

/** Test na koniec kursu: `brak` — kurs go nie ma; `jest` — z adresem pytań. */
export type TestDrzewa = { rodzaj: "brak" } | { rodzaj: "jest"; adres: string };

interface WlasciwosciDrzewa {
  tematy: TematDrzewa[];
  /** `null`, gdy serwer nie odpowiedział o teście — wiersza testu wtedy nie ma. */
  test: TestDrzewa | null;
  /** Komunikat karty (odmowa zapisu kolejności), nad pierwszym tematem. */
  komunikat?: ReactNode;
  onPrzesunLekcje: (idLekcji: number, kierunek: -1 | 1) => void;
  onPrzesunTemat: (idTematu: number, kierunek: -1 | 1) => void;
  onZmienNazwe: (idTematu: number) => void;
  onUsunTemat: (idTematu: number) => void;
  onDodajTemat: () => void;
  /** Zakłada lekcję; zwraca zdanie błędu albo `null`, gdy lekcja powstała. */
  onDodajLekcje: (idTematu: number, tytul: string) => Promise<string | null>;
}

function zdanieTematu(temat: TematDrzewa): string {
  const liczba = temat.lekcje.length;
  if (liczba === 0) return "bez lekcji";
  const lekcje = `${liczba} ${odmien(liczba, "lekcja", "lekcje", "lekcji")}`;
  return temat.minuty > 0 ? `${lekcje} · ${temat.minuty} min` : lekcje;
}

function zdanieUwagi(liczba: number): string {
  return `${liczba} ${odmien(liczba, "lekcja wymaga", "lekcje wymagają", "lekcji wymaga")} uwagi`;
}

/**
 * Karta „Tematy i lekcje”: droga uczestnika od pierwszej lekcji do testu.
 * Kolejność zmieniają wyłącznie strzałki; karta nie zapisuje niczego sama —
 * każdą czynność oddaje ekranowi, który zna układ i serwer.
 */
export function DrzewoKursu({
  tematy,
  test,
  komunikat,
  onPrzesunLekcje,
  onPrzesunTemat,
  onZmienNazwe,
  onUsunTemat,
  onDodajTemat,
  onDodajLekcje,
}: WlasciwosciDrzewa) {
  const [zwiniete, setZwiniete] = useState<ReadonlySet<number>>(new Set());
  const [formularz, setFormularz] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  // Ruch wierszy (płynna zamiana, fokus na tej samej strzałce) daje pomocnik molekuły strzałek.
  const korzen = useRef<HTMLDivElement>(null);
  const ruch = useRuchWierszy(korzen);
  // Po zamknięciu menu, anulowaniu formularza i ruchu tematu fokus wraca na wskazany przycisk.
  const fokusPoRuchu = useRef<string | null>(null);
  const liczbaLekcji = tematy.reduce((suma, temat) => suma + temat.lekcje.length, 0);

  useEffect(() => {
    const cel = fokusPoRuchu.current;
    if (cel === null) return;
    fokusPoRuchu.current = null;
    const wezel = korzen.current?.querySelector<HTMLElement>(`[data-fokus="${cel}"]`);
    wezel?.focus();
  });

  useEffect(() => {
    if (menu === null) return;
    function naKlik(zdarzenie: MouseEvent) {
      const cel = zdarzenie.target as Element | null;
      if (!cel?.closest("[data-menu-tematu]")) setMenu(null);
    }
    document.addEventListener("mousedown", naKlik);
    return () => document.removeEventListener("mousedown", naKlik);
  }, [menu]);

  function przelaczZwiniecie(idTematu: number) {
    setZwiniete((poprzednie) => {
      const nastepne = new Set(poprzednie);
      if (nastepne.has(idTematu)) nastepne.delete(idTematu);
      else nastepne.add(idTematu);
      return nastepne;
    });
  }

  function przesunLekcje(lekcja: LekcjaDrzewa, kierunek: -1 | 1) {
    const naBrzegu = kierunek === -1 ? lekcja.numer === 1 : lekcja.numer === liczbaLekcji;
    if (naBrzegu) return;
    onPrzesunLekcje(lekcja.id, kierunek);
  }

  return (
    <KartaBoczna
      tytul="Tematy i lekcje"
      opis="Uczestnik przechodzi kurs w tej kolejności. Na końcu jest test."
      kotwica={KOTWICA_DRZEWA}
      bezOdstepu
    >
      <div ref={korzen}>
        {komunikat && <div className={style.komunikatKarty}>{komunikat}</div>}
        {tematy.length === 0 && (
          <div className={style.pustaKarta}>
            <Hint>Kurs nie ma jeszcze tematów. Zacznij od pierwszego tematu, potem dodasz do niego lekcje.</Hint>
          </div>
        )}
        {tematy.map((temat, indeksTematu) => {
          const zwiniety = zwiniete.has(temat.id);
          const uwaga = temat.lekcje.filter((lekcja) => wymagaUwagi(lekcja.stan)).length;
          const pusty = temat.lekcje.length === 0;
          return (
            <section
              key={temat.id}
              className={style.temat}
              aria-label={`Temat ${temat.tytul}`}
              data-temat={temat.id}
              data-ruch-klucz={`temat-${temat.id}`}
            >
              <div className={style.pasTematu}>
                <div className={style.nazwaTematu}>
                  <Heading stopien={3}>{temat.tytul}</Heading>
                  <p className={style.maly}>
                    <span>{zdanieTematu(temat)}</span>
                    {zwiniety && uwaga > 0 && <Badge wariant="warn">{zdanieUwagi(uwaga)}</Badge>}
                  </p>
                </div>
                <div className={style.akcjeTematu}>
                  <Button
                    poziom="outline"
                    rozmiar="sm"
                    aria-label={`Zmień nazwę tematu ${temat.tytul}`}
                    onClick={() => onZmienNazwe(temat.id)}
                  >
                    Zmień nazwę
                  </Button>
                  <Button
                    poziom="outline"
                    rozmiar="sm"
                    aria-expanded={!zwiniety}
                    aria-label={`${zwiniety ? "Rozwiń" : "Zwiń"} temat ${temat.tytul}`}
                    onClick={() => przelaczZwiniecie(temat.id)}
                  >
                    {zwiniety ? "Rozwiń" : "Zwiń"}
                  </Button>
                  <div
                    className={style.wiecej}
                    data-menu-tematu
                    onKeyDown={(zdarzenie) => {
                      if (zdarzenie.key !== "Escape" || menu !== temat.id) return;
                      zdarzenie.stopPropagation();
                      setMenu(null);
                      fokusPoRuchu.current = `wiecej-${temat.id}`;
                    }}
                  >
                    <Button
                      poziom="outline"
                      rozmiar="sm"
                      aria-expanded={menu === temat.id}
                      aria-label={`Więcej działań tematu ${temat.tytul}`}
                      data-fokus={`wiecej-${temat.id}`}
                      onClick={() => setMenu(menu === temat.id ? null : temat.id)}
                    >
                      Więcej
                    </Button>
                    {menu === temat.id && (
                      <div className={style.menuTematu}>
                        {indeksTematu > 0 && (
                          <Button
                            poziom="quiet"
                            onClick={() => {
                              setMenu(null);
                              fokusPoRuchu.current = `wiecej-${temat.id}`;
                              ruch.zapowiedz();
                              onPrzesunTemat(temat.id, -1);
                            }}
                          >
                            Przenieś temat wyżej
                          </Button>
                        )}
                        {indeksTematu < tematy.length - 1 && (
                          <Button
                            poziom="quiet"
                            onClick={() => {
                              setMenu(null);
                              fokusPoRuchu.current = `wiecej-${temat.id}`;
                              ruch.zapowiedz();
                              onPrzesunTemat(temat.id, 1);
                            }}
                          >
                            Przenieś temat niżej
                          </Button>
                        )}
                        <Button
                          poziom="quiet"
                          niebezpieczny
                          onClick={() => {
                            setMenu(null);
                            onUsunTemat(temat.id);
                          }}
                        >
                          Usuń temat
                        </Button>
                        <Hint>Najpierw zapytamy i powiemy, co stanie się z lekcjami tego tematu.</Hint>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!zwiniety && temat.lekcje.length > 0 && (
                <ol className={style.lekcje}>
                  {temat.lekcje.map((lekcja) => (
                    <WierszLekcji
                      key={lekcja.id}
                      lekcja={lekcja}
                      liczbaLekcji={liczbaLekcji}
                      onPrzesun={(kierunek) => przesunLekcje(lekcja, kierunek)}
                    />
                  ))}
                </ol>
              )}

              {!zwiniety &&
                (pusty || formularz === temat.id ? (
                  <NowaLekcja
                    temat={temat}
                    // W pustym temacie pole stoi otwarte od wejścia i nie zabiera fokusu.
                    fokusPrzyOtwarciu={formularz === temat.id}
                    onDodaj={async (tytul) => {
                      const blad = await onDodajLekcje(temat.id, tytul);
                      // Pole zostaje otwarte także wtedy, gdy temat przestał być pusty.
                      if (blad === null) setFormularz(temat.id);
                      return blad;
                    }}
                    onAnuluj={
                      pusty
                        ? undefined
                        : () => {
                            setFormularz(null);
                            fokusPoRuchu.current = `dodaj-${temat.id}`;
                          }
                    }
                  />
                ) : (
                  <div className={style.wierszDodawania}>
                    <button
                      type="button"
                      className={style.dodajLekcje}
                      aria-label={`Dodaj lekcję w temacie ${temat.tytul}`}
                      data-fokus={`dodaj-${temat.id}`}
                      onClick={() => setFormularz(temat.id)}
                    >
                      <span aria-hidden="true">+</span>
                      <span>Dodaj lekcję</span>
                    </button>
                  </div>
                ))}
            </section>
          );
        })}

        <div className={style.stopkaDrzewa}>
          <Button poziom="outline" data-dodaj-temat onClick={onDodajTemat}>
            + Dodaj temat
          </Button>
        </div>

        {test !== null && (
          <div className={style.wierszTestu}>
            <div className={style.nazwaTestu}>
              <Heading stopien={3}>Test na koniec kursu</Heading>
            </div>
            {test.rodzaj === "jest" ? (
              <a className={style.otworz} href={test.adres}>
                Otwórz pytania
              </a>
            ) : (
              <span className={style.stan}>Kurs nie ma testu</span>
            )}
          </div>
        )}
      </div>
    </KartaBoczna>
  );
}

function WierszLekcji({
  lekcja,
  liczbaLekcji,
  onPrzesun,
}: {
  lekcja: LekcjaDrzewa;
  liczbaLekcji: number;
  onPrzesun: (kierunek: -1 | 1) => void;
}) {
  const pierwsza = lekcja.numer === 1;
  const ostatnia = lekcja.numer === liczbaLekcji;
  // Trwające albo przerwane wysyłanie nagrania tej lekcji zastępuje w wierszu stan z serwera.
  const wysylanie = useWysylanieLekcji(lekcja.id);
  return (
    <li className={style.wiersz} data-lekcja={lekcja.id} data-ruch-klucz={`lekcja-${lekcja.id}`}>
      <span className={style.ruch}>
        <StrzalkiKolejnosci
          tytul={lekcja.tytul}
          mozeWyzej={!pierwsza}
          mozeNizej={!ostatnia}
          onWyzej={() => onPrzesun(-1)}
          onNizej={() => onPrzesun(1)}
        />
      </span>
      <span className={style.numer}>{lekcja.numer}</span>
      <span className={style.tytulLekcji} title={lekcja.tytul}>
        {lekcja.tytul}
      </span>
      {lekcja.meta.length > 0 && <span className={style.meta}>{lekcja.meta.join(" · ")}</span>}
      {wysylanie !== null ? (
        <span className={style.stan}>
          <StanWysylaniaWWierszu stan={wysylanie} />
        </span>
      ) : (
        <span className={lekcja.stan === "blad-nagrania" ? `${style.stan} ${style.stanBledu}` : style.stan}>
          {ETYKIETY_STANU_LEKCJI[lekcja.stan]}
        </span>
      )}
      {lekcja.adres && (
        <a className={style.otworz} href={lekcja.adres} aria-label={`Otwórz lekcję ${lekcja.numer}: ${lekcja.tytul}`}>
          Otwórz
        </a>
      )}
    </li>
  );
}

function NowaLekcja({
  temat,
  fokusPrzyOtwarciu,
  onDodaj,
  onAnuluj,
}: {
  temat: TematDrzewa;
  fokusPrzyOtwarciu: boolean;
  onDodaj: (tytul: string) => Promise<string | null>;
  onAnuluj?: () => void;
}) {
  const baza = useId();
  const [tytul, setTytul] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const wysylanie = useRef(false);
  const idPola = `${baza}-tytul`;
  const idBledu = `${baza}-blad`;
  const idPodpowiedzi = `${baza}-podpowiedz`;

  useEffect(() => {
    if (fokusPrzyOtwarciu) document.getElementById(idPola)?.focus();
    // Fokus tylko przy otwarciu pola przyciskiem, nie przy każdym rysowaniu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dodaj() {
    if (wysylanie.current) return;
    const czysty = tytul.trim();
    if (czysty === "") {
      setBlad("Podaj tytuł lekcji.");
      document.getElementById(idPola)?.focus();
      return;
    }
    wysylanie.current = true;
    setBlad(null);
    const odmowa = await onDodaj(czysty);
    wysylanie.current = false;
    if (odmowa === null) setTytul("");
    else setBlad(odmowa);
    // Pole zostaje otwarte z fokusem: kolejny tytuł wpisuje się od razu.
    document.getElementById(idPola)?.focus();
  }

  return (
    <div className={style.nowaLekcja}>
      <label htmlFor={idPola} className={style.etykieta}>
        Tytuł nowej lekcji<span className={style.tylkoCzytnik}> w temacie {temat.tytul}</span>
      </label>
      <div className={style.poleNowejLekcji}>
        <Input
          id={idPola}
          rodzaj="tekst"
          value={tytul}
          niepoprawny={blad !== null}
          aria-describedby={blad ? `${idPodpowiedzi} ${idBledu}` : idPodpowiedzi}
          onChange={(zdarzenie) => setTytul(zdarzenie.target.value)}
          onKeyDown={(zdarzenie) => {
            if (zdarzenie.key === "Enter") {
              zdarzenie.preventDefault();
              void dodaj();
            }
            if (zdarzenie.key === "Escape" && onAnuluj) onAnuluj();
          }}
        />
        <Button poziom="outline" onClick={() => void dodaj()}>
          Dodaj lekcję
        </Button>
      </div>
      <ErrorText id={idBledu}>{blad}</ErrorText>
      <Hint id={idPodpowiedzi}>Resztę uzupełnisz po otwarciu lekcji.</Hint>
      {onAnuluj && (
        <div>
          <Button poziom="quiet" onClick={onAnuluj}>
            Anuluj
          </Button>
        </div>
      )}
    </div>
  );
}
