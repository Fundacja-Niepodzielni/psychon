"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { TrescLekcji } from "@/design-system/molekuly/TrescLekcji/TrescLekcji";
import { LessonTemplate } from "@/design-system/szablony/LessonTemplate/LessonTemplate";
import { LessonPlayer } from "@/design-system/organizmy/LessonPlayer/LessonPlayer";
import { pobierzPlikiLekcji, type PlikKursu } from "@/nowy-front/pliki-kursu/dane";
import { PlikiLekcji } from "@/nowy-front/pliki-kursu/PlikiLekcji";
import { kursZAdresu } from "./adres";
import {
  maTekst,
  okruszkiLekcji,
  pobierzDaneLekcji,
  procentAktywnegoCzasu,
  ukladGlownej,
  ukonczLekcje,
  wyslijPostep,
  type DaneLekcji,
} from "./dane";
import style from "./Lekcja.module.css";

/** Heartbeat cadence — the upper bound the contract allows ("co <= 30 s"). */
const HEARTBEAT_INTERWAL_SEKUND = 30;

/** Seconds counted locally since the last send: played, played with the tab
 * visible, and played since the last cadence tick. */
interface ZebranePrzyrosty {
  obejrzane: number;
  aktywne: number;
  odTyku: number;
}

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "zablokowany"; komunikat: string }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "ok"; dane: DaneLekcji; bezNagrania: boolean };

interface WlasciwosciLekcja {
  id: string;
}

/**
 * Route `/nowy-front/lekcja/[id]`. Five states: loading, error, blocked
 * (course locked, message straight from the response envelope), not found,
 * and the lesson itself. Every state renders INSIDE `LessonTemplate`, whose
 * root is the only `main` of the page. In the lesson state `LessonPlayer`
 * carries the recording frame and the short description, `TrescLekcji` the
 * lesson body (`content`, Markdown subset, never raw HTML); the completion
 * button lives at this level because `LessonPlayer` has no callback for it.
 * The button is the one primary action while it can act; below the
 * threshold it is an outline button, disabled, with the reason next to it
 * (a primary button is never disabled in the design system).
 *
 * Files to download: the course comes only from the `?kurs=<slug>` address
 * parameter (the lesson resource carries none). With a valid parameter the
 * screen reads `GET /courses/{slug}` once the lesson has loaded and shows a
 * "Pliki do pobrania" card with this lesson's files in the supporting column;
 * without the parameter, with a malformed one, or when the course read fails
 * (locked, not found, network) or lacks the lesson, there is no card and no
 * error sentence.
 *
 * Progress heartbeat (`POST /lessons/{id}/progress`, contract "Postęp
 * lekcji"): while the recording is playing a one-second clock counts played
 * seconds (`watched_delta`) and played seconds with the tab visible
 * (`active_delta`); every 30 s of playing the collected increments are sent,
 * unless the tab is hidden at that moment. "Playing" comes from
 * `LessonPlayer`'s `onZmianaOdtwarzania` callback
 * (`design-system/organizmy/LessonPlayer/LessonPlayer.tsx`, play/pause
 * button handler) into a ref; "visible" is read off `document.hidden` each
 * second. The response carries the server counters, which refresh the screen
 * (progress bar, active-time sentence, the completion button unlocking when
 * `completable` turns true). A failed send keeps the increments for the next
 * tick and shows a notice with a retry button.
 */
export function Lekcja({ id }: WlasciwosciLekcja) {
  const router = useRouter();
  const kurs = kursZAdresu(useSearchParams().get("kurs"));
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [wysylanie, setWysylanie] = useState(false);
  const [bladUkonczenia, setBladUkonczenia] = useState<string | null>(null);
  const [bladZapisu, setBladZapisu] = useState(false);
  // Wynik odczytu plików razem z kluczem (kurs, lekcja), dla którego powstał:
  // wynik dla innej lekcji albo kursu nigdy nie trafia na ekran.
  const [wynikPlikow, setWynikPlikow] = useState<{ klucz: string; pliki: PlikKursu[] | null } | null>(null);
  const odtwarzaneRef = useRef(false);
  const przyrostyRef = useRef<ZebranePrzyrosty>({ obejrzane: 0, aktywne: 0, odTyku: 0 });
  const wysylanieRef = useRef(false);
  const zamontowanaRef = useRef(true);

  const wyslijZebrane = useCallback(async () => {
    const zebrane = przyrostyRef.current;
    if (wysylanieRef.current || (zebrane.obejrzane === 0 && zebrane.aktywne === 0)) return;
    wysylanieRef.current = true;
    const przyrosty = { watched_delta: zebrane.obejrzane, active_delta: zebrane.aktywne };
    zebrane.obejrzane = 0;
    zebrane.aktywne = 0;
    const postep = await wyslijPostep(id, przyrosty);
    wysylanieRef.current = false;
    if (!zamontowanaRef.current) return;
    if (!postep) {
      // Not saved: keep the increments, the next tick sends them together.
      zebrane.obejrzane += przyrosty.watched_delta;
      zebrane.aktywne += przyrosty.active_delta;
      setBladZapisu(true);
      return;
    }
    setBladZapisu(false);
    setStan((poprzedni) =>
      poprzedni.rodzaj === "ok"
        ? {
            ...poprzedni,
            dane: {
              ...poprzedni.dane,
              watched_seconds: postep.watched_seconds,
              active_seconds: postep.active_seconds,
              completable: postep.completable,
              completable_at_percent: postep.completable_at_percent,
            },
          }
        : poprzedni,
    );
  }, [id]);

  function wczytaj(straz?: { anulowane: boolean }) {
    return pobierzDaneLekcji(id).then((wynik) => {
      if (straz?.anulowane) return;
      if (wynik.status === "ok") {
        setStan({ rodzaj: "ok", dane: wynik.dane, bezNagrania: wynik.bezNagrania });
      } else if (wynik.status === "zablokowany") {
        setStan({ rodzaj: "zablokowany", komunikat: wynik.komunikat });
      } else if (wynik.status === "nie-znaleziono") {
        setStan({ rodzaj: "nie-znaleziono" });
      } else {
        setStan({ rodzaj: "blad" });
      }
    });
  }

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
    // Fetch only on mount/id change — nothing else in this effect changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    zamontowanaRef.current = true;
    return () => {
      zamontowanaRef.current = false;
    };
  }, []);

  // Pliki lekcji: tylko gdy lekcja jest wczytana, a adres niesie poprawny kurs
  // (`?kurs=<slug>`). Brak kursu, kurs zablokowany albo lekcja spoza kursu =
  // brak karty; ekran lekcji działa dalej, bez zdania o błędzie.
  const lekcjaGotowa = stan.rodzaj === "ok";
  const idLekcji = Number(id);
  const kluczPlikow = `${kurs ?? ""}/${idLekcji}`;
  const odswiezPliki = useCallback(
    () => (kurs === null ? Promise.resolve(null) : pobierzPlikiLekcji(kurs, idLekcji)),
    [kurs, idLekcji],
  );
  useEffect(() => {
    if (!lekcjaGotowa || kurs === null) return undefined;
    let anulowane = false;
    void odswiezPliki().then((wynik) => {
      if (!anulowane) setWynikPlikow({ klucz: kluczPlikow, pliki: wynik });
    });
    return () => {
      anulowane = true;
    };
  }, [lekcjaGotowa, kurs, kluczPlikow, odswiezPliki]);
  const pliki = lekcjaGotowa && wynikPlikow?.klucz === kluczPlikow ? wynikPlikow.pliki : null;

  useEffect(() => {
    if (stan.rodzaj !== "ok") return undefined;
    // `LessonPlayer` always mounts with its internal `odtwarzane` at `false`.
    odtwarzaneRef.current = false;
    przyrostyRef.current = { obejrzane: 0, aktywne: 0, odTyku: 0 };

    function tyk() {
      if (!odtwarzaneRef.current) return;
      const ukryta = typeof document !== "undefined" && document.hidden;
      const zebrane = przyrostyRef.current;
      zebrane.obejrzane += 1;
      if (!ukryta) zebrane.aktywne += 1;
      zebrane.odTyku += 1;
      if (zebrane.odTyku < HEARTBEAT_INTERWAL_SEKUND) return;
      zebrane.odTyku = 0;
      if (ukryta) return;
      void wyslijZebrane();
    }

    const idInterwalu = setInterval(tyk, 1000);
    return () => clearInterval(idInterwalu);
  }, [stan.rodzaj, id, wyslijZebrane]);

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    void wczytaj();
  }

  async function oznaczUkonczona() {
    if (wysylanie) return;
    setWysylanie(true);
    setBladUkonczenia(null);
    const wynik = await ukonczLekcje(id);
    setWysylanie(false);
    if (wynik.status === "ok") {
      setStan((poprzedni) =>
        poprzedni.rodzaj === "ok"
          ? { ...poprzedni, dane: { ...poprzedni.dane, is_completed: true } }
          : poprzedni,
      );
    } else if (wynik.status === "za-malo-czasu") {
      setBladUkonczenia("Obejrzyj więcej materiału, aby ukończyć lekcję.");
    } else {
      setBladUkonczenia("Nie udało się ukończyć lekcji. Spróbuj ponownie.");
    }
  }

  const naglowekStanu = {
    okruszki: [{ etykieta: "Kursy" }, { etykieta: "Lekcja" }],
    tytul: "Lekcja",
    onPowrot: () => router.back(),
  };

  if (stan.rodzaj === "ladowanie") {
    return <LessonTemplate naglowek={naglowekStanu} glowna={<Skeleton wiersze={6} />} wspierajaca={null} />;
  }

  if (stan.rodzaj === "nie-znaleziono") {
    return <LessonTemplate naglowek={naglowekStanu} glowna={<Text>Nie znaleziono lekcji.</Text>} wspierajaca={null} />;
  }

  if (stan.rodzaj === "zablokowany") {
    return (
      <LessonTemplate
        naglowek={naglowekStanu}
        glowna={
          <Notice wariant="warn" tytul="Dostęp zablokowany">
            {stan.komunikat}
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <LessonTemplate
        naglowek={naglowekStanu}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać lekcji"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Backend nie odpowiedział poprawnie — spróbuj ponownie później.
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }

  const { dane, bezNagrania } = stan;
  const procent = procentAktywnegoCzasu(dane);
  const mozeUkonczyc = dane.completable && !dane.is_completed;
  const brakujacyProcent = Math.max(0, dane.completable_at_percent - procent);
  const uklad = ukladGlownej(dane, bezNagrania);

  return (
    <LessonTemplate
      naglowek={{
        okruszki: okruszkiLekcji(dane),
        tytul: dane.title,
        onPowrot: () => router.back(),
      }}
      glowna={
        <div className={style.glowna}>
          {uklad === "odtwarzacz" && (
            <LessonPlayer
              tytul={dane.title}
              tresc={dane.description ?? ""}
              krokiZrobione={dane.is_completed ? 1 : 0}
              krokiRazem={1}
              materialy={[]}
              pytania={[]}
              onZadajPytanie={() => {}}
              onZmianaOdtwarzania={(odtwarzane) => {
                odtwarzaneRef.current = odtwarzane;
              }}
              czasTrwaniaSekund={dane.duration_seconds}
              obejrzaneSekundy={dane.watched_seconds}
              procentAktywnegoCzasu={procent}
              progUkonczenia={dane.completable_at_percent}
              braki={[]}
              bezNagrania={bezNagrania}
              pusty={{
                naglowek: "Lekcja bez treści",
                tresc: "Ta lekcja nie ma jeszcze nagrania ani treści.",
                przycisk: { etykieta: "Wróć do kursu", onClick: () => router.back() },
              }}
            />
          )}
          {uklad === "sama-tresc" && <Heading stopien={2}>{dane.title}</Heading>}
          {uklad === "pusta" && (
            <EmptyState
              naglowek="Lekcja bez treści"
              tresc="Ta lekcja nie ma jeszcze nagrania ani treści."
              przycisk={{ etykieta: "Wróć do kursu", onClick: () => router.back() }}
            />
          )}

          {bladZapisu && (
            <Notice
              wariant="error"
              tytul="Postęp nie został zapisany"
              akcja={
                <Button poziom="outline" onClick={() => void wyslijZebrane()}>
                  Spróbuj ponownie
                </Button>
              }
            >
              Sprawdź połączenie i spróbuj ponownie. Czas oglądania zostanie dopisany przy następnym zapisie.
            </Notice>
          )}

          <div className={style.ukonczenie} role="group" aria-label="Ukończenie lekcji">
            {dane.is_completed ? (
              <Notice wariant="ok" tytul="Lekcja ukończona">
                Ta lekcja jest już ukończona.
              </Notice>
            ) : (
              <>
                {bladUkonczenia && (
                  <Notice wariant="error" tytul="Nie udało się ukończyć lekcji">
                    {bladUkonczenia}
                  </Notice>
                )}
                <Button
                  poziom={mozeUkonczyc ? "primary" : "outline"}
                  disabled={!mozeUkonczyc || wysylanie}
                  onClick={() => void oznaczUkonczona()}
                >
                  {wysylanie ? "Zapisywanie…" : "Oznacz jako ukończoną"}
                </Button>
                {!dane.completable && (
                  <Text wariant="pusty">
                    Brakuje {brakujacyProcent}% aktywnego czasu do progu {dane.completable_at_percent}%.
                  </Text>
                )}
              </>
            )}
          </div>

          {maTekst(dane.content) && (
            <div role="region" aria-label="Treść lekcji">
              <TrescLekcji tresc={dane.content} />
            </div>
          )}
        </div>
      }
      wspierajaca={pliki !== null && pliki.length > 0 ? <PlikiLekcji pliki={pliki} odswiez={odswiezPliki} /> : null}
    />
  );
}
