"use client";

import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Link } from "@/design-system/atomy/Link/Link";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import {
  pobierzGodzinyStazu,
  pobierzKursy,
  pobierzNadchodzaceSuperwizje,
  pobierzSzczegolKursu,
  pobierzWarunkiCertyfikatu,
  type GodzinyStazu,
  type KursSciezki,
  type LekcjaKursu,
  type TerminSuperwizji,
  type WarunkiCertyfikatu,
} from "./dane";
import { etapySciezki, wyliczNastepnyKrok, type NastepnyKrok } from "./nastepny-krok";

type StanEkranu = "ladowanie" | "blad" | "ok";

/** Stan pomocniczej sekcji — każda z czterech (lekcje etapu w toku, warunki
 * certyfikatu, godziny stażu, terminy superwizji) ładuje się i może zawieść
 * NIEZALEŻNIE od reszty pulpitu (kryterium: „błąd jednej z tras → `Notice`
 * w tym obszarze, reszta pulpitu działa"). */
type Pomocnicza<T> = { stan: "ladowanie" } | { stan: "blad" } | { stan: "ok"; dane: T };

const ETYKIETA_STATUSU: Record<KursSciezki["status"], { wariant: "neutral" | "ok" | "pending"; tekst: string }> = {
  locked: { wariant: "neutral", tekst: "Zablokowany" },
  in_progress: { wariant: "pending", tekst: "W toku" },
  completed: { wariant: "ok", tekst: "Ukończony" },
};

function formatDataSuperwizji(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

/**
 * Trasa `/nowy-front/pulpit` — pulpit uczestnika (U-01, wolontariusz).
 * Stara trasa produktu: `app/(uczestnik)/panel/pulpit/page.tsx` (montuje
 * `components/pulpit/PulpitDashboard`) — przełączenie robi mechanizm `433`,
 * nie ten ekran.
 *
 * Krytyczne dla całej strony: `GET /courses` — bez niego nie da się policzyć
 * ani następnego kroku, ani kafli, ani listy ścieżki. Cztery pozostałe trasy
 * są pomocnicze i ładują się niezależnie (`Pomocnicza<T>`): błąd jednej
 * pokazuje `Notice` wyłącznie w jej obszarze, reszta pulpitu działa dalej.
 */
export function Pulpit() {
  const router = useRouter();

  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [kursy, setKursy] = useState<KursSciezki[]>([]);

  const [lekcjeEtapu, setLekcjeEtapu] = useState<Pomocnicza<LekcjaKursu[]>>({ stan: "ladowanie" });
  const [warunki, setWarunki] = useState<Pomocnicza<WarunkiCertyfikatu>>({ stan: "ladowanie" });
  const [godziny, setGodziny] = useState<Pomocnicza<GodzinyStazu>>({ stan: "ladowanie" });
  const [superwizje, setSuperwizje] = useState<Pomocnicza<TerminSuperwizji[]>>({ stan: "ladowanie" });

  const wczytajPomocnicze = useCallback((listaKursow: KursSciezki[], straz?: { anulowane: boolean }) => {
    const wToku = etapySciezki(listaKursow).find((kurs) => kurs.status === "in_progress");

    if (wToku) {
      setLekcjeEtapu({ stan: "ladowanie" });
      pobierzSzczegolKursu(wToku.slug)
        .then((szczegol) => {
          if (straz?.anulowane) return;
          setLekcjeEtapu({ stan: "ok", dane: szczegol.lessons });
        })
        .catch(() => {
          if (straz?.anulowane) return;
          setLekcjeEtapu({ stan: "blad" });
        });
    } else {
      setLekcjeEtapu({ stan: "ok", dane: [] });
    }

    setWarunki({ stan: "ladowanie" });
    pobierzWarunkiCertyfikatu()
      .then((dane) => !straz?.anulowane && setWarunki({ stan: "ok", dane }))
      .catch(() => !straz?.anulowane && setWarunki({ stan: "blad" }));

    setGodziny({ stan: "ladowanie" });
    pobierzGodzinyStazu()
      .then((dane) => !straz?.anulowane && setGodziny({ stan: "ok", dane }))
      .catch(() => !straz?.anulowane && setGodziny({ stan: "blad" }));

    setSuperwizje({ stan: "ladowanie" });
    pobierzNadchodzaceSuperwizje()
      .then((dane) => !straz?.anulowane && setSuperwizje({ stan: "ok", dane }))
      .catch(() => !straz?.anulowane && setSuperwizje({ stan: "blad" }));
  }, []);

  const wczytaj = useCallback(
    (straz?: { anulowane: boolean }) => {
      pobierzKursy()
        .then((listaKursow) => {
          if (straz?.anulowane) return;
          setKursy(listaKursow);
          setStan("ok");
          wczytajPomocnicze(listaKursow, straz);
        })
        .catch(() => {
          if (straz?.anulowane) return;
          setStan("blad");
        });
    },
    [wczytajPomocnicze],
  );

  useEffect(() => {
    const straz = { anulowane: false };
    wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stan === "ladowanie") {
    return (
      <main id="tresc">
        <Heading stopien={1}>Pulpit</Heading>
        <Skeleton wiersze={6} />
      </main>
    );
  }

  if (stan === "blad") {
    return (
      <main id="tresc">
        <Heading stopien={1}>Pulpit</Heading>
        <Text>Nie udało się wczytać pulpitu. Spróbuj ponownie później.</Text>
      </main>
    );
  }

  const etapy = etapySciezki(kursy);
  const wToku = etapy.find((kurs) => kurs.status === "in_progress");
  const ukonczoneEtapy = etapy.filter((kurs) => kurs.status === "completed").length;

  const krok: NastepnyKrok | null =
    lekcjeEtapu.stan === "ok" ? wyliczNastepnyKrok(etapy, wToku ? lekcjeEtapu.dane : []) : null;

  const godzinyLiczba = godziny.stan === "ok" ? Number(godziny.dane.accepted_hours) : undefined;
  const warunekSuperwizji = warunki.stan === "ok" ? warunki.dane.conditions.find((w) => w.key === "supervision") : undefined;

  const kafle: ComponentProps<typeof StatRow>["kafle"] = [
    {
      id: "pulpit-etapy",
      etykieta: "Ukończone etapy",
      wartosc: etapy.length > 0 ? ukonczoneEtapy : undefined,
      mianownik: `z ${etapy.length} etapów`,
      procent: etapy.length > 0 ? Math.round((ukonczoneEtapy / etapy.length) * 100) : undefined,
      dominujacy: true,
    },
    {
      id: "pulpit-biezacy-etap",
      etykieta: "Bieżący etap",
      wartosc: wToku?.progress_percent,
      mianownik: "% ukończone",
      procent: wToku?.progress_percent,
      podpowiedz: wToku?.title,
    },
    {
      id: "pulpit-godziny-stazu",
      etykieta: "Godziny stażu",
      wartosc: godzinyLiczba,
      mianownik: godziny.stan === "ok" ? `z ${godziny.dane.required_hours} godz.` : "godz.",
    },
    {
      id: "pulpit-superwizje",
      etykieta: "Obecności na superwizjach",
      wartosc: typeof warunekSuperwizji?.done === "number" ? warunekSuperwizji.done : undefined,
      mianownik:
        warunekSuperwizji?.required !== undefined ? `z ${warunekSuperwizji.required}` : "obecności",
    },
  ];

  const wierszeSciezki: WierszRecordList[] = etapy.map((kurs) => ({
    id: String(kurs.id),
    tytul: kurs.title,
    podpowiedz: `Etap ${kurs.sequence_order ?? "—"} · ${kurs.progress_percent}% ukończone`,
    plakietka: ETYKIETA_STATUSU[kurs.status],
    akcja: { etykieta: "Otwórz etap", href: `/panel/kursy/${kurs.slug}` },
  }));

  const terminySuperwizji = superwizje.stan === "ok" ? nadchodzace(superwizje.dane) : [];
  const wierszeSuperwizji: WierszRecordList[] = terminySuperwizji.map((termin) => ({
    id: String(termin.id),
    tytul: formatDataSuperwizji(termin.starts_at),
    podpowiedz: termin.location_or_link ?? "Bez podanej lokalizacji.",
    akcja: { etykieta: "Szczegóły", href: "/panel/superwizja" },
  }));

  return (
    <DashboardTemplate
      naglowek={{
        okruszki: [{ etykieta: "Pulpit" }],
        tytul: "Pulpit",
        opis: "Twój następny krok i podgląd całej ścieżki.",
        onPowrot: () => router.back(),
      }}
      nastepnyKrok={<NastepnyKrokBlok krok={krok} lekcjeEtapu={lekcjeEtapu} wToku={wToku} />}
      kafle={kafle}
      glowna={
        <>
          {warunki.stan === "blad" && (
            <Notice wariant="warn" tytul="Warunki certyfikatu niedostępne">
              Nie udało się wczytać warunków certyfikatu — liczba obecności na superwizjach powyżej może być
              niepełna.
            </Notice>
          )}
          {godziny.stan === "blad" && (
            <Notice wariant="warn" tytul="Godziny stażu niedostępne">
              Nie udało się wczytać godzin stażu.
            </Notice>
          )}
          <RecordList
            tytul="Twoja ścieżka"
            wiersze={wierszeSciezki}
            pusty={{
              naglowek: "Ścieżka jest przygotowywana",
              tresc: "Gdy administracja doda pierwszy etap, pojawi się tutaj.",
              przycisk: { etykieta: "Odśwież", onClick: () => wczytaj() },
            }}
          />
        </>
      }
      wspierajaca={
        <>
          {superwizje.stan === "blad" ? (
            <Notice wariant="warn" tytul="Terminy superwizji niedostępne">
              Nie udało się wczytać nadchodzących terminów superwizji.
            </Notice>
          ) : (
            <RecordList
              tytul="Najbliższe terminy superwizji"
              wiersze={wierszeSuperwizji}
              pusty={{
                naglowek: "Brak zaplanowanych terminów",
                tresc: "Gdy prowadzący doda termin superwizji, pojawi się tutaj.",
                przycisk: { etykieta: "Odśwież", onClick: () => wczytaj() },
              }}
            />
          )}
        </>
      }
    />
  );
}

function nadchodzace(terminy: TerminSuperwizji[]): TerminSuperwizji[] {
  const teraz = Date.now();
  return terminy
    .filter((termin) => new Date(termin.starts_at).getTime() > teraz)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 3);
}

function NastepnyKrokBlok({
  krok,
  lekcjeEtapu,
  wToku,
}: {
  krok: NastepnyKrok | null;
  lekcjeEtapu: Pomocnicza<LekcjaKursu[]>;
  wToku: KursSciezki | undefined;
}) {
  if (lekcjeEtapu.stan === "ladowanie" || krok === null) {
    return (
      <div>
        <Heading stopien={2}>Twój następny krok</Heading>
        <Skeleton wiersze={2} />
      </div>
    );
  }

  if (wToku && lekcjeEtapu.stan === "blad") {
    return (
      <div>
        <Heading stopien={2}>Twój następny krok</Heading>
        <Notice wariant="warn" tytul="Szczegóły etapu niedostępne">
          Nie udało się ustalić dokładnej lekcji — możesz otworzyć bieżący etap.
        </Notice>
        <Link href={`/panel/kursy/${wToku.slug}`}>Otwórz etap: {wToku.title}</Link>
      </div>
    );
  }

  if (krok.rodzaj === "lekcja") {
    return (
      <div>
        <Heading stopien={2}>Twój następny krok</Heading>
        <Text>
          {krok.kurs.title} · {krok.lekcja.title}
        </Text>
        <Link href={`/panel/lekcje/${krok.lekcja.id}`}>Wróć do lekcji</Link>
      </div>
    );
  }

  if (krok.rodzaj === "test") {
    return (
      <div>
        <Heading stopien={2}>Twój następny krok</Heading>
        <Text>Masz za sobą wszystkie lekcje etapu „{krok.kurs.title}”. Czas na test sprawdzający.</Text>
        <Link href={`/panel/kursy/${krok.kurs.slug}/test`}>Przejdź do testu</Link>
      </div>
    );
  }

  if (krok.rodzaj === "certyfikat") {
    return (
      <div>
        <Heading stopien={2}>Twój następny krok</Heading>
        <Text>Masz wszystkie etapy za sobą. Dobra robota.</Text>
        <Link href="/panel/certyfikat">Zobacz warunki certyfikatu</Link>
      </div>
    );
  }

  return (
    <div>
      <Heading stopien={2}>Twój następny krok</Heading>
      <Text wariant="pusty">Gdy pierwszy etap ścieżki stanie się dostępny, pojawi się tutaj Twój następny krok.</Text>
    </div>
  );
}
