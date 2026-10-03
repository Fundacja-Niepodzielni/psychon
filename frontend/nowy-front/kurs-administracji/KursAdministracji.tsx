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
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { pobierzDaneKursuAdministracji } from "@/nowy-front/kurs-publikacja/dane-administracji";
import { DostawcaRoliKursu, useRolaKursu } from "@/nowy-front/rola-kursu/kontekst";
import type { KonfiguracjaRoliKursu, RolaKursu } from "@/nowy-front/rola-kursu/rola";
import { KursTematy, type WynikOdczytuKursu } from "@/nowy-front/kurs-tematy/KursTematy";
import type { LekcjaAdmin } from "@/nowy-front/lekcja-edycja/dane";
import { EkranKursu } from "./EkranKursu";
import style from "./KursAdministracji.module.css";

function okruszki(adresListyKursow: string) {
  return [{ etykieta: "Kursy", href: adresListyKursow }, { etykieta: "Tematy i lekcje" }];
}

interface WlasciwosciKursAdministracji {
  idKursu: string;
  /** Rola ekranu: administracja (domyślnie) albo prowadzący — trasy `/admin/…` albo `/instructor/…`. */
  rola?: RolaKursu;
}

/** Odczyt zakończony odmową albo komplet danych ekranu: kurs, lekcje i tematy. */
type Odczyt =
  | { rodzaj: "odmowa"; wynik: WynikOdczytuKursu }
  | { rodzaj: "gotowy"; kurs: AdminCourse; lekcje: LekcjaAdmin[]; tematy: Topic[] };

async function odczytajKurs(idKursu: string, rola: KonfiguracjaRoliKursu): Promise<Odczyt> {
  const wynik = await pobierzDaneKursuAdministracji(idKursu, rola.dane);
  if (wynik.status !== "ok" && wynik.status !== "pusty") return { rodzaj: "odmowa", wynik };
  try {
    const tematy = await pobierzTematy(rola.rola, wynik.dane.kurs.id);
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
 * Ekran kursu administracji i prowadzącego. Czyta kurs, lekcje i tematy
 * z przeglądarki (trasy `/admin/…` albo `/instructor/…`, zależnie od roli),
 * a potem oddaje je ekranowi w dwóch kolumnach (`EkranKursu`). Stany bez
 * kursu — wczytywanie, wygasła sesja, brak roli, brak kursu, błąd odczytu,
 * kurs usunięty — rysuje tak jak dotąd: wspólnymi stanami ekranu tematów,
 * w szablonie szczegółu.
 */
export function KursAdministracji({ idKursu, rola = "admin" }: WlasciwosciKursAdministracji) {
  return (
    <DostawcaRoliKursu rola={rola}>
      <TrescKursu idKursu={idKursu} />
    </DostawcaRoliKursu>
  );
}

function TrescKursu({ idKursu }: { idKursu: string }) {
  const router = useRouter();
  const rola = useRolaKursu();
  const okruszkiEkranu = okruszki(rola.adresListyKursow);
  const [odczyt, setOdczyt] = useState<Odczyt | null>(null);
  const [proba, setProba] = useState(0);
  const [koniec, setKoniec] = useState<"usuniety" | "nie-znaleziono" | null>(null);

  useEffect(() => {
    let aktualne = true;
    odczytajKurs(idKursu, rola).then((pobrany) => {
      if (aktualne) setOdczyt(pobrany);
    });
    return () => {
      aktualne = false;
    };
  }, [idKursu, proba, rola]);

  if (koniec !== null) {
    return (
      <DetailTemplate
        naglowek={{
          okruszki: okruszkiEkranu,
          tytul: koniec === "usuniety" ? "Kurs usunięty" : `Kurs ${idKursu}`,
          onPowrot: () => router.back(),
        }}
        glowna={
          koniec === "usuniety" ? (
            <div className={style.blok}>
              <Notice wariant="ok" tytul="Kurs został usunięty">
                Postęp uczestników zostaje zachowany.
              </Notice>
              <Text>
                <Link href={rola.adresListyKursow}>Wróć do listy kursów</Link>
              </Text>
            </div>
          ) : (
            <EkranOdmowy
              rodzaj="nie-znaleziono"
              czego="kursu"
              stopien={2}
              przycisk={{ etykieta: "Wróć do listy kursów", onClick: () => router.push(rola.adresListyKursow) }}
            />
          )
        }
        wspierajaca={null}
      />
    );
  }

  if (odczyt === null) {
    return (
      <DetailTemplate
        naglowek={{ okruszki: okruszkiEkranu, tytul: "Wczytywanie kursu", onPowrot: () => router.back() }}
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
        grupa={rola.rola}
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
