"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/klient";
import { pobierzTematy, type Topic } from "@/lib/api/h08-tematy";
import type { AdminCourse } from "@/lib/h08/types";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { pobierzDaneKursuAdministracji } from "@/nowy-front/kurs-publikacja/dane-administracji";
import { KursTematy, type WynikOdczytuKursu } from "@/nowy-front/kurs-tematy/KursTematy";
import type { LekcjaAdmin } from "@/nowy-front/lekcja-edycja/dane";
import { EkranKursu } from "./EkranKursu";
import style from "./KursAdministracji.module.css";

const ADRES_LISTY_KURSOW = "/admin/kursy";
const OKRUSZKI = [{ etykieta: "Kursy", href: ADRES_LISTY_KURSOW }, { etykieta: "Tematy i lekcje" }];

interface WlasciwosciKursAdministracji {
  idKursu: string;
}

/** Odczyt zakończony odmową albo komplet danych ekranu: kurs, lekcje i tematy. */
type Odczyt =
  | { rodzaj: "odmowa"; wynik: WynikOdczytuKursu }
  | { rodzaj: "gotowy"; kurs: AdminCourse; lekcje: LekcjaAdmin[]; tematy: Topic[] };

async function odczytajKurs(idKursu: string): Promise<Odczyt> {
  const wynik = await pobierzDaneKursuAdministracji(idKursu);
  if (wynik.status !== "ok" && wynik.status !== "pusty") return { rodzaj: "odmowa", wynik };
  try {
    const tematy = await pobierzTematy("admin", wynik.dane.kurs.id);
    return { rodzaj: "gotowy", kurs: wynik.dane.kurs, lekcje: wynik.dane.lekcje as LekcjaAdmin[], tematy };
  } catch (blad) {
    // Te same trzy odmowy i te same stany co przy odczycie kursu.
    if (blad instanceof ApiError && blad.status === 401) return { rodzaj: "odmowa", wynik: { status: "brak-sesji" } };
    if (blad instanceof ApiError && blad.status === 403) return { rodzaj: "odmowa", wynik: { status: "brak-uprawnien" } };
    if (blad instanceof ApiError && blad.status === 404) return { rodzaj: "odmowa", wynik: { status: "nie-znaleziono" } };
    return { rodzaj: "odmowa", wynik: { status: "blad" } };
  }
}

/**
 * Ekran kursu administracji. Czyta kurs, lekcje i tematy z przeglądarki
 * (trasy `/admin/…`), a potem oddaje je ekranowi w dwóch kolumnach
 * (`EkranKursu`). Stany bez kursu — wczytywanie, wygasła sesja, brak roli,
 * brak kursu, błąd odczytu, kurs usunięty — rysuje tak jak dotąd: wspólnymi
 * stanami ekranu tematów, w szablonie szczegółu.
 */
export function KursAdministracji({ idKursu }: WlasciwosciKursAdministracji) {
  const router = useRouter();
  const [odczyt, setOdczyt] = useState<Odczyt | null>(null);
  const [proba, setProba] = useState(0);
  const [koniec, setKoniec] = useState<"usuniety" | "nie-znaleziono" | null>(null);

  useEffect(() => {
    let aktualne = true;
    odczytajKurs(idKursu).then((pobrany) => {
      if (aktualne) setOdczyt(pobrany);
    });
    return () => {
      aktualne = false;
    };
  }, [idKursu, proba]);

  if (koniec !== null) {
    return (
      <DetailTemplate
        naglowek={{
          okruszki: OKRUSZKI,
          tytul: koniec === "usuniety" ? "Kurs usunięty" : `Kurs ${idKursu}`,
          onPowrot: () => router.back(),
        }}
        glowna={
          <div className={style.blok}>
            {koniec === "usuniety" ? (
              <Notice wariant="ok" tytul="Kurs został usunięty">
                Postęp uczestników zostaje zachowany.
              </Notice>
            ) : (
              <Notice wariant="warn" tytul="Nie znaleziono kursu">
                Kurs nie istnieje albo został usunięty.
              </Notice>
            )}
            <Text>
              <Link href={ADRES_LISTY_KURSOW}>Wróć do listy kursów</Link>
            </Text>
          </div>
        }
        wspierajaca={null}
      />
    );
  }

  if (odczyt === null) {
    return (
      <DetailTemplate
        naglowek={{ okruszki: OKRUSZKI, tytul: "Wczytywanie kursu", onPowrot: () => router.back() }}
        glowna={
          <div aria-busy="true">
            <Skeleton wiersze={6} />
          </div>
        }
        wspierajaca={<Skeleton wiersze={3} />}
      />
    );
  }

  if (odczyt.rodzaj === "odmowa") {
    return (
      <KursTematy
        grupa="admin"
        idKursu={idKursu}
        wynik={odczyt.wynik}
        onPonow={() => {
          setOdczyt(null);
          setProba((poprzednia) => poprzednia + 1);
        }}
      />
    );
  }

  return (
    <EkranKursu
      key={proba}
      idKursu={idKursu}
      kursPoczatkowy={odczyt.kurs}
      lekcjePoczatkowe={odczyt.lekcje}
      tematyPoczatkowe={odczyt.tematy}
      onKoniec={setKoniec}
    />
  );
}
