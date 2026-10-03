"use client";

import { useNawigacjaZPytaniem } from "@/design-system/szablony/NiezapisaneZmiany";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { CaseCard } from "@/design-system/organizmy/CaseCard/CaseCard";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { PanelDecyzji } from "./PanelDecyzji";
import {
  SCIEZKA_LISTY,
  dataPl,
  etykietaRoli,
  pobierzSkanDyplomu,
  poprawneId,
  wczytajZgloszenie,
  type WiadomoscOdrzucenia,
  type Zgloszenie,
} from "./dane";
import style from "./ZgloszenieDecyzja.module.css";

/**
 * Okruszki z łączem do listy: w nowej ramce panelu nagłówek nie ma przycisku
 * powrotu, więc łącze „Zgłoszenia rekrutacyjne” jest drogą z powrotem na listę
 * (`/admin/nabor`); ostatnia pozycja to bieżący ekran — osoba ze zgłoszenia,
 * a przed wczytaniem „Zgłoszenie”. Ekran jest podstroną „Spraw” (rejestr menu
 * ramki), więc w nowej ramce okruszek składa reguła z rejestru:
 * „Administracja › Sprawy › Zgłoszenia rekrutacyjne › <osoba>”.
 */
function okruszki(biezaca: string) {
  return [
    { etykieta: "Administracja" },
    { etykieta: "Sprawy" },
    { etykieta: "Zgłoszenia rekrutacyjne", href: SCIEZKA_LISTY },
    { etykieta: biezaca },
  ];
}

type WariantStatusu = "neutral" | "ok" | "warn" | "error" | "pending";

const STATUS_ZGLOSZENIA: Record<Zgloszenie["status"], { wariant: WariantStatusu; etykieta: string }> = {
  new: { wariant: "pending", etykieta: "Czeka na decyzję" },
  accepted: { wariant: "ok", etykieta: "Zaakceptowane" },
  rejected: { wariant: "error", etykieta: "Odrzucone" },
};

type Stan =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "gotowy"; zgloszenie: Zgloszenie };

interface WlasciwosciRamy {
  tytul: string;
  /** Ostatnia pozycja okruszka (bieżący ekran); domyślnie „Zgłoszenie”. */
  okruszekBiezacy?: string;
  status?: { wariant: WariantStatusu; etykieta: string };
  wroc: () => void;
  glowna: ReactNode;
  wspierajaca?: ReactNode;
}

function Rama({ tytul, okruszekBiezacy = "Zgłoszenie", status, wroc, glowna, wspierajaca = null }: WlasciwosciRamy) {
  return (
    <DetailTemplate
      naglowek={{ okruszki: okruszki(okruszekBiezacy), tytul, status, onPowrot: wroc }}
      glowna={glowna}
      wspierajaca={wspierajaca}
    />
  );
}

/**
 * Ekran „Zgłoszenie — decyzja” na szablonie `DetailTemplate`: dane kandydata
 * w karcie sprawy (kolumna główna) i decyzja administracji (kolumna wspierająca).
 * Każdy stan — ładowanie, dane, po decyzji, brak uprawnień, brak zgłoszenia,
 * błąd — renderuje się wewnątrz szablonu, którego korzeń jest jedynym `main`.
 * Odczyt i zapis biegną z przeglądarki tokenem osoby (`dane.ts`).
 */
export function ZgloszenieDecyzja({ id }: { id: string }) {
  const { przejdz } = useNawigacjaZPytaniem();
  const wroc = () => przejdz(SCIEZKA_LISTY);
  const [stan, setStan] = useState<Stan>(() =>
    poprawneId(id) === null ? { rodzaj: "nie-znaleziono" } : { rodzaj: "ladowanie" },
  );
  const [proba, setProba] = useState(0);

  useEffect(() => {
    const idLiczba = poprawneId(id);
    if (idLiczba === null) return;
    let aktualne = true;
    void wczytajZgloszenie(idLiczba).then((wynik) => {
      if (!aktualne) return;
      if (wynik.rodzaj === "gotowy") setStan({ rodzaj: "gotowy", zgloszenie: wynik.zgloszenie });
      else if (wynik.rodzaj === "brak-uprawnien") setStan({ rodzaj: "brak-uprawnien" });
      else if (wynik.rodzaj === "nie-znaleziono") setStan({ rodzaj: "nie-znaleziono" });
      else setStan({ rodzaj: "blad" });
    });
    return () => {
      aktualne = false;
    };
  }, [id, proba]);

  const ponow = () => {
    setStan({ rodzaj: "ladowanie" });
    setProba((poprzednia) => poprzednia + 1);
  };

  if (stan.rodzaj === "ladowanie") {
    return (
      <Rama
        tytul="Wczytywanie zgłoszenia"
        wroc={wroc}
        glowna={
          <div aria-busy="true">
            <Skeleton wiersze={6} />
          </div>
        }
        wspierajaca={<Skeleton wiersze={3} />}
      />
    );
  }
  if (stan.rodzaj === "blad") {
    return (
      <Rama
        tytul="Zgłoszenie rekrutacyjne"
        wroc={wroc}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać zgłoszenia"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Dane zgłoszenia nie są zmyślane bez odpowiedzi.
          </Notice>
        }
      />
    );
  }
  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <Rama
        tytul="Zgłoszenie rekrutacyjne"
        wroc={wroc}
        glowna={
          <EkranOdmowy
            rodzaj="brak-dostepu"
            stopien={2}
            rolaDocelowa="administracji"
            przycisk={{ etykieta: "Wróć do listy", onClick: wroc }}
          />
        }
      />
    );
  }
  if (stan.rodzaj === "nie-znaleziono") {
    return (
      <Rama
        tytul="Zgłoszenie rekrutacyjne"
        wroc={wroc}
        glowna={
          <EkranOdmowy
            rodzaj="nie-znaleziono"
            czego="zgłoszenia"
            stopien={2}
            przycisk={{ etykieta: "Wróć do listy", onClick: wroc }}
          />
        }
      />
    );
  }
  return <Widok poczatkowe={stan.zgloszenie} wroc={wroc} odswiez={ponow} />;
}

function zgoda(iso: string | null): string {
  return iso ? `zaakceptowany ${dataPl(iso)}` : "brak";
}

interface WlasciwosciWidoku {
  poczatkowe: Zgloszenie;
  wroc: () => void;
  odswiez: () => void;
}

function Widok({ poczatkowe, wroc, odswiez }: WlasciwosciWidoku) {
  const [zgloszenie, setZgloszenie] = useState(poczatkowe);
  const [zaproszenie, setZaproszenie] = useState<"sent" | "failed" | null>(null);
  const [wiadomoscOdrzucenia, setWiadomoscOdrzucenia] = useState<WiadomoscOdrzucenia>(null);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [bladSkanu, setBladSkanu] = useState<string | null>(null);
  const zamknijToast = useCallback(() => setKomunikat(null), []);

  async function otworzSkan() {
    setBladSkanu(null);
    const wynik = await pobierzSkanDyplomu(zgloszenie.id);
    if (wynik.rodzaj === "blad") setBladSkanu(wynik.komunikat);
  }

  const nazwa = `${zgloszenie.first_name} ${zgloszenie.last_name}`;

  return (
    <Rama
      tytul={`Zgłoszenie: ${nazwa}`}
      okruszekBiezacy={nazwa}
      status={STATUS_ZGLOSZENIA[zgloszenie.status]}
      wroc={wroc}
      glowna={
        <div className={style.kolumna}>
          <CaseCard
            rodzaj="podstawowa"
            tytul={nazwa}
            pary={[
              { etykieta: "E-mail", wartosc: zgloszenie.email },
              { etykieta: "Telefon", wartosc: zgloszenie.phone ?? "" },
              { etykieta: "Uczelnia", wartosc: zgloszenie.university ?? "" },
              { etykieta: "Rok ukończenia", wartosc: zgloszenie.graduation_year?.toString() ?? "" },
              { etykieta: "Rola wskazana w zgłoszeniu", wartosc: etykietaRoli(zgloszenie.role) },
              { etykieta: "Źródło zgłoszenia", wartosc: zgloszenie.source ?? "" },
              { etykieta: "Zgłoszono", wartosc: dataPl(zgloszenie.created_at) },
              { etykieta: "Regulamin", wartosc: zgoda(zgloszenie.consent_regulamin_at) },
              { etykieta: "Polityka prywatności", wartosc: zgoda(zgloszenie.consent_polityka_at) },
            ]}
          />
          <section className={style.sekcja}>
            <Heading stopien={2}>Dyplom</Heading>
            {zgloszenie.has_diploma_scan ? (
              <>
                <Text>
                  Do zgłoszenia dołączono skan dyplomu. Każde otwarcie skanu jest zapisywane w dzienniku działań.
                </Text>
                {bladSkanu && (
                  <Notice wariant="error" tytul="Nie udało się pobrać skanu dyplomu">
                    {bladSkanu}
                  </Notice>
                )}
                <div className={style.rzad}>
                  <Button poziom="outline" onClick={() => void otworzSkan()}>
                    Pobierz skan dyplomu
                  </Button>
                </div>
              </>
            ) : (
              <Text>Do zgłoszenia nie dołączono skanu dyplomu.</Text>
            )}
          </section>
          {komunikat && <Toast komunikat={komunikat} onZamknij={zamknijToast} />}
        </div>
      }
      wspierajaca={
        <PanelDecyzji
          zgloszenie={zgloszenie}
          zaproszenie={zaproszenie}
          wiadomoscOdrzucenia={wiadomoscOdrzucenia}
          odswiez={odswiez}
          onZaakceptowano={(userId, wynikZaproszenia) => {
            setZgloszenie({ ...zgloszenie, status: "accepted", user_id: userId, decided_at: new Date().toISOString() });
            setZaproszenie(wynikZaproszenia);
            setKomunikat("Zgłoszenie zaakceptowane. Konto zostało utworzone.");
          }}
          onOdrzucono={(odrzucone, wiadomosc) => {
            setZgloszenie(odrzucone);
            setWiadomoscOdrzucenia(wiadomosc);
            setKomunikat("Zgłoszenie odrzucone.");
          }}
        />
      }
    />
  );
}
