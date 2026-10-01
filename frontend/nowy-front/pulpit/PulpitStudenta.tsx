"use client";

import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { KartaNastepnegoKroku } from "@/design-system/molekuly/KartaNastepnegoKroku/KartaNastepnegoKroku";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { odmien } from "../wspolne/odmiana";
import { pobierzKursy, pobierzSzczegolKursu, type KursSciezki, type LekcjaKursu } from "./dane";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { ListaKursow } from "./ListaKursow";
import { rodzajBledu } from "./rodzaj-bledu";
import { kursDoWznowienia, wyliczWznowienie } from "./wznow-lekcje";

type StanEkranu = StanBezDanych | "ok";
type LekcjeKursu = { stan: "ladowanie" } | { stan: "blad" } | { stan: "ok"; dane: LekcjaKursu[] };

/** Adres kontaktowy fundacji — ten sam co na stronach „Dostęp wygasł” i
 * „Deklaracja dostępności”. */
export const ADRES_KONTAKTOWY = "kontakt@niepodzielni.com";

/** Mianownik kafla „Ukończone kursy” po „z” (dopełniacz): 1 kursu · 2 kursów · 5 kursów · 12 kursów · 22 kursów
 * (słownik 2.1 §6, pomocnik `odmien`). */
export function mianownikKursow(liczba: number): string {
  return `z ${liczba} ${odmien(liczba, "kursu", "kursów", "kursów")}`;
}

/**
 * Pulpit kursów studenta (U-02), wybierany przez `Pulpit` po roli z
 * `GET /me`. Stara trasa produktu: `app/(uczestnik)/panel/pulpit/page.tsx`
 * (montuje `components/pulpit/PulpitDashboard`); przełączenia ten ekran nie
 * robi.
 *
 * Krytyczne: `GET /courses` (`backend/routes/api/h05.php:23`). Szczegóły
 * kursu w toku (`GET /courses/{slug}`, `h05.php:24`) ładują się osobno —
 * ich błąd pokazuje `Notice` w bloku „Wznów naukę”, a reszta pulpitu działa.
 * Ekran niczego nie zapisuje, więc nie ma stanu „po zapisie”.
 */
export function PulpitStudenta() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [kursy, setKursy] = useState<KursSciezki[]>([]);
  const [lekcje, setLekcje] = useState<LekcjeKursu>({ stan: "ladowanie" });

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    pobierzKursy()
      .then((lista) => {
        if (straz?.anulowane) return;
        setKursy(lista);
        setStan("ok");

        const wToku = kursDoWznowienia(lista);
        if (!wToku) {
          setLekcje({ stan: "ok", dane: [] });
          return;
        }
        setLekcje({ stan: "ladowanie" });
        pobierzSzczegolKursu(wToku.slug)
          .then((szczegol) => !straz?.anulowane && setLekcje({ stan: "ok", dane: szczegol.lessons }))
          .catch(() => !straz?.anulowane && setLekcje({ stan: "blad" }));
      })
      .catch((wyjatek: unknown) => {
        if (straz?.anulowane) return;
        setStan(rodzajBledu(wyjatek));
      });
  }, []);

  const ponow = useCallback(() => {
    setStan("ladowanie");
    wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  if (stan !== "ok") {
    return <EkranStanu stan={stan} onPonow={ponow} />;
  }

  const ukonczone = kursy.filter((kurs) => kurs.status === "completed").length;
  const wToku = kursDoWznowienia(kursy);
  const maKursy = kursy.length > 0;

  const kafle: ComponentProps<typeof StatRow>["kafle"] | undefined = maKursy
    ? [
        {
          id: "pulpit-studenta-ukonczone",
          etykieta: "Ukończone kursy",
          wartosc: ukonczone,
          mianownik: mianownikKursow(kursy.length),
          procent: Math.round((ukonczone / kursy.length) * 100),
          dominujacy: true,
          ukladPulpitu: true,
        },
        {
          id: "pulpit-studenta-biezacy",
          etykieta: "Bieżący kurs",
          wartosc: wToku?.progress_percent,
          mianownik: "% ukończone",
          procent: wToku?.progress_percent,
          podpowiedz: wToku?.title,
          ukladPulpitu: true,
        },
      ]
    : undefined;

  return (
    <DashboardTemplate
      naglowek={{
        okruszki: [{ etykieta: "Pulpit" }],
        tytul: "Pulpit",
        opis: "Wróć do swojego kursu i zobacz wszystkie kursy.",
        onPowrot: () => router.back(),
        przyciskGlowny: maKursy ? przyciskWznowienia(kursy, lekcje, (href) => router.push(href)) : undefined,
      }}
      nastepnyKrok={maKursy ? <BlokWznowienia kursy={kursy} lekcje={lekcje} /> : undefined}
      kafle={kafle}
      glowna={
        <ListaKursow
          tytul="Twoje kursy"
          kursy={kursy}
          podpowiedz={(kurs) => `${kurs.progress_percent}% ukończone`}
          pusty={{
            naglowek: "Nie masz jeszcze żadnego kursu",
            tresc: `Kursy pojawią się tutaj, gdy zostaniesz na nie zaproszona lub zaproszony. Masz pytanie? Napisz do nas: ${ADRES_KONTAKTOWY}.`,
            przycisk: { etykieta: "Odśwież", onClick: ponow },
          }}
        />
      }
      wspierajaca={
        <section aria-label="Kontakt">
          <Heading stopien={3}>Masz pytanie?</Heading>
          <Text>Jeśli czegoś brakuje albo coś nie działa, napisz do nas.</Text>
          <Link href={`mailto:${ADRES_KONTAKTOWY}`}>{ADRES_KONTAKTOWY}</Link>
        </section>
      }
    />
  );
}

/**
 * Przycisk główny wznowienia nauki stoi w nagłówku strony (makieta 2.0.4,
 * `.head .acts`), a blok „Wznów naukę” niesie tylko opis. Ładowanie
 * szczegółów kursu i brak kursu do wznowienia = brak przycisku.
 */
function przyciskWznowienia(
  kursy: KursSciezki[],
  lekcje: LekcjeKursu,
  naPrzejdz: (href: string) => void,
): { etykieta: string; onKliknij: () => void } | undefined {
  const wToku = kursDoWznowienia(kursy);
  if (wToku && lekcje.stan === "ladowanie") return undefined;
  if (wToku && lekcje.stan === "blad") {
    return { etykieta: "Otwórz kurs", onKliknij: () => naPrzejdz(`/panel/kursy/${wToku.slug}`) };
  }
  const wznowienie = wyliczWznowienie(kursy, lekcje.stan === "ok" ? lekcje.dane : []);
  if (wznowienie.rodzaj === "lekcja") {
    return { etykieta: "Wznów lekcję", onKliknij: () => naPrzejdz(`/panel/lekcje/${wznowienie.lekcja.id}`) };
  }
  if (wznowienie.rodzaj === "kurs") {
    return { etykieta: "Otwórz kurs", onKliknij: () => naPrzejdz(`/panel/kursy/${wznowienie.kurs.slug}`) };
  }
  return undefined;
}

const ETYKIETA_KROKU = "Następny krok";

function BlokWznowienia({ kursy, lekcje }: { kursy: KursSciezki[]; lekcje: LekcjeKursu }) {
  const wToku = kursDoWznowienia(kursy);

  if (wToku && lekcje.stan === "ladowanie") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU}>
        <Skeleton wiersze={2} />
      </KartaNastepnegoKroku>
    );
  }

  if (wToku && lekcje.stan === "blad") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek={wToku.title}>
        <Notice wariant="warn" tytul="Szczegóły kursu niedostępne">
          Nie udało się ustalić dokładnej lekcji — możesz otworzyć kurs.
        </Notice>
      </KartaNastepnegoKroku>
    );
  }

  const wznowienie = wyliczWznowienie(kursy, lekcje.stan === "ok" ? lekcje.dane : []);

  if (wznowienie.rodzaj === "lekcja") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek={wznowienie.lekcja.title}>
        <Text>Kurs „{wznowienie.kurs.title}”.</Text>
      </KartaNastepnegoKroku>
    );
  }

  if (wznowienie.rodzaj === "kurs") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek={wznowienie.kurs.title}>
        <Text>W kursie „{wznowienie.kurs.title}” masz już za sobą wszystkie lekcje.</Text>
      </KartaNastepnegoKroku>
    );
  }

  if (wznowienie.rodzaj === "wszystko-ukonczone") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek="Ukończone kursy">
        <Text>Wszystkie Twoje kursy są ukończone. Dobra robota.</Text>
      </KartaNastepnegoKroku>
    );
  }

  return (
    <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek="Brak kursu w toku">
      <Text wariant="pusty">Gdy któryś kurs będzie w toku, pojawi się tutaj lekcja do wznowienia.</Text>
    </KartaNastepnegoKroku>
  );
}
