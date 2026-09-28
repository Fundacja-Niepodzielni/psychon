"use client";

import { useId } from "react";
import { CollapsibleSection } from "../../molekuly/CollapsibleSection/CollapsibleSection";
import { Notice } from "../../molekuly/Notice/Notice";
import { Text } from "../../atomy/Text/Text";
import { Num } from "../../atomy/Num/Num";
import { Button } from "../../atomy/Button/Button";
import { STAN_GOTOWY, type StanDanych } from "../stanDanych";
import style from "./TimeChart.module.css";

export interface PunktTimeChart {
  etykieta: string;
  nauka: number;
  superwizja: number;
}

interface WlasciwosciTimeChart {
  tytul: string;
  dane: PunktTimeChart[];
  jednostka: string;
  /** Zakres, którego dotyczy wykres — pokazywany też w stanie bez danych. */
  zakres: string;
  stan?: StanDanych;
}

type Seria = "nauka" | "superwizja";

const SERIE: { klucz: Seria; nazwa: string }[] = [
  { klucz: "nauka", nazwa: "Godziny nauki" },
  { klucz: "superwizja", nazwa: "Godziny superwizji" },
];

const SZEROKA = { szerokosc: 640, wysokosc: 260 };
const WASKA = { szerokosc: 300, wysokosc: 228 };
// Lewy margines mieści opisy osi Y, prawy podpisy wartości na końcu linii.
const MARGINES = { gora: 20, dol: 28, lewo: 36, prawo: 32 };
const ODSTEP_PODPISOW = 14;

function formatujLiczbe(wartosc: number): string {
  return wartosc.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}

/** Krok podziałki osi Y: 1, 2 albo 5 razy potęga dziesięciu, tak żeby wyszło około czterech przedziałów. */
function krokPodzialki(najwieksza: number): number {
  const surowy = najwieksza / 4;
  const potega = 10 ** Math.floor(Math.log10(surowy));
  const mnoznik = [1, 2, 5, 10].find((m) => m * potega >= surowy) ?? 10;
  return mnoznik * potega;
}

/**
 * Jedna skala dla obu wersji wykresu: z tych samych `dane` liczy podziałki osi
 * Y oraz funkcje położenia punktu. Wersja szeroka i wąska różnią się tylko
 * wymiarami, więc pokazują te same wartości na tych samych podziałkach.
 */
function zbudujSkale(dane: PunktTimeChart[], wymiary: { szerokosc: number; wysokosc: number }) {
  const najwieksza = Math.max(1, ...dane.map((p) => p.nauka), ...dane.map((p) => p.superwizja));
  const krok = krokPodzialki(najwieksza);
  const gora = Math.ceil(najwieksza / krok) * krok;
  const podzialki: number[] = [];
  for (let wartosc = 0; wartosc <= gora + krok / 2; wartosc += krok) podzialki.push(wartosc);
  const szerokoscRysunku = wymiary.szerokosc - MARGINES.lewo - MARGINES.prawo;
  const wysokoscRysunku = wymiary.wysokosc - MARGINES.gora - MARGINES.dol;
  const odstepX = dane.length > 1 ? szerokoscRysunku / (dane.length - 1) : 0;
  return {
    podzialki,
    x: (indeks: number) => MARGINES.lewo + indeks * odstepX,
    y: (wartosc: number) => MARGINES.gora + wysokoscRysunku * (1 - wartosc / gora),
  };
}

function Wykres({
  dane,
  wymiary,
  idOpisu,
  jednostka,
}: {
  dane: PunktTimeChart[];
  wymiary: typeof SZEROKA;
  idOpisu: string;
  jednostka: string;
}) {
  const skala = zbudujSkale(dane, wymiary);
  const ostatni = dane[dane.length - 1];
  const xKonca = skala.x(dane.length - 1);
  // Podpisy na końcu linii: gdy dwie wartości leżą blisko, niższy podpis
  // schodzi w dół, żeby nie nachodziły na siebie.
  const podpisy = SERIE.map((seria) => ({ ...seria, wartosc: ostatni[seria.klucz], y: skala.y(ostatni[seria.klucz]) })).sort(
    (a, b) => a.y - b.y,
  );
  for (let i = 1; i < podpisy.length; i++) {
    if (podpisy[i].y - podpisy[i - 1].y < ODSTEP_PODPISOW) podpisy[i].y = podpisy[i - 1].y + ODSTEP_PODPISOW;
  }

  return (
    <svg
      role="img"
      aria-labelledby={idOpisu}
      viewBox={`0 0 ${wymiary.szerokosc} ${wymiary.wysokosc}`}
      className={style.svg}
    >
      <text x={MARGINES.lewo - 6} y={MARGINES.gora - 8} className={style.opisOsi} textAnchor="end">
        {jednostka}
      </text>
      {skala.podzialki.map((wartosc) => (
        <g key={wartosc}>
          <line
            x1={MARGINES.lewo}
            y1={skala.y(wartosc)}
            x2={wymiary.szerokosc - MARGINES.prawo}
            y2={skala.y(wartosc)}
            className={wartosc === 0 ? style.os : style.siatka}
          />
          <text
            x={MARGINES.lewo - 6}
            y={skala.y(wartosc)}
            className={style.opisOsi}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatujLiczbe(wartosc)}
          </text>
        </g>
      ))}
      {SERIE.map((seria) => (
        <path
          key={seria.klucz}
          d={dane
            .map((punkt, indeks) => `${indeks === 0 ? "M" : "L"}${skala.x(indeks).toFixed(1)},${skala.y(punkt[seria.klucz]).toFixed(1)}`)
            .join(" ")}
          className={seria.klucz === "nauka" ? style.liniaNauka : style.liniaSuperwizja}
          fill="none"
        />
      ))}
      {podpisy.map((podpis) => (
        <text
          key={podpis.klucz}
          x={xKonca + 6}
          y={podpis.y}
          className={style.podpisWartosci}
          dominantBaseline="middle"
        >
          {formatujLiczbe(podpis.wartosc)}
        </text>
      ))}
      {dane.map((punkt, indeks) => (
        <text
          key={punkt.etykieta}
          x={skala.x(indeks)}
          y={wymiary.wysokosc - 8}
          className={style.opisOsi}
          textAnchor="middle"
        >
          {punkt.etykieta}
        </text>
      ))}
    </svg>
  );
}

/**
 * Wykres `TimeChart` (O13). Legenda + wykres + `CollapsibleSection` (M16)
 * z tabelą tych samych liczb. Tabela i obie wersje wykresu czytają te same
 * punkty z `dane`: wykres przelicza je na położenie przez `zbudujSkale`,
 * tabela pokazuje je wprost, a podpis na końcu linii bierze ostatni punkt.
 * Żadna liczba nie powstaje w dwóch osobnych obliczeniach. Dwie wersje
 * przełączane CSS-em na progu 639 (szeroka 640×260, wąska 300×228) — obie
 * zamontowane naraz, jedna ukryta, z tą samą nazwą dostępną.
 */
export function TimeChart({ tytul, dane, jednostka, zakres, stan = STAN_GOTOWY }: WlasciwosciTimeChart) {
  const idOpisu = `${useId()}-opis`;

  if (stan.rodzaj === "ladowanie") {
    return (
      <div className={style.oprawa} aria-busy="true">
        <div className={style.szkielet} />
      </div>
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać wykresu"
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

  if (dane.length === 0) {
    return (
      <div className={style.oprawa}>
        <Text wariant="pusty">Brak danych dla zakresu: {zakres}.</Text>
      </div>
    );
  }

  return (
    <div className={style.oprawa}>
      <p id={idOpisu} className={style.opisDostepny}>
        {tytul} — {zakres}
      </p>
      <div className={style.legenda}>
        {SERIE.map((seria) => (
          <span key={seria.klucz} className={style.pozycjaLegendy}>
            <span
              className={`${style.znacznik} ${seria.klucz === "nauka" ? style.znacznikNauka : style.znacznikSuperwizja}`}
              aria-hidden="true"
            />
            {seria.nazwa}
          </span>
        ))}
      </div>

      <div className={style.wykresSzeroki}>
        <Wykres dane={dane} wymiary={SZEROKA} idOpisu={idOpisu} jednostka={jednostka} />
      </div>
      <div className={style.wykresWaski}>
        <Wykres dane={dane} wymiary={WASKA} idOpisu={idOpisu} jednostka={jednostka} />
      </div>

      <CollapsibleSection
        tytul="Dane wykresu w tabeli"
        liczba={dane.length}
        dzieci={
          <table className={style.tabela}>
            <thead>
              <tr>
                <th scope="col">Okres</th>
                {SERIE.map((seria) => (
                  <th key={seria.klucz} scope="col">
                    {seria.nazwa}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dane.map((punkt) => (
                <tr key={punkt.etykieta}>
                  <th scope="row">{punkt.etykieta}</th>
                  {SERIE.map((seria) => (
                    <td key={seria.klucz}>
                      <Num wartosc={punkt[seria.klucz]} etykieta={jednostka} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </div>
  );
}
