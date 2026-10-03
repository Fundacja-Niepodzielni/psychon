"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Button } from "../../atomy/Button/Button";
import { Hint } from "../../atomy/Hint/Hint";
import { Skeleton } from "../../atomy/Skeleton/Skeleton";
import { Field } from "../../molekuly/Field/Field";
import { SaveBar } from "../../molekuly/SaveBar/SaveBar";
import { Notice } from "../../molekuly/Notice/Notice";
import { StrzalkiKolejnosci } from "../../molekuly/StrzalkiKolejnosci/StrzalkiKolejnosci";
import { useRuchWierszy } from "../../molekuly/StrzalkiKolejnosci/ruch";
import { EmptyState } from "../../molekuly/EmptyState/EmptyState";
import { STAN_GOTOWY, type StanDanych } from "../stanDanych";
import style from "./CourseTree.module.css";

export interface LekcjaCourseTree {
  id: string;
  tytul: string;
  czasMin: number;
  /** Niezapisana zmiana — znacznik przy numerze (kropka `--warn`). */
  zmieniona?: boolean;
}

export interface TematCourseTree {
  id: string;
  tytul: string;
  lekcje: LekcjaCourseTree[];
}

interface PustyCourseTree {
  naglowek: string;
  tresc: string;
  przycisk: { etykieta: string; onClick: () => void };
}

/** Treść rozwinięcia pod wierszem jednej lekcji (np. formularz edycji). */
export interface RozwiniecieCourseTree {
  lekcjaId: string;
  tresc: ReactNode;
}

interface WlasciwosciCourseTree {
  tematy: TematCourseTree[];
  liczbaZmian: number;
  onPrzenies: (zTematu: string, lekcjaId: string, doTematu: string, docelowyIndeks: number) => void;
  onDodajLekcje: (tematId: string) => void;
  onZmienTytulLekcji: (tematId: string, lekcjaId: string, nowyTytul: string) => void;
  onZapisz: () => void;
  onCofnij: () => void;
  onPorzucWszystko: () => void;
  /**
   * Gdy podane, wiersz lekcji ma przycisk „Edytuj” ZAMIAST „Zmień nazwę”:
   * lekcja ma wtedy jedną drogę edycji — tę, którą otwiera wywołujący.
   * Organizm tylko zgłasza kliknięcie; nie zna formularza ani zapisu.
   */
  onEdytujLekcje?: (tematId: string, lekcjaId: string) => void;
  /**
   * Treść rysowana wewnątrz elementu listy wskazanej lekcji, bezpośrednio pod
   * jej wierszem, na całą szerokość wiersza. Wiersz zostaje widoczny jako
   * nagłówek rozwinięcia.
   */
  rozwiniecie?: RozwiniecieCourseTree;
  /**
   * Treść rysowana na końcu wskazanego tematu, pod listą jego lekcji (np.
   * formularz nowej lekcji otwarty przez „Dodaj lekcję w tym temacie”).
   */
  podTematem?: { tematId: string; tresc: ReactNode };
  /** Stan pusty: pokazywany, gdy kurs nie ma żadnego tematu. */
  pusty: PustyCourseTree;
  stan?: StanDanych;
  /** Stan początkowy widoku; zmienia się potem wyłącznie działaniem osoby. */
  poczatkowoZwiniete?: string[];
}

type Kierunek = "wyzej" | "nizej";

interface Przeniesienie {
  doTematu: string;
  indeks: number;
}

/** Odmiana rzeczownika „lekcja” po liczebniku: 1 lekcja, 2–4 lekcje, 5 lekcji, 22 lekcje. */
export function odmienLekcje(liczba: number): string {
  const jednosci = liczba % 10;
  const dziesiatki = liczba % 100;
  if (liczba === 1) return `${liczba} lekcja`;
  if (jednosci >= 2 && jednosci <= 4 && (dziesiatki < 12 || dziesiatki > 14)) return `${liczba} lekcje`;
  return `${liczba} lekcji`;
}

/**
 * Cel przeniesienia strzałką. W obrębie tematu lekcja przesuwa się o jedno
 * miejsce; pierwsza lekcja tematu idzie „wyżej” na koniec poprzedniego tematu,
 * ostatnia idzie „niżej” na początek następnego. Brak celu tylko na skrajach
 * całego drzewa.
 */
function celPrzeniesienia(
  tematy: TematCourseTree[],
  indeksTematu: number,
  indeksLekcji: number,
  kierunek: Kierunek,
): Przeniesienie | null {
  const temat = tematy[indeksTematu];
  if (kierunek === "wyzej") {
    if (indeksLekcji > 0) return { doTematu: temat.id, indeks: indeksLekcji - 1 };
    const poprzedni = tematy[indeksTematu - 1];
    if (!poprzedni) return null;
    return { doTematu: poprzedni.id, indeks: poprzedni.lekcje.length };
  }
  if (indeksLekcji < temat.lekcje.length - 1) return { doTematu: temat.id, indeks: indeksLekcji + 1 };
  const nastepny = tematy[indeksTematu + 1];
  if (!nastepny) return null;
  return { doTematu: nastepny.id, indeks: 0 };
}

/**
 * Drzewo kursu `CourseTree` (O12). Pasmo tematu (`Heading` 3 + licznik +
 * akcje) + wiersze lekcji ze strzałkami kolejności + „Dodaj lekcję w tym
 * temacie” + `SaveBar` (M13). Edycja tytułu lekcji w miejscu wiersza używa
 * `Field` (M1); gdy w `design-system/organizmy` powstanie `FormSection` (O11),
 * ten fragment przechodzi na niego.
 *
 * Kolejność zmienia się jedną drogą: strzałki „wyżej”/„niżej” po lewej stronie
 * wiersza, z numerem lekcji między nimi (molekuła `StrzalkiKolejnosci`), zawsze widoczne. Ruch
 * między tematami: pierwsza lekcja tematu idzie „wyżej” na koniec poprzedniego,
 * ostatnia „niżej” na początek następnego. Zamianę wierszy rozgrywa i fokus
 * zwraca na tę samą strzałkę pomocnik `useRuchWierszy`; zdanie dla czytnika
 * składa wywołujący (`zdania.ts` molekuły), bo to on zna układ po zmianie.
 *
 * Trzy właściwości opcjonalne — `onEdytujLekcje`, `rozwiniecie` i
 * `podTematem` — dają edycję lekcji przy wierszu: przycisk „Edytuj”, treść pod
 * wierszem w tym samym elemencie listy i treść pod listą lekcji tematu.
 * Bez nich organizm rysuje i działa tak samo, ale bez edycji lekcji.
 */
export function CourseTree({
  tematy,
  liczbaZmian,
  onPrzenies,
  onDodajLekcje,
  onZmienTytulLekcji,
  onZapisz,
  onCofnij,
  onPorzucWszystko,
  onEdytujLekcje,
  rozwiniecie,
  podTematem,
  pusty,
  stan = STAN_GOTOWY,
  poczatkowoZwiniete = [],
}: WlasciwosciCourseTree) {
  const baza = useId();
  const korzen = useRef<HTMLDivElement>(null);
  useRuchWierszy(korzen);
  const [zwiniete, setZwiniete] = useState<Set<string>>(() => new Set(poczatkowoZwiniete));
  const [edytowana, setEdytowana] = useState<string | null>(null);

  if (stan.rodzaj === "ladowanie") {
    return (
      <div className={style.drzewo} aria-busy="true">
        <Skeleton wiersze={6} />
      </div>
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać programu kursu"
        akcja={
          <Button poziom="outline" onClick={stan.onPonow}>
            Spróbuj ponownie
          </Button>
        }
      >
        {stan.tresc}
      </Notice>
    );
  }

  if (tematy.length === 0) {
    return <EmptyState naglowek={pusty.naglowek} tresc={pusty.tresc} przycisk={pusty.przycisk} />;
  }

  function rozwin(tematId: string) {
    setZwiniete((poprzednio) => {
      if (!poprzednio.has(tematId)) return poprzednio;
      const nastepnie = new Set(poprzednio);
      nastepnie.delete(tematId);
      return nastepnie;
    });
  }

  function przelacz(tematId: string) {
    setZwiniete((poprzednio) => {
      const nastepnie = new Set(poprzednio);
      if (nastepnie.has(tematId)) nastepnie.delete(tematId);
      else nastepnie.add(tematId);
      return nastepnie;
    });
  }

  function przeniesStrzalka(tematId: string, lekcjaId: string, przeniesienie: Przeniesienie) {
    onPrzenies(tematId, lekcjaId, przeniesienie.doTematu, przeniesienie.indeks);
    rozwin(przeniesienie.doTematu);
  }

  return (
    <div ref={korzen} className={style.drzewo}>
      {tematy.map((temat, indeksTematu) => {
        const rozwiniety = !zwiniete.has(temat.id);
        const minuty = temat.lekcje.reduce((suma, l) => suma + l.czasMin, 0);
        const idListy = `${baza}-${temat.id}-lekcje`;
        return (
          <section key={temat.id} className={style.temat}>
            <div className={style.pasmo}>
              <Heading stopien={3}>{temat.tytul}</Heading>
              <Hint>
                {odmienLekcje(temat.lekcje.length)}, {minuty} min
              </Hint>
              <div className={style.akcjePasma}>
                <Button
                  poziom="quiet"
                  aria-label={`Dodaj lekcję w tym temacie „${temat.tytul}”`}
                  onClick={() => onDodajLekcje(temat.id)}
                  data-testid={`ct-dodaj-${temat.id}`}
                >
                  Dodaj lekcję w tym temacie
                </Button>
                <Button
                  poziom="quiet"
                  aria-label={`${rozwiniety ? "Zwiń" : "Rozwiń"} temat „${temat.tytul}”`}
                  aria-expanded={rozwiniety}
                  aria-controls={idListy}
                  onClick={() => przelacz(temat.id)}
                  data-testid={`ct-przelacz-${temat.id}`}
                >
                  {rozwiniety ? "Zwiń" : "Rozwiń"}
                </Button>
              </div>
            </div>

            <ol id={idListy} className={style.lista} hidden={!rozwiniety}>
              {temat.lekcje.map((lekcja, indeks) => {
                const wyzej = celPrzeniesienia(tematy, indeksTematu, indeks, "wyzej");
                const nizej = celPrzeniesienia(tematy, indeksTematu, indeks, "nizej");
                const rozwinieta = rozwiniecie?.lekcjaId === lekcja.id;
                const idRozwiniecia = `${baza}-rozwiniecie-${lekcja.id}`;
                return (
                  <li key={lekcja.id} data-lekcja={lekcja.id} data-ruch-klucz={`lekcja-${lekcja.id}`} className={style.wiersz}>
                    <span className={style.ruch}>
                      <StrzalkiKolejnosci
                        tytul={lekcja.tytul}
                        mozeWyzej={wyzej !== null}
                        mozeNizej={nizej !== null}
                        onWyzej={() => wyzej && przeniesStrzalka(temat.id, lekcja.id, wyzej)}
                        onNizej={() => nizej && przeniesStrzalka(temat.id, lekcja.id, nizej)}
                        numer={
                          <>
                            {lekcja.zmieniona && <span className={style.kropkaZmiany} aria-hidden="true" />}
                            {indeks + 1}
                            {lekcja.zmieniona && <span className={style.ukryte}> (niezapisana zmiana)</span>}
                          </>
                        }
                      />
                    </span>

                    {edytowana === lekcja.id ? (
                      <Field
                        id={`${baza}-tytul-${lekcja.id}`}
                        etykieta="Tytuł lekcji"
                        rodzaj="tekst"
                        wartosc={lekcja.tytul}
                        onZmiana={(wartosc) => onZmienTytulLekcji(temat.id, lekcja.id, wartosc)}
                      />
                    ) : (
                      <span className={style.tytulLekcji}>
                        {lekcja.tytul} · {lekcja.czasMin} min
                      </span>
                    )}

                    <div className={style.akcjeWiersza}>
                      <span className={style.akcjaNazwy}>
                        {onEdytujLekcje ? (
                          <Button
                            poziom="quiet"
                            aria-label={`Edytuj lekcję „${lekcja.tytul}”`}
                            aria-expanded={rozwinieta}
                            aria-controls={rozwinieta ? idRozwiniecia : undefined}
                            onClick={() => onEdytujLekcje(temat.id, lekcja.id)}
                            data-edytuj-lekcje={lekcja.id}
                          >
                            Edytuj
                          </Button>
                        ) : (
                          <Button
                            poziom="quiet"
                            onClick={() => setEdytowana(edytowana === lekcja.id ? null : lekcja.id)}
                            data-testid={`ct-edytuj-${lekcja.id}`}
                          >
                            {edytowana === lekcja.id ? "Zapisz nazwę" : "Zmień nazwę"}
                          </Button>
                        )}
                      </span>
                    </div>
                    {rozwinieta && (
                      <div id={idRozwiniecia} className={style.rozwiniecie} data-rozwiniecie-lekcji={lekcja.id}>
                        {rozwiniecie.tresc}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {podTematem?.tematId === temat.id && (
              <div className={style.podTematem} data-pod-tematem={temat.id}>
                {podTematem.tresc}
              </div>
            )}
          </section>
        );
      })}

      {liczbaZmian > 0 && (
        <SaveBar
          liczbaZmian={liczbaZmian}
          temat="Zmieniono kolejność albo tytuły lekcji"
          onCofnij={onCofnij}
          onPorzucWszystko={onPorzucWszystko}
          onZapisz={onZapisz}
        />
      )}
    </div>
  );
}
