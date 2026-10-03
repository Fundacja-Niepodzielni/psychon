"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Field } from "@/design-system/molekuly/Field/Field";
import { ApiError } from "@/lib/api/klient";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import type { CialoProgowTestu, TestKursu } from "./dane";
import style from "./EkranKursu.module.css";

/**
 * Test końcowy w wierszu drzewa: `brak` — kurs go nie ma; `jest` — z adresem
 * pytań, progiem zaliczenia i limitem podejść (`null`, gdy serwer ich nie podał).
 */
export type TestDrzewa =
  | { rodzaj: "brak" }
  | { rodzaj: "jest"; id: number; adres: string; prog: number | null; podejscia: number | null };

/** Odmowa zapisu progu i podejść: zdanie ogólne albo zdania przy polach. */
export interface OdmowaProgow {
  zdanie: string | null;
  pola: { prog?: string; podejscia?: string };
}

const PROG_MIN = 1;
const PROG_MAX = 100;
const PODEJSCIA_MIN = 1;
const PODEJSCIA_MAX = 255;

export const ZDANIE_PROGU = `Próg zaliczenia musi mieścić się między ${PROG_MIN} a ${PROG_MAX} procent.`;
export const ZDANIE_PODEJSC = `Liczba podejść musi mieścić się między ${PODEJSCIA_MIN} a ${PODEJSCIA_MAX}.`;

/** Wiersz drzewa z odpowiedzi serwera; adres pytań daje rola ekranu. */
export function testDrzewaZSerwera(pobrany: TestKursu | null, adres: (idTestu: number) => string): TestDrzewa {
  if (typeof pobrany?.id !== "number") return { rodzaj: "brak" };
  return {
    rodzaj: "jest",
    id: pobrany.id,
    adres: adres(pobrany.id),
    prog: typeof pobrany.effective_pass_threshold === "number" ? pobrany.effective_pass_threshold : null,
    podejscia: typeof pobrany.effective_attempts_limit === "number" ? pobrany.effective_attempts_limit : null,
  };
}

/** „Próg zaliczenia 80 % · 3 podejścia” — tylko te części, które serwer podał. */
export function zdanieProgow(test: Extract<TestDrzewa, { rodzaj: "jest" }>): string {
  const czesci: string[] = [];
  if (test.prog !== null) czesci.push(`Próg zaliczenia ${test.prog} %`);
  if (test.podejscia !== null) {
    czesci.push(`${test.podejscia} ${odmien(test.podejscia, "podejście", "podejścia", "podejść")}`);
  }
  return czesci.join(" · ");
}

/**
 * Zdanie odmowy serwera dla wiersza testu: pierwszy komunikat pola, potem
 * komunikat serwera; bez odpowiedzi serwera (błąd sieci) — zdanie zapasowe.
 */
export function zdanieBleduTestu(blad: unknown, zapasowe: string): string {
  if (blad instanceof ApiError) {
    const pole = Object.values(blad.errors ?? {})
      .flat()
      .find((zdanie) => zdanie.trim() !== "");
    if (pole) return pole;
    if (blad.message.trim() !== "") return blad.message;
  }
  return zapasowe;
}

/** Odmowa zapisu progu i podejść: komunikaty pól `pass_threshold`/`attempts_limit` stają przy polach. */
export function odmowaProgow(blad: unknown): OdmowaProgow {
  if (blad instanceof ApiError && blad.errors) {
    const prog = blad.errors.pass_threshold?.[0];
    const podejscia = blad.errors.attempts_limit?.[0];
    if (prog || podejscia) return { zdanie: null, pola: { prog, podejscia } };
  }
  return { zdanie: zdanieBleduTestu(blad, "Nie udało się zapisać progu i podejść. Spróbuj ponownie."), pola: {} };
}

function liczbaWZakresie(tekst: string, min: number, max: number): number | null {
  const czysty = tekst.trim();
  if (!/^\d+$/.test(czysty)) return null;
  const liczba = Number(czysty);
  return liczba >= min && liczba <= max ? liczba : null;
}

interface WlasciwosciWierszaTestu {
  test: TestDrzewa;
  /** Zakłada test; zwraca zdanie odmowy albo `null`, gdy test powstał (ekran prowadzi wtedy do pytań). */
  onDodaj: () => Promise<string | null>;
  /** Zapisuje próg i podejścia; zwraca odmowę albo `null` po zapisie. */
  onZapiszProgi: (cialo: CialoProgowTestu) => Promise<OdmowaProgow | null>;
}

/**
 * Wiersz „Test na koniec kursu” w karcie „Tematy i lekcje”, ten sam w obu
 * rolach ekranu kursu. Bez testu: zdanie i „Dodaj test końcowy” (test
 * powstaje od razu z progiem i podejściami edycji). Z testem: próg zaliczenia
 * i limit podejść, „Zmień próg i podejścia” i „Otwórz pytania”. Liczby pytań
 * wiersz nie pokazuje — test liczy pytania, które ma.
 */
export function WierszTestu({ test, onDodaj, onZapiszProgi }: WlasciwosciWierszaTestu) {
  const baza = useId();
  const idNaglowka = `${baza}-naglowek`;
  const idKomunikatu = `${baza}-komunikat`;
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);
  const wysylanie = useRef(false);
  const [formularz, setFormularz] = useState(false);
  const wiersz = useRef<HTMLDivElement>(null);
  const fokusNaZmiane = useRef(false);

  useEffect(() => {
    if (!formularz && fokusNaZmiane.current) {
      fokusNaZmiane.current = false;
      wiersz.current?.querySelector<HTMLElement>("[data-zmien-progi]")?.focus();
    }
  }, [formularz]);

  async function dodaj() {
    if (wysylanie.current) return;
    wysylanie.current = true;
    setTrwa(true);
    setKomunikat(null);
    const odmowa = await onDodaj();
    wysylanie.current = false;
    setTrwa(false);
    setKomunikat(odmowa);
  }

  function zamknijFormularz() {
    fokusNaZmiane.current = true;
    setFormularz(false);
  }

  return (
    <div
      ref={wiersz}
      role="group"
      aria-labelledby={idNaglowka}
      aria-busy={trwa ? "true" : undefined}
      className={style.wierszTestu}
      data-wiersz-testu
    >
      <div className={style.nazwaTestu}>
        <Heading stopien={3} id={idNaglowka}>
          Test na koniec kursu
        </Heading>
        {test.rodzaj === "jest" ? (
          zdanieProgow(test) !== "" && <p className={style.stan}>{zdanieProgow(test)}</p>
        ) : (
          <p className={style.stan}>Kurs nie ma jeszcze testu końcowego.</p>
        )}
      </div>
      {test.rodzaj === "jest" ? (
        <div className={style.akcjeTestu}>
          <Button
            data-zmien-progi
            poziom="quiet"
            aria-expanded={formularz}
            onClick={() => {
              setKomunikat(null);
              if (formularz) zamknijFormularz();
              else setFormularz(true);
            }}
          >
            Zmień próg i podejścia
          </Button>
          <a className={style.otworz} href={test.adres}>
            Otwórz pytania
          </a>
        </div>
      ) : (
        <Button poziom="outline" aria-describedby={komunikat ? idKomunikatu : undefined} onClick={() => void dodaj()}>
          Dodaj test końcowy
        </Button>
      )}
      {komunikat && (
        <div className={style.komunikatTestu}>
          <ErrorText id={idKomunikatu}>{komunikat}</ErrorText>
        </div>
      )}
      {test.rodzaj === "jest" && formularz && (
        <FormularzProgow
          key={test.id}
          prog={test.prog}
          podejscia={test.podejscia}
          onZapisz={async (cialo) => {
            const odmowa = await onZapiszProgi(cialo);
            if (odmowa === null) zamknijFormularz();
            return odmowa;
          }}
          onAnuluj={zamknijFormularz}
        />
      )}
    </div>
  );
}

function FormularzProgow({
  prog,
  podejscia,
  onZapisz,
  onAnuluj,
}: {
  prog: number | null;
  podejscia: number | null;
  onZapisz: (cialo: CialoProgowTestu) => Promise<OdmowaProgow | null>;
  onAnuluj: () => void;
}) {
  const baza = useId();
  const idProgu = `${baza}-prog`;
  const idPodejsc = `${baza}-podejscia`;
  const [wartoscProgu, setWartoscProgu] = useState(prog === null ? "" : String(prog));
  const [wartoscPodejsc, setWartoscPodejsc] = useState(podejscia === null ? "" : String(podejscia));
  const [odmowa, setOdmowa] = useState<OdmowaProgow | null>(null);
  const wysylanie = useRef(false);

  useEffect(() => {
    document.getElementById(idProgu)?.focus();
  }, [idProgu]);

  async function zapisz() {
    if (wysylanie.current) return;
    const nowyProg = liczbaWZakresie(wartoscProgu, PROG_MIN, PROG_MAX);
    const nowePodejscia = liczbaWZakresie(wartoscPodejsc, PODEJSCIA_MIN, PODEJSCIA_MAX);
    if (nowyProg === null || nowePodejscia === null) {
      setOdmowa({
        zdanie: null,
        pola: {
          prog: nowyProg === null ? ZDANIE_PROGU : undefined,
          podejscia: nowePodejscia === null ? ZDANIE_PODEJSC : undefined,
        },
      });
      document.getElementById(nowyProg === null ? idProgu : idPodejsc)?.focus();
      return;
    }
    wysylanie.current = true;
    setOdmowa(null);
    const wynik = await onZapisz({ pass_threshold: nowyProg, attempts_limit: nowePodejscia });
    wysylanie.current = false;
    if (wynik !== null) setOdmowa(wynik);
  }

  return (
    <div className={style.formularzTestu}>
      <div className={style.polaTestu}>
        <Field
          id={idProgu}
          etykieta="Próg zaliczenia (%)"
          rodzaj="liczba"
          min={String(PROG_MIN)}
          maks={String(PROG_MAX)}
          wartosc={wartoscProgu}
          onZmiana={setWartoscProgu}
          blad={odmowa?.pola.prog}
        />
        <Field
          id={idPodejsc}
          etykieta="Liczba podejść"
          rodzaj="liczba"
          min={String(PODEJSCIA_MIN)}
          maks={String(PODEJSCIA_MAX)}
          wartosc={wartoscPodejsc}
          onZmiana={setWartoscPodejsc}
          blad={odmowa?.pola.podejscia}
        />
      </div>
      {odmowa?.zdanie && <ErrorText id={`${baza}-odmowa`}>{odmowa.zdanie}</ErrorText>}
      <div className={style.akcjeTestu}>
        <Button poziom="outline" onClick={() => void zapisz()}>
          Zapisz<span className={style.tylkoCzytnik}> próg i podejścia</span>
        </Button>
        <Button poziom="quiet" onClick={onAnuluj}>
          Anuluj
        </Button>
      </div>
    </div>
  );
}
