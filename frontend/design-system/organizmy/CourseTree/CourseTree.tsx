"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Button } from "../../atomy/Button/Button";
import { Hint } from "../../atomy/Hint/Hint";
import { Skeleton } from "../../atomy/Skeleton/Skeleton";
import { Field } from "../../molekuly/Field/Field";
import { SaveBar } from "../../molekuly/SaveBar/SaveBar";
import { Notice } from "../../molekuly/Notice/Notice";
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

interface PrzeciaganieCourseTree {
  lekcja: string;
  celTemat: string;
  celIndeks: number;
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
   * nagłówek rozwinięcia; na czas rozwinięcia nie da się go przeciągać.
   */
  rozwiniecie?: RozwiniecieCourseTree;
  /** Stan pusty: pokazywany, gdy kurs nie ma żadnego tematu. */
  pusty: PustyCourseTree;
  stan?: StanDanych;
  /** Stany początkowe widoku; zmieniają się potem wyłącznie działaniem osoby. */
  poczatkowoZwiniete?: string[];
  poczatkowoTrybKolejnosci?: boolean;
  poczatkowePrzeciaganie?: PrzeciaganieCourseTree;
}

type Kierunek = "wyzej" | "nizej";

interface Przeniesienie {
  doTematu: string;
  indeks: number;
  etykieta: string;
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
 * Cel przeniesienia z klawiatury. W obrębie tematu lekcja przesuwa się o jedno
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
  const tytul = temat.lekcje[indeksLekcji].tytul;
  if (kierunek === "wyzej") {
    if (indeksLekcji > 0) {
      return { doTematu: temat.id, indeks: indeksLekcji - 1, etykieta: `Przenieś „${tytul}” wyżej` };
    }
    const poprzedni = tematy[indeksTematu - 1];
    if (!poprzedni) return null;
    return {
      doTematu: poprzedni.id,
      indeks: poprzedni.lekcje.length,
      etykieta: `Przenieś „${tytul}” na koniec tematu „${poprzedni.tytul}”`,
    };
  }
  if (indeksLekcji < temat.lekcje.length - 1) {
    return { doTematu: temat.id, indeks: indeksLekcji + 1, etykieta: `Przenieś „${tytul}” niżej` };
  }
  const nastepny = tematy[indeksTematu + 1];
  if (!nastepny) return null;
  return {
    doTematu: nastepny.id,
    indeks: 0,
    etykieta: `Przenieś „${tytul}” na początek tematu „${nastepny.tytul}”`,
  };
}

/**
 * Drzewo kursu `CourseTree` (O12). Pasmo tematu (`Heading` 3 + licznik +
 * akcje) + wiersze lekcji z uchwytem + „Dodaj lekcję w tym temacie” +
 * `SaveBar` (M13). Edycja tytułu lekcji w miejscu wiersza używa `Field` (M1);
 * gdy w `design-system/organizmy` powstanie `FormSection` (O11), ten fragment
 * przechodzi na niego.
 *
 * Przenoszenie ma dwie drogi, obie wołają ten sam `onPrzenies`: uchwyt
 * przeciągany wskaźnikiem (także na pasmo innego tematu) oraz strzałki
 * „wyżej”/„niżej”, które przenoszą także między tematami. Na szerokości
 * ≤ 639 px uchwyt znika, a strzałki pokazuje przełącznik „Kolejność”.
 * Po przeniesieniu z klawiatury fokus wraca na tę samą strzałkę tej samej
 * lekcji, żeby dało się przenosić ją dalej bez szukania wiersza.
 *
 * Dwie właściwości opcjonalne — `onEdytujLekcje` i `rozwiniecie` — dają
 * edycję lekcji przy wierszu: przycisk „Edytuj” i treść pod wierszem w tym
 * samym elemencie listy. Bez nich organizm rysuje dokładnie to, co dotąd.
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
  pusty,
  stan = STAN_GOTOWY,
  poczatkowoZwiniete = [],
  poczatkowoTrybKolejnosci = false,
  poczatkowePrzeciaganie,
}: WlasciwosciCourseTree) {
  const baza = useId();
  const korzen = useRef<HTMLDivElement>(null);
  const [zwiniete, setZwiniete] = useState<Set<string>>(() => new Set(poczatkowoZwiniete));
  const [trybKolejnosci, setTrybKolejnosci] = useState(poczatkowoTrybKolejnosci);
  const [edytowana, setEdytowana] = useState<string | null>(null);
  const [przeciagana, setPrzeciagana] = useState<string | null>(poczatkowePrzeciaganie?.lekcja ?? null);
  const [cel, setCel] = useState<{ temat: string; indeks: number } | null>(
    poczatkowePrzeciaganie ? { temat: poczatkowePrzeciaganie.celTemat, indeks: poczatkowePrzeciaganie.celIndeks } : null,
  );
  const [doFokusu, setDoFokusu] = useState<{ lekcja: string; kierunek: Kierunek } | null>(null);

  useEffect(() => {
    if (!doFokusu || !korzen.current) return;
    const wiersz = korzen.current.querySelector(`[data-lekcja="${CSS.escape(doFokusu.lekcja)}"]`);
    if (!wiersz) return;
    const przeciwny: Kierunek = doFokusu.kierunek === "wyzej" ? "nizej" : "wyzej";
    const strzalka =
      wiersz.querySelector<HTMLButtonElement>(`[data-kierunek="${doFokusu.kierunek}"]:not(:disabled)`) ??
      wiersz.querySelector<HTMLButtonElement>(`[data-kierunek="${przeciwny}"]:not(:disabled)`);
    strzalka?.focus();
    setDoFokusu(null);
  }, [tematy, doFokusu]);

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

  function zakonczPrzeciaganie() {
    setPrzeciagana(null);
    setCel(null);
  }

  function upusc(tematId: string, indeks: number) {
    const zrodlo = tematy.find((t) => t.lekcje.some((l) => l.id === przeciagana));
    if (przeciagana && zrodlo) {
      onPrzenies(zrodlo.id, przeciagana, tematId, indeks);
      rozwin(tematId);
    }
    zakonczPrzeciaganie();
  }

  function przeniesZKlawiatury(tematId: string, lekcjaId: string, przeniesienie: Przeniesienie, kierunek: Kierunek) {
    onPrzenies(tematId, lekcjaId, przeniesienie.doTematu, przeniesienie.indeks);
    rozwin(przeniesienie.doTematu);
    setDoFokusu({ lekcja: lekcjaId, kierunek });
  }

  return (
    <div ref={korzen} className={style.drzewo} data-tryb-kolejnosci={trybKolejnosci ? "tak" : "nie"}>
      <div className={style.pasekKolejnosci}>
        <Button poziom="quiet" aria-pressed={trybKolejnosci} onClick={() => setTrybKolejnosci((p) => !p)}>
          Kolejność
        </Button>
      </div>

      {tematy.map((temat, indeksTematu) => {
        const rozwiniety = !zwiniete.has(temat.id);
        const minuty = temat.lekcje.reduce((suma, l) => suma + l.czasMin, 0);
        const idListy = `${baza}-${temat.id}-lekcje`;
        const celNaKoncu = cel?.temat === temat.id && cel.indeks === temat.lekcje.length;
        return (
          <section key={temat.id} className={style.temat}>
            <div
              className={`${style.pasmo} ${celNaKoncu ? style.celNaKoncu : ""}`}
              onDragOver={(e: DragEvent) => {
                if (!przeciagana) return;
                e.preventDefault();
                setCel({ temat: temat.id, indeks: temat.lekcje.length });
              }}
              onDrop={() => upusc(temat.id, temat.lekcje.length)}
            >
              <Heading stopien={3}>{temat.tytul}</Heading>
              <Hint>
                {odmienLekcje(temat.lekcje.length)}, {minuty} min
              </Hint>
              <div className={style.akcjePasma}>
                <Button poziom="quiet" onClick={() => onDodajLekcje(temat.id)} data-testid={`ct-dodaj-${temat.id}`}>
                  Dodaj lekcję w tym temacie
                </Button>
                <Button
                  poziom="quiet"
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
                const klasy = [
                  style.wiersz,
                  cel?.temat === temat.id && cel.indeks === indeks ? style.celPrzeciagania : "",
                  przeciagana === lekcja.id ? style.przeciagana : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li
                    key={lekcja.id}
                    data-lekcja={lekcja.id}
                    className={klasy}
                    draggable={!rozwinieta}
                    onDragStart={(e: DragEvent) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", lekcja.id);
                      setPrzeciagana(lekcja.id);
                    }}
                    onDragOver={(e: DragEvent) => {
                      e.preventDefault();
                      setCel({ temat: temat.id, indeks });
                    }}
                    onDrop={() => upusc(temat.id, indeks)}
                    onDragEnd={zakonczPrzeciaganie}
                  >
                    <span className={style.numer}>
                      {lekcja.zmieniona && <span className={style.kropkaZmiany} aria-hidden="true" />}
                      {indeks + 1}
                      {lekcja.zmieniona && <span className={style.ukryte}> (niezapisana zmiana)</span>}
                    </span>
                    <span className={style.uchwyt} aria-hidden="true" data-testid={`ct-uchwyt-${lekcja.id}`}>
                      ⠿
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
                      <div className={style.strzalki}>
                        <button
                          type="button"
                          className={style.strzalka}
                          data-kierunek="wyzej"
                          aria-label={wyzej?.etykieta ?? `„${lekcja.tytul}” jest pierwszą lekcją kursu`}
                          disabled={!wyzej}
                          onClick={() => wyzej && przeniesZKlawiatury(temat.id, lekcja.id, wyzej, "wyzej")}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className={style.strzalka}
                          data-kierunek="nizej"
                          aria-label={nizej?.etykieta ?? `„${lekcja.tytul}” jest ostatnią lekcją kursu`}
                          disabled={!nizej}
                          onClick={() => nizej && przeniesZKlawiatury(temat.id, lekcja.id, nizej, "nizej")}
                        >
                          ▼
                        </button>
                      </div>
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
