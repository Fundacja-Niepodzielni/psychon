"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { LessonTemplate } from "@/design-system/szablony/LessonTemplate/LessonTemplate";
import { LessonPlayer } from "@/design-system/organizmy/LessonPlayer/LessonPlayer";
import { pobierzDaneLekcji, procentAktywnegoCzasu, ukonczLekcje, type DaneLekcji } from "./dane";
import style from "./Lekcja.module.css";

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
 * and the lesson itself. `LessonTemplate` + `LessonPlayer` carry the content
 * and the recording frame; the completion button lives at this level
 * because `LessonPlayer` has no callback for it (see note below the fetch).
 *
 * Automatic progress heartbeat (`POST /lessons/{id}/progress`, contract
 * "Postęp lekcji") is not wired here: `LessonPlayer` keeps its play/pause
 * state internally (`odtwarzacz` `useState`) and exposes neither that flag
 * nor an elapsed-time tick to its caller, so nothing outside the organism
 * can know when a recording is playing, paused, or how much time passed.
 * Adding that logic here would mean guessing an event the organism never
 * emits, which the task description calls out as a stopping condition —
 * left out and reported instead of invented.
 */
export function Lekcja({ id }: WlasciwosciLekcja) {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [wysylanie, setWysylanie] = useState(false);
  const [bladUkonczenia, setBladUkonczenia] = useState<string | null>(null);

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

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    void wczytaj();
  }

  async function oznaczUkonczona() {
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

  if (stan.rodzaj === "ladowanie") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Lekcja</Heading>
        <Skeleton wiersze={6} />
      </main>
    );
  }

  if (stan.rodzaj === "nie-znaleziono") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Lekcja</Heading>
        <Text>Nie znaleziono lekcji.</Text>
      </main>
    );
  }

  if (stan.rodzaj === "zablokowany") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Lekcja</Heading>
        <Notice wariant="warn" tytul="Dostęp zablokowany">
          {stan.komunikat}
        </Notice>
      </main>
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Lekcja</Heading>
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
      </main>
    );
  }

  const { dane, bezNagrania } = stan;
  const procent = procentAktywnegoCzasu(dane);
  const mozeUkonczyc = dane.completable && !dane.is_completed;
  const brakujacyProcent = Math.max(0, dane.completable_at_percent - procent);

  return (
    <main id="tresc" className={style.uklad}>
      <LessonTemplate
        naglowek={{
          okruszki: [{ etykieta: "Kurs" }, { etykieta: dane.title }],
          tytul: dane.title,
          onPowrot: () => router.back(),
        }}
        glowna={
          <div className={style.glowna}>
            <LessonPlayer
              tytul={dane.title}
              tresc={dane.description ?? ""}
              krokiZrobione={dane.is_completed ? 1 : 0}
              krokiRazem={1}
              materialy={[]}
              pytania={[]}
              onZadajPytanie={() => {}}
              czasTrwaniaSekund={dane.duration_seconds}
              obejrzaneSekundy={dane.watched_seconds}
              procentAktywnegoCzasu={procent}
              progUkonczenia={dane.completable_at_percent}
              braki={[]}
              bezNagrania={bezNagrania}
              pusty={{
                naglowek: "Lekcja bez treści",
                tresc: "Ta lekcja nie ma jeszcze nagrania ani opisu.",
                przycisk: { etykieta: "Wróć do kursu", onClick: () => router.back() },
              }}
            />

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
                    poziom="outline"
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
          </div>
        }
        wspierajaca={
          <Text wariant="pusty">Ta lekcja nie ma jeszcze materiałów do pobrania w tym widoku.</Text>
        }
      />
    </main>
  );
}
