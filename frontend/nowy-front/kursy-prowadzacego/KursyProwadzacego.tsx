"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { pobierzKursyProwadzacego, type KursProwadzacego } from "./dane";
import { czyBrakUprawnien, komunikatKoperty, wierszeKursow } from "./logika";
import style from "./KursyProwadzacego.module.css";
import { KOMUNIKAT_SERWER } from "@/nowy-front/wspolne/komunikaty";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad"; komunikat?: string }
  | { rodzaj: "dane"; kursy: KursProwadzacego[] };

interface WlasciwosciSzablonu {
  lista: ReactNode;
  onPowrot: () => void;
}

/** Każdy stan ekranu renderuje się w tym samym szablonie — jedyny `main`. */
function Szablon({ lista, onPowrot }: WlasciwosciSzablonu) {
  return (
    <ListTemplate
      naglowek={
        <PageHeader
          okruszki={[{ etykieta: "Prowadzący" }, { etykieta: "Moje kursy" }]}
          tytul="Moje kursy"
          opis="Kursy przypisane do Ciebie."
          onPowrot={onPowrot}
        />
      }
      lista={lista}
    />
  );
}

/**
 * Ekran „Moje kursy” (prowadzący) na szablonie `ListTemplate`. Lista kursów z
 * przypisaniem prowadzącego — `GET /instructor/courses`
 * (`backend/routes/api/h09.php:37`). „Otwórz kurs” w wierszu prowadzi do
 * istniejącej strony kursu prowadzącego (`/prowadzacy/kursy/{id}`).
 * Stany: ładowanie, dane, pusty (kto przypisuje kursy), odmowa z powodu roli
 * (401/403), błąd połączenia — każdy w tym samym szablonie, z jednym `main`.
 */
export function KursyProwadzacego() {
  const router = useRouter();
  const wroc = () => router.back();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);

  useEffect(() => {
    let aktualne = true;
    pobierzKursyProwadzacego()
      .then((kursy) => {
        if (aktualne) setStan({ rodzaj: "dane", kursy });
      })
      .catch((blad: unknown) => {
        if (aktualne) setStan(czyBrakUprawnien(blad) ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad", komunikat: komunikatKoperty(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [proba]);

  function wczytajPonownie() {
    setStan({ rodzaj: "ladowanie" });
    setProba((poprzednia) => poprzednia + 1);
  }

  if (stan.rodzaj === "ladowanie") {
    return (
      <Szablon
        onPowrot={wroc}
        lista={
          <div className={style.szkielet}>
            <Skeleton wiersze={4} />
          </div>
        }
      />
    );
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <Szablon
        onPowrot={wroc}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Kursy prowadzącego"
            rola="prowadzących"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <Szablon
        onPowrot={wroc}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać kursów"
            akcja={
              <Button poziom="outline" onClick={wczytajPonownie}>
                Spróbuj ponownie
              </Button>
            }
          >
            {stan.komunikat ?? KOMUNIKAT_SERWER}
          </Notice>
        }
      />
    );
  }

  return (
    <Szablon
      onPowrot={wroc}
      lista={
        <RecordList
          tytul="Kursy przypisane do Ciebie"
          wiersze={wierszeKursow(stan.kursy)}
          pusty={{
            naglowek: "Nie masz przypisanych kursów",
            tresc: "Kursy przypisuje administracja Fundacji. Gdy dostaniesz pierwszy kurs, pojawi się tutaj.",
            przycisk: { etykieta: "Wróć do pulpitu", onClick: () => router.push("/prowadzacy") },
          }}
        />
      }
    />
  );
}
