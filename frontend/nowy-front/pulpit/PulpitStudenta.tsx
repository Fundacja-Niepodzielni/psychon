"use client";

import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { pobierzKursy, pobierzSzczegolKursu, type KursSciezki, type LekcjaKursu } from "./dane";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { rodzajBledu } from "./rodzaj-bledu";
import { kursDoWznowienia, wyliczWznowienie } from "./wznow-lekcje";

type StanEkranu = StanBezDanych | "ok";
type LekcjeKursu = { stan: "ladowanie" } | { stan: "blad" } | { stan: "ok"; dane: LekcjaKursu[] };

/** Adres kontaktowy fundacji — ten sam co na stronach „Dostęp wygasł” i
 * „Deklaracja dostępności”. */
export const ADRES_KONTAKTOWY = "kontakt@niepodzielni.com";

const ETYKIETA_STATUSU: Record<KursSciezki["status"], { wariant: "neutral" | "ok" | "pending"; tekst: string }> = {
  locked: { wariant: "neutral", tekst: "Zablokowany" },
  in_progress: { wariant: "pending", tekst: "W toku" },
  completed: { wariant: "ok", tekst: "Ukończony" },
};

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
          mianownik: `z ${kursy.length} kursów`,
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

  const wiersze: WierszRecordList[] = kursy.map((kurs) => ({
    id: String(kurs.id),
    tytul: kurs.title,
    podpowiedz: `${kurs.progress_percent}% ukończone`,
    plakietka: ETYKIETA_STATUSU[kurs.status],
    akcja: { etykieta: "Otwórz kurs", href: `/panel/kursy/${kurs.slug}` },
  }));

  return (
    <DashboardTemplate
      naglowek={{
        okruszki: [{ etykieta: "Pulpit" }],
        tytul: "Pulpit",
        opis: "Wróć do swojego kursu i zobacz wszystkie kursy.",
        onPowrot: () => router.back(),
      }}
      nastepnyKrok={
        maKursy ? (
          <BlokWznowienia kursy={kursy} lekcje={lekcje} naPrzejdz={(href) => router.push(href)} />
        ) : undefined
      }
      kafle={kafle}
      glowna={
        <RecordList
          tytul="Twoje kursy"
          wiersze={wiersze}
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

function BlokWznowienia({
  kursy,
  lekcje,
  naPrzejdz,
}: {
  kursy: KursSciezki[];
  lekcje: LekcjeKursu;
  naPrzejdz: (href: string) => void;
}) {
  const wToku = kursDoWznowienia(kursy);

  if (wToku && lekcje.stan === "ladowanie") {
    return (
      <div>
        <Heading stopien={2}>Wznów naukę</Heading>
        <Skeleton wiersze={2} />
      </div>
    );
  }

  if (wToku && lekcje.stan === "blad") {
    return (
      <div>
        <Heading stopien={2}>Wznów naukę</Heading>
        <Notice wariant="warn" tytul="Szczegóły kursu niedostępne">
          Nie udało się ustalić dokładnej lekcji — możesz otworzyć kurs.
        </Notice>
        <Button poziom="primary" onClick={() => naPrzejdz(`/panel/kursy/${wToku.slug}`)}>
          Otwórz kurs
        </Button>
        <Text>{wToku.title}</Text>
      </div>
    );
  }

  const wznowienie = wyliczWznowienie(kursy, lekcje.stan === "ok" ? lekcje.dane : []);

  if (wznowienie.rodzaj === "lekcja") {
    return (
      <div>
        <Heading stopien={2}>Wznów naukę</Heading>
        <Text>
          {wznowienie.kurs.title} · {wznowienie.lekcja.title}
        </Text>
        <Button poziom="primary" onClick={() => naPrzejdz(`/panel/lekcje/${wznowienie.lekcja.id}`)}>
          Wznów lekcję
        </Button>
      </div>
    );
  }

  if (wznowienie.rodzaj === "kurs") {
    return (
      <div>
        <Heading stopien={2}>Wznów naukę</Heading>
        <Text>W kursie „{wznowienie.kurs.title}” masz już za sobą wszystkie lekcje.</Text>
        <Button poziom="primary" onClick={() => naPrzejdz(`/panel/kursy/${wznowienie.kurs.slug}`)}>
          Otwórz kurs
        </Button>
      </div>
    );
  }

  if (wznowienie.rodzaj === "wszystko-ukonczone") {
    return (
      <div>
        <Heading stopien={2}>Wznów naukę</Heading>
        <Text>Wszystkie Twoje kursy są ukończone. Dobra robota.</Text>
      </div>
    );
  }

  return (
    <div>
      <Heading stopien={2}>Wznów naukę</Heading>
      <Text wariant="pusty">Gdy któryś kurs będzie w toku, pojawi się tutaj lekcja do wznowienia.</Text>
    </div>
  );
}
