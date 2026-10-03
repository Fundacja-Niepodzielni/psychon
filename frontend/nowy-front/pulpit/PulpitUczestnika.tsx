"use client";

import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/design-system/atomy/Text/Text";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { KartaNastepnegoKroku } from "@/design-system/molekuly/KartaNastepnegoKroku/KartaNastepnegoKroku";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { rodzajBledu } from "./rodzaj-bledu";
import { adresLekcji } from "../lekcja/adres";
import { pobierzKurs, type KursUczestnika } from "../kurs-uczestnika/dane";
import { formatujDateICzas } from "../wspolne/daty";
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
import { formatujDziesietny } from "../wspolne/formatuj-dziesietny";
import { ListaKursow } from "./ListaKursow";
import { mianownikOdbytychSuperwizji, mianownikUkonczonychKursow } from "./odmiana-kafli";
import { KartaWebinaru } from "./KartaWebinaru";
import { etapySciezki, pozycjeSciezki, wyliczNastepnyKrok, zdanieObejrzanychMinut, type NastepnyKrok } from "./nastepny-krok";
import { webinaryDoWykonania, wybierzNajblizszyWebinar } from "./webinar-karta";

type StanEkranu = StanBezDanych | "ok";

/** Stan pomocniczej sekcji — każda z czterech (lekcje etapu w toku, warunki
 * certyfikatu, godziny stażu, terminy superwizji) ładuje się i może zawieść
 * NIEZALEŻNIE od reszty pulpitu (kryterium: „błąd jednej z tras → `Notice`
 * w tym obszarze, reszta pulpitu działa"). */
type Pomocnicza<T> = { stan: "ladowanie" } | { stan: "blad" } | { stan: "ok"; dane: T };

interface WlasciwosciPulpitUczestnika {
  /** `GET /me` → `program_completed_at` różne od `null`. */
  programUkonczony: boolean;
}

/**
 * Pulpit uczestnika (U-01, wolontariusz), wybierany przez `Pulpit` po roli
 * z `GET /me`. Stara trasa produktu: `app/(uczestnik)/panel/pulpit/page.tsx`
 * (montuje `components/pulpit/PulpitDashboard`); przełączenia ten ekran nie robi.
 *
 * Krytyczne dla całej strony: `GET /courses` — bez niego nie da się policzyć
 * ani następnego kroku, ani kafli, ani listy ścieżki. Cztery pozostałe trasy
 * są pomocnicze i ładują się niezależnie (`Pomocnicza<T>`): błąd jednej
 * pokazuje `Notice` wyłącznie w jej obszarze, reszta pulpitu działa dalej.
 */
export function PulpitUczestnika({ programUkonczony }: WlasciwosciPulpitUczestnika) {
  const router = useRouter();

  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [kursy, setKursy] = useState<KursSciezki[]>([]);

  const [lekcjeEtapu, setLekcjeEtapu] = useState<Pomocnicza<LekcjaKursu[]>>({ stan: "ladowanie" });
  const [warunki, setWarunki] = useState<Pomocnicza<WarunkiCertyfikatu>>({ stan: "ladowanie" });
  const [godziny, setGodziny] = useState<Pomocnicza<GodzinyStazu>>({ stan: "ladowanie" });
  const [superwizje, setSuperwizje] = useState<Pomocnicza<TerminSuperwizji[]>>({ stan: "ladowanie" });
  /** Najbliższy nieukończony webinar ścieżki (`null` — nie ma żadnego). */
  const [webinar, setWebinar] = useState<Pomocnicza<KursUczestnika | null>>({ stan: "ladowanie" });

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

    // Szczegóły czytamy tylko dla nieukończonych webinarów; zaplecze bez webinarów nie dokłada żadnego żądania.
    const doWykonania = webinaryDoWykonania(listaKursow);
    if (doWykonania.length === 0) {
      setWebinar({ stan: "ok", dane: null });
    } else {
      setWebinar({ stan: "ladowanie" });
      Promise.allSettled(doWykonania.map((pozycja) => pobierzKurs(pozycja.slug))).then((wyniki) => {
        if (straz?.anulowane) return;
        const odczytane = wyniki.flatMap((wynik) => (wynik.status === "fulfilled" ? [wynik.value] : []));
        setWebinar(odczytane.length === 0 ? { stan: "blad" } : { stan: "ok", dane: wybierzNajblizszyWebinar(odczytane, Date.now()) });
      });
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
        .catch((wyjatek: unknown) => {
          if (straz?.anulowane) return;
          setStan(rodzajBledu(wyjatek));
        });
    },
    [wczytajPomocnicze],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stan !== "ok") {
    return <EkranStanu stan={stan} onPonow={ponow} />;
  }

  const etapy = etapySciezki(kursy);
  const wToku = etapy.find((kurs) => kurs.status === "in_progress");
  const ukonczoneEtapy = etapy.filter((kurs) => kurs.status === "completed").length;

  // Po programie krok nie zależy od lekcji, więc nie czeka na ich odczyt.
  const krok: NastepnyKrok | null = programUkonczony
    ? wyliczNastepnyKrok(etapy, [], true)
    : lekcjeEtapu.stan === "ok"
      ? wyliczNastepnyKrok(etapy, wToku ? lekcjeEtapu.dane : [])
      : null;

  const godzinyLiczba = godziny.stan === "ok" ? Number(godziny.dane.accepted_hours) : undefined;
  const warunekSuperwizji = warunki.stan === "ok" ? warunki.dane.conditions.find((w) => w.key === "supervision") : undefined;

  const kafle: ComponentProps<typeof StatRow>["kafle"] = [
    {
      id: "pulpit-etapy",
      etykieta: "Kursy w programie",
      wartosc: etapy.length > 0 ? ukonczoneEtapy : undefined,
      mianownik: mianownikUkonczonychKursow(ukonczoneEtapy, etapy.length),
      procent: etapy.length > 0 ? Math.round((ukonczoneEtapy / etapy.length) * 100) : undefined,
      dominujacy: true,
      ukladPulpitu: true,
    },
    {
      id: "pulpit-biezacy-etap",
      etykieta: "Bieżący kurs",
      wartosc: wToku?.progress_percent,
      mianownik: "% ukończone",
      procent: wToku?.progress_percent,
      podpowiedz: wToku?.title,
      ukladPulpitu: true,
    },
    {
      id: "pulpit-godziny-stazu",
      etykieta: "Dziennik stażu",
      wartosc: godzinyLiczba,
      mianownik: godziny.stan === "ok" ? `z ${formatujDziesietny(godziny.dane.required_hours)} godzin` : "godzin",
      ukladPulpitu: true,
    },
    {
      id: "pulpit-superwizje",
      etykieta: "Superwizja",
      wartosc: typeof warunekSuperwizji?.done === "number" ? warunekSuperwizji.done : undefined,
      mianownik: mianownikOdbytychSuperwizji(
        typeof warunekSuperwizji?.done === "number" ? warunekSuperwizji.done : undefined,
        warunekSuperwizji?.required,
      ),
      ukladPulpitu: true,
    },
  ];

  const terminySuperwizji = superwizje.stan === "ok" ? nadchodzace(superwizje.dane) : [];
  const wierszeSuperwizji: WierszRecordList[] = terminySuperwizji.map((termin) => ({
    id: String(termin.id),
    tytul: formatujDateICzas(termin.starts_at),
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
        przyciskGlowny: przyciskNastepnegoKroku(krok, lekcjeEtapu, wToku, (href) => router.push(href)),
      }}
      nastepnyKrok={<NastepnyKrokBlok krok={krok} lekcjeEtapu={lekcjeEtapu} wToku={wToku} />}
      kafle={kafle}
      ukladKafli={{ wyrownane: true }}
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
          {webinar.stan === "blad" && (
            <Notice wariant="warn" tytul="Webinar niedostępny">
              Nie udało się wczytać najbliższego webinaru.
            </Notice>
          )}
          {webinar.stan === "ok" && webinar.dane !== null && <KartaWebinaru webinar={webinar.dane} />}
          <ListaKursow
            tytul="Twoja ścieżka"
            kursy={pozycjeSciezki(kursy)}
            podpowiedz={(kurs) =>
              kurs.type === "webinar" ? "Webinar" : `Kurs ${kurs.sequence_order ?? "—"} · ${kurs.progress_percent}% ukończone`
            }
            pusty={{
              naglowek: "Ścieżka jest przygotowywana",
              tresc: "Gdy administracja doda pierwszy kurs, pojawi się tutaj.",
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

/**
 * Przycisk główny „następnego kroku” stoi w nagłówku strony (makieta 2.0.4,
 * `.head .acts`: „Przycisk … jest u góry, przy tytule strony”), a blok
 * „Twój następny krok” niesie tylko opis. Brak kroku (ładowanie, brak
 * dostępnego etapu) = brak przycisku; błąd szczegółów kursu w toku zostawia
 * przycisk „Otwórz kurs”, jak dotąd.
 */
function przyciskNastepnegoKroku(
  krok: NastepnyKrok | null,
  lekcjeEtapu: Pomocnicza<LekcjaKursu[]>,
  wToku: KursSciezki | undefined,
  naPrzejdz: (href: string) => void,
): { etykieta: string; onKliknij: () => void } | undefined {
  if (krok === null) {
    if (lekcjeEtapu.stan === "blad" && wToku) {
      return { etykieta: "Otwórz kurs", onKliknij: () => naPrzejdz(`/panel/kursy/${wToku.slug}`) };
    }
    return undefined;
  }
  switch (krok.rodzaj) {
    case "lekcja":
      return { etykieta: "Wróć do lekcji", onKliknij: () => naPrzejdz(adresLekcji(krok.lekcja.id, krok.kurs.slug)) };
    case "test":
      return { etykieta: "Przejdź do testu", onKliknij: () => naPrzejdz(`/panel/kursy/${krok.kurs.slug}/test`) };
    case "certyfikat":
      return { etykieta: "Zobacz warunki certyfikatu", onKliknij: () => naPrzejdz("/panel/certyfikat") };
    case "po-programie":
      return { etykieta: "Przejdź do dalszej współpracy", onKliknij: () => naPrzejdz("/panel/po-programie") };
    case "brak":
      return undefined;
  }
}

const ETYKIETA_KROKU = "Następny krok";

function NastepnyKrokBlok({
  krok,
  lekcjeEtapu,
  wToku,
}: {
  krok: NastepnyKrok | null;
  lekcjeEtapu: Pomocnicza<LekcjaKursu[]>;
  wToku: KursSciezki | undefined;
}) {
  if (krok === null && lekcjeEtapu.stan !== "blad") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU}>
        <Skeleton wiersze={2} />
      </KartaNastepnegoKroku>
    );
  }

  if (krok === null && wToku) {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek={wToku.title}>
        <Notice wariant="warn" tytul="Szczegóły kursu niedostępne">
          Nie udało się ustalić dokładnej lekcji — możesz otworzyć bieżący kurs.
        </Notice>
      </KartaNastepnegoKroku>
    );
  }

  if (krok === null) {
    return null;
  }

  if (krok.rodzaj === "lekcja") {
    const obejrzane = zdanieObejrzanychMinut(krok.lekcja);
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek={krok.lekcja.title}>
        <Text>{obejrzane === null ? `Kurs „${krok.kurs.title}”.` : `Kurs „${krok.kurs.title}” · ${obejrzane}.`}</Text>
      </KartaNastepnegoKroku>
    );
  }

  if (krok.rodzaj === "test") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek="Test sprawdzający">
        <Text>Masz za sobą wszystkie lekcje kursu „{krok.kurs.title}”. Czas na test sprawdzający.</Text>
      </KartaNastepnegoKroku>
    );
  }

  if (krok.rodzaj === "certyfikat") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek="Certyfikat">
        <Text>Masz wszystkie kursy za sobą. Dobra robota.</Text>
      </KartaNastepnegoKroku>
    );
  }

  if (krok.rodzaj === "po-programie") {
    return (
      <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek="Dalsza współpraca">
        <Text>Program masz już za sobą. Możesz zgłosić chęć dalszej współpracy.</Text>
      </KartaNastepnegoKroku>
    );
  }

  return (
    <KartaNastepnegoKroku etykieta={ETYKIETA_KROKU} naglowek="Pierwszy krok wkrótce">
      <Text wariant="pusty">Gdy pierwszy kurs ścieżki stanie się dostępny, pojawi się tutaj Twój następny krok.</Text>
    </KartaNastepnegoKroku>
  );
}
