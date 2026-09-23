"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import PageTemplate from "@/components/templates/PageTemplate";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { fetchInstructorQuestions, unansweredCount } from "@/lib/questions";
import type { InstructorGroup, InstructorSlot } from "@/lib/h12/types";

/**
 * Pierwszy ekran prowadzącego po zalogowaniu (`lib/home-by-role.ts`).
 * Trzy liczby, każda z odnośnikiem do ekranu, na którym się z nią coś robi.
 *
 * Liczby czytane są WYŁĄCZNIE z tras, które już działają: `/instructor/group`
 * (skład grupy i terminy superwizji) oraz `/instructor/questions?answered=false`
 * (skrzynka pytań — liczba bez odpowiedzi przychodzi w `meta.extra`, więc jest
 * niezależna od strony i od filtra).
 *
 * Każdy kafelek ma cztery stany i nigdy ich nie miesza: wczytywanie, awaria
 * z ponowieniem, pustka i liczba. Stan wczytywania NIE twierdzi niczego —
 * w szczególności nie pokazuje zera ani słowa „brak”, bo przed odpowiedzią
 * serwera nie wiadomo, czy liczba jest zerem, czy trzydziestką. Widać wtedy
 * pasek szkieletu, a czytnik ekranu dostaje krótkie „Wczytuję…”.
 */
type Zasob<T> =
  | { stan: "wczytywanie" }
  | { stan: "awaria" }
  | { stan: "gotowe"; dane: T };

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2 self-start text-small font-medium " +
  "text-accent transition-colors duration-200 hover:text-accent-dark focus-visible:focus-ring";

/**
 * Najbliższy termin jeszcze przed nami. Terminy minione nie są „najbliższe” —
 * po nich kafelek ma pokazać pustkę, a nie datę sprzed miesiąca.
 */
export function najblizszyTermin(
  slots: InstructorSlot[],
  teraz: Date = new Date(),
): InstructorSlot | null {
  return (
    [...slots]
      .filter((slot) => new Date(slot.starts_at).getTime() > teraz.getTime())
      .sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )[0] ?? null
  );
}

interface KafelekProps<T> {
  tytul: string;
  zasob: Zasob<T>;
  /** Treść, gdy dane są już znane i NIE są puste. */
  gdyDane: (dane: T) => ReactNode;
  /** Czy odpowiedź serwera jest prawdziwa, ale pusta. */
  czyPusto: (dane: T) => boolean;
  /** Zdanie na stan pusty — mówi o pustce, a nie o błędzie. */
  tekstPustki: string;
  /** Adres ekranu, na którym z tą liczbą można coś zrobić. */
  href: string;
  etykietaOdnosnika: string;
  onPonow: () => void;
}

function Kafelek<T>({
  tytul,
  zasob,
  gdyDane,
  czyPusto,
  tekstPustki,
  href,
  etykietaOdnosnika,
  onPonow,
}: KafelekProps<T>) {
  return (
    <Card title={tytul} className="flex flex-col gap-3">
      <div aria-live="polite" className="min-h-20">
        {zasob.stan === "wczytywanie" ? (
          <div role="status" aria-label="Wczytuję…">
            <span className="sr-only">Wczytuję…</span>
            <Skeleton lines={1} className="max-w-40" />
          </div>
        ) : zasob.stan === "awaria" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-small text-muted">
              Nie udało się wczytać tej liczby — spróbuj ponownie za chwilę.
            </p>
            <Button type="button" variant="secondary" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          </div>
        ) : czyPusto(zasob.dane) ? (
          <p className="text-body text-muted">{tekstPustki}</p>
        ) : (
          gdyDane(zasob.dane)
        )}
      </div>
      <Link href={href} className={LINK_CLASS}>
        {etykietaOdnosnika}
      </Link>
    </Card>
  );
}

function Liczba({ wartosc, opis }: { wartosc: number; opis: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-h2 font-black text-ink">{wartosc}</span>
      <span className="text-small text-muted">{opis}</span>
    </p>
  );
}

export default function InstructorStart() {
  const [grupa, setGrupa] = useState<Zasob<InstructorGroup>>({ stan: "wczytywanie" });
  const [pytania, setPytania] = useState<Zasob<number>>({ stan: "wczytywanie" });
  const [probaGrupy, setProbaGrupy] = useState(0);
  const [probaPytan, setProbaPytan] = useState(0);

  useEffect(() => {
    let aktualne = true;

    api<InstructorGroup>("/instructor/group").then(
      (dane) => {
        if (aktualne) setGrupa({ stan: "gotowe", dane });
      },
      () => {
        if (aktualne) setGrupa({ stan: "awaria" });
      },
    );

    return () => {
      aktualne = false;
    };
  }, [probaGrupy]);

  useEffect(() => {
    let aktualne = true;

    fetchInstructorQuestions({ answered: false }).then(
      ({ meta }) => {
        if (aktualne) setPytania({ stan: "gotowe", dane: unansweredCount(meta) });
      },
      () => {
        if (aktualne) setPytania({ stan: "awaria" });
      },
    );

    return () => {
      aktualne = false;
    };
  }, [probaPytan]);

  // Powrót do stanu wczytywania robi kliknięcie, a nie efekt: dopóki nowa
  // odpowiedź nie wróci, kafelek znów nie twierdzi nic.
  const ponowGrupe = useCallback(() => {
    setGrupa({ stan: "wczytywanie" });
    setProbaGrupy((n) => n + 1);
  }, []);

  const ponowPytania = useCallback(() => {
    setPytania({ stan: "wczytywanie" });
    setProbaPytan((n) => n + 1);
  }, []);

  return (
    <PageTemplate
      naglowek={{
        title: "Panel prowadzącego",
        description: "Skrót do tego, co dziś wymaga Twojej uwagi.",
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Kafelek
          tytul="Moja grupa"
          zasob={grupa}
          czyPusto={(dane) => dane.members.length === 0}
          gdyDane={(dane) => (
            <Liczba
              wartosc={dane.members.length}
              opis={dane.members.length === 1 ? "osoba w grupie" : "osób w grupie"}
            />
          )}
          tekstPustki="Nie masz jeszcze przypisanych uczestników."
          href="/prowadzacy/grupa"
          etykietaOdnosnika="Zobacz postępy grupy"
          onPonow={ponowGrupe}
        />

        <Kafelek
          tytul="Pytania bez odpowiedzi"
          zasob={pytania}
          czyPusto={(liczba) => liczba === 0}
          gdyDane={(liczba) => (
            <Liczba
              wartosc={liczba}
              opis={liczba === 1 ? "pytanie czeka" : "pytań czeka"}
            />
          )}
          tekstPustki="Nie ma pytań bez odpowiedzi."
          href="/prowadzacy/pytania"
          etykietaOdnosnika="Przejdź do skrzynki pytań"
          onPonow={ponowPytania}
        />

        <Kafelek
          tytul="Najbliższa superwizja"
          zasob={grupa}
          czyPusto={(dane) => najblizszyTermin(dane.slots) === null}
          gdyDane={(dane) => {
            const termin = najblizszyTermin(dane.slots);
            if (termin === null) return null;
            return (
              <p className="flex flex-col gap-1">
                <span className="text-h4 font-bold text-ink">
                  {dateFormatter.format(new Date(termin.starts_at))}
                </span>
                <span className="text-small text-muted">
                  {termin.active_signups_count} z {termin.seats_limit} miejsc zajętych
                </span>
              </p>
            );
          }}
          tekstPustki="Nie masz zaplanowanych terminów."
          href="/prowadzacy/grupa"
          etykietaOdnosnika="Zaplanuj termin"
          onPonow={ponowGrupe}
        />
      </div>
    </PageTemplate>
  );
}
