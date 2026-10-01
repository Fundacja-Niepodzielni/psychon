"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCourse } from "@/lib/h08/types";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { pobierzDaneKursuAdministracji } from "@/nowy-front/kurs-publikacja/dane-administracji";
import { EdycjaLekcjiPrzyWierszu } from "@/nowy-front/lekcja-edycja/LekcjaEdycja";
import { KursTematy, type WynikOdczytuKursu } from "@/nowy-front/kurs-tematy/KursTematy";
import { UsuniecieKursu } from "@/nowy-front/publikacja-kursu/UsuniecieKursu";
import { kursPozaKolejnoscia } from "@/nowy-front/zaproszenia-kursu/dane";
import { SekcjaZaproszenKursu } from "@/nowy-front/zaproszenia-kursu/ZaproszeniaKursu";
import { BankPytanKursu, MaterialyKursu, PrzypisaniaKursu } from "./SekcjeKursu";
import style from "./KursAdministracji.module.css";

const ADRES_LISTY_KURSOW = "/admin/kursy";
const OKRUSZKI = [{ etykieta: "Kursy", href: ADRES_LISTY_KURSOW }, { etykieta: "Tematy i lekcje" }];

/**
 * Adres ekranu lekcji (treść, nagranie, materiały) w panelu, z kursem
 * w ścieżce. `null`, dopóki grupa ekranu lekcji jest wyłączona: odnośnika
 * „Materiały i nagranie” nie ma wtedy w formularzu przy wierszu.
 */
function adresEkranuLekcji(idLekcji: number, idKursu: string): string | null {
  if (!czyNowaTrasaDostepna(GRUPY.edycjaLekcji)) return null;
  return `/admin/kursy/${idKursu}/lekcje/${idLekcji}`;
}

interface WlasciwosciKursAdministracji {
  idKursu: string;
}

/**
 * Ekran kursu administracji — A-12 „Kurs: tematy i lekcje” z publikacją A-14
 * na jednej stronie. Składa istniejące sekcje, żadnej akcji nie powtarza:
 *  - nagłówek z jedną akcją główną „Opublikuj kurs” oraz tematy, lekcje i dane
 *    kursu — `KursTematy` z grupą tras administracji;
 *  - edycja lekcji — formularz „Edycji lekcji” pod wierszem lekcji (A-13),
 *    z tą samą funkcją zapisu co ekran lekcji, usunięciem lekcji i odnośnikiem
 *    „Materiały i nagranie” do ekranu lekcji;
 *  - materiały kursu, prowadzący kursu i wejście do banku pytań — sekcje
 *    z `SekcjeKursu.tsx`, pod zaproszeniami;
 *  - zaproszenia na kurs — rdzeń ekranu „Zaproszenia na kurs” jako sekcja
 *    pod drzewem tematów, otwierana przyciskiem drugorzędnym;
 *  - „Usuń kurs” — blok z ekranu „Publikacja kursu”, ostatni na stronie.
 * Kurs i lekcje czyta z przeglądarki `pobierzDaneKursuAdministracji`.
 */
export function KursAdministracji({ idKursu }: WlasciwosciKursAdministracji) {
  const router = useRouter();
  const [wynik, setWynik] = useState<WynikOdczytuKursu | null>(null);
  const [proba, setProba] = useState(0);
  const [koniec, setKoniec] = useState<"usuniety" | "nie-znaleziono" | null>(null);

  useEffect(() => {
    let aktualne = true;
    pobierzDaneKursuAdministracji(idKursu).then((pobrany) => {
      if (aktualne) setWynik(pobrany);
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

  if (wynik === null) {
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

  return (
    <KursTematy
      grupa="admin"
      idKursu={idKursu}
      wynik={wynik}
      onPonow={() => {
        setWynik(null);
        setProba((poprzednia) => poprzednia + 1);
      }}
      podDrzewem={(kurs, lekcje) => (
        <>
          <BlokZaproszen kurs={kurs} />
          <MaterialyKursu kurs={kurs} />
          <PrzypisaniaKursu kurs={kurs} lekcje={lekcje} />
          <BankPytanKursu kurs={kurs} />
        </>
      )}
      edycjaLekcji={(idLekcji, akcje) => (
        <EdycjaLekcjiPrzyWierszu
          key={idLekcji}
          idLekcji={idLekcji}
          idKursu={Number(idKursu)}
          onZamknij={akcje.zamknij}
          onZapisano={akcje.zapisano}
          wiersz={{
            onZmieniono: akcje.zmieniono,
            wstrzymany: akcje.wstrzymany,
            adresMaterialow: adresEkranuLekcji(idLekcji, idKursu),
            onPrzejdz: akcje.przejdz,
            onUsunieto: akcje.usunieto,
          }}
        />
      )}
      ostatniBlok={(kurs) => (
        <UsuniecieKursu
          idKursu={idKursu}
          tytulKursu={kurs.title}
          onUsunieto={() => setKoniec("usuniety")}
          onNieZnaleziono={() => setKoniec("nie-znaleziono")}
        />
      )}
    />
  );
}

/**
 * Zaproszenia jako blok ekranu kursu. Formularz otwiera przycisk drugorzędny,
 * więc dopóki osoba go nie otworzy, jedynym przyciskiem głównym ekranu jest
 * „Opublikuj kurs”. Kurs z miejscem w kolejności programu nie przyjmuje
 * zaproszeń — blok mówi to od razu, bez przycisku, który nic by nie dał.
 */
function BlokZaproszen({ kurs }: { kurs: AdminCourse }) {
  const baza = useId();
  const [otwarty, setOtwarty] = useState(false);
  const fokusNaPrzycisk = useRef(false);

  useEffect(() => {
    if (otwarty || !fokusNaPrzycisk.current) return;
    fokusNaPrzycisk.current = false;
    document.getElementById(`${baza}-otworz`)?.focus();
  }, [otwarty, baza]);

  const pozaKolejnoscia = kursPozaKolejnoscia(kurs);

  return (
    <section id="zaproszenia" className={style.blok} aria-labelledby={`${baza}-tytul`}>
      <Heading stopien={2} id={`${baza}-tytul`}>
        Zaproszenia na kurs
      </Heading>
      {!pozaKolejnoscia || otwarty ? (
        <SekcjaZaproszenKursu
          kurs={kurs}
          onZamknij={() => {
            fokusNaPrzycisk.current = true;
            setOtwarty(false);
          }}
        />
      ) : (
        <>
          <Text>Zaproś osoby spoza kolejności kursów programu. Dostaną powiadomienie w panelu i e-mail.</Text>
          <div>
            <Button id={`${baza}-otworz`} poziom="outline" onClick={() => setOtwarty(true)}>
              Zaproś osoby
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
