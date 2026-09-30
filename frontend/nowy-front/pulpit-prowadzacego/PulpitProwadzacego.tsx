"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import {
  ADRES_PYTAN,
  awariaSieciowa,
  formatujTermin,
  nadchodzaceTerminy,
  odmien,
  pobierzPulpit,
  wybierzWidok,
  zbudujKafle,
  type DanePulpitu,
} from "./dane";
import { SekcjaGrupy, SekcjaKursow, SekcjaPytan, SekcjaSuperwizji } from "./sekcje";
import style from "./PulpitProwadzacego.module.css";

const ID_POWODU_BRAKU_PYTAN = "pulpit-powod-brak-pytan";

/**
 * Ekran „Pulpit prowadzącego” na szablonie `DashboardTemplate`.
 * Stany: ładowanie, dane (także częściowa awaria jednej z trzech tras —
 * sekcja z błędem to `Notice`, pozostałe zostają), pusty „Nie masz dziś nic do
 * zrobienia”, 403 i błąd sieci. Ekran niczego nie zapisuje.
 * Jedyny przycisk główny „Odpowiedz na pytania” prowadzi do istniejącej
 * skrzynki pytań (`/prowadzacy/pytania`); przy zerze pytań jest nieaktywny
 * i ma obok podany powód — atom `Button` nie pozwala wyłączyć poziomu
 * `primary`, więc w tym stanie to poziom `outline`.
 */
export function PulpitProwadzacego() {
  const router = useRouter();
  const [dane, setDane] = useState<DanePulpitu | null>(null);
  const [proba, setProba] = useState(0);

  useEffect(() => {
    let aktualne = true;
    void pobierzPulpit().then((wynik) => {
      if (aktualne) setDane(wynik);
    });
    return () => {
      aktualne = false;
    };
  }, [proba]);

  function odswiez() {
    setDane(null);
    setProba((numer) => numer + 1);
  }

  const teraz = new Date();
  const widok = dane === null ? "ladowanie" : wybierzWidok(dane, teraz);
  const okruszki = [{ etykieta: "Prowadzący" }, { etykieta: "Pulpit" }];
  const onPowrot = () => router.back();

  if (dane === null) {
    return (
      <DashboardTemplate
        naglowek={{ okruszki, tytul: "Pulpit prowadzącego", onPowrot }}
        glowna={<Skeleton wiersze={5} />}
        wspierajaca={<Skeleton wiersze={3} />}
      />
    );
  }

  if (widok === "zakazany") {
    return (
      <DashboardTemplate
        naglowek={{ okruszki, tytul: "Pulpit prowadzącego", onPowrot }}
        glowna={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Pulpit dla prowadzących"
            rola="prowadzących"
            przycisk={{ etykieta: "Wróć", onClick: onPowrot }}
          />
        }
        wspierajaca={null}
      />
    );
  }

  if (widok === "awaria") {
    return (
      <DashboardTemplate
        naglowek={{ okruszki, tytul: "Pulpit prowadzącego", onPowrot }}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać pulpitu"
            akcja={
              <Button poziom="outline" onClick={odswiez}>
                Spróbuj ponownie
              </Button>
            }
          >
            {awariaSieciowa(dane)
              ? "Brak połączenia z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."
              : "Serwer nie odpowiedział poprawnie. Spróbuj ponownie za chwilę."}
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }

  const liczbaPytan = dane.pytania.stan === "ok" ? dane.pytania.dane.liczba : null;
  const terminy = dane.grupa.stan === "ok" ? nadchodzaceTerminy(dane.grupa.dane.slots, teraz) : [];

  // Przycisk główny stoi w nagłówku (makieta 2.0.4, `.head .acts`). Bez pytań
  // zostaje pod nagłówkiem, jak dotąd: nieaktywny `outline` z powodem obok.
  const przyciskGlowny =
    liczbaPytan !== null && liczbaPytan > 0
      ? { etykieta: "Odpowiedz na pytania", onKliknij: () => router.push(ADRES_PYTAN) }
      : undefined;

  const akcjaGlowna: ReactNode =
    liczbaPytan === null || liczbaPytan > 0 ? null : (
      <div className={style.akcja}>
        <Button poziom="outline" disabled aria-describedby={ID_POWODU_BRAKU_PYTAN}>
          Odpowiedz na pytania
        </Button>
        <Hint id={ID_POWODU_BRAKU_PYTAN}>Nie ma pytań bez odpowiedzi.</Hint>
      </div>
    );

  const nastepnyKrok =
    widok === "pusty" || (liczbaPytan === null && terminy.length === 0) ? undefined : (
      <>
        {liczbaPytan !== null && liczbaPytan > 0 && (
          <section className={style.krok}>
            <Heading stopien={2}>{`${liczbaPytan} ${odmien(liczbaPytan, "pytanie czeka", "pytania czekają", "pytań czeka")} na odpowiedź`}</Heading>
            <Text>Uczestnik dostaje powiadomienie, gdy odpowiesz.</Text>
          </section>
        )}
        {terminy.length > 0 && (
          <section className={style.krok}>
            <Heading stopien={2}>{`Najbliższa superwizja: ${formatujTermin(terminy[0].starts_at)}`}</Heading>
            <Text>{`Zajęte miejsca: ${terminy[0].active_signups_count} z ${terminy[0].seats_limit}.`}</Text>
          </section>
        )}
      </>
    );

  const glowna =
    widok === "pusty" ? (
      <EmptyState
        naglowek="Nie masz dziś nic do zrobienia"
        tresc="Nie ma pytań bez odpowiedzi ani nadchodzących terminów superwizji. Nowe pytania pojawią się tu same."
        przycisk={{ etykieta: "Odśwież pulpit", onClick: odswiez }}
      />
    ) : (
      <div className={style.sekcje}>
        <SekcjaPytan sekcja={dane.pytania} onOdswiez={odswiez} stopien={2} />
        <SekcjaSuperwizji sekcja={dane.grupa} teraz={teraz} onOdswiez={odswiez} stopien={2} />
      </div>
    );

  return (
    <DashboardTemplate
      naglowek={{
        okruszki,
        tytul: "Pulpit prowadzącego",
        onPowrot,
        przyciskGlowny,
        dzieci: akcjaGlowna,
      }}
      nastepnyKrok={nastepnyKrok}
      kafle={zbudujKafle(dane)}
      glowna={glowna}
      wspierajaca={
        <div className={style.sekcje}>
          <SekcjaGrupy sekcja={dane.grupa} onOdswiez={odswiez} />
          <SekcjaKursow sekcja={dane.kursy} onOdswiez={odswiez} />
        </div>
      }
    />
  );
}
