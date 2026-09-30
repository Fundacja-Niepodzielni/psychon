"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { TrescLekcji } from "@/design-system/molekuly/TrescLekcji/TrescLekcji";
import { LessonTemplate } from "@/design-system/szablony/LessonTemplate/LessonTemplate";
import { LessonPlayer } from "@/design-system/organizmy/LessonPlayer/LessonPlayer";
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

/** Heartbeat cadence — the upper bound the contract allows ("co <= 30 s").
 * Both increments equal the tick length in seconds: the mock player has no
 * real elapsed-time source, only a play/pause flag, so a full tick counts as
 * fully watched and fully active whenever it fires at all. */
const HEARTBEAT_INTERWAL_MS = 30000;
const HEARTBEAT_INTERWAL_SEKUND = HEARTBEAT_INTERWAL_MS / 1000;

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
 * Progress heartbeat (`POST /lessons/{id}/progress`, contract "Postęp
 * lekcji") ticks on a fixed interval while the lesson is loaded, but only
 * sends when the recording is actually playing and the tab is visible.
 * "Playing" comes from `LessonPlayer`'s `onZmianaOdtwarzania` callback
 * (`design-system/organizmy/LessonPlayer/LessonPlayer.tsx`, play/pause
 * button handler) into a ref read at tick time; "visible" is read straight
 * off `document.hidden` at the same moment, so a tab hidden between ticks
 * is caught without a separate listener.
 */
export function Lekcja({ id }: WlasciwosciLekcja) {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [wysylanie, setWysylanie] = useState(false);
  const [bladUkonczenia, setBladUkonczenia] = useState<string | null>(null);
  const odtwarzaneRef = useRef(false);

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
    if (stan.rodzaj !== "ok") return undefined;
    // `LessonPlayer` always mounts with its internal `odtwarzane` at `false`.
    odtwarzaneRef.current = false;

    function wyslijHeartbeat() {
      if (!odtwarzaneRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void wyslijPostep(id, {
        watched_delta: HEARTBEAT_INTERWAL_SEKUND,
        active_delta: HEARTBEAT_INTERWAL_SEKUND,
      });
    }

    const idInterwalu = setInterval(wyslijHeartbeat, HEARTBEAT_INTERWAL_MS);
    return () => clearInterval(idInterwalu);
  }, [stan.rodzaj, id]);

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
      wspierajaca={
        <Text wariant="pusty">Ta lekcja nie ma jeszcze materiałów do pobrania w tym widoku.</Text>
      }
    />
  );
}
