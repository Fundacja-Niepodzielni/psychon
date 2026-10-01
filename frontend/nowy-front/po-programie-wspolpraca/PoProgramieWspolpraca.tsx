"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { EmptyStateCard } from "@/design-system/organizmy/EmptyStateCard/EmptyStateCard";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import { zglosWspolprace, pobierzMojeZgloszenia } from "@/lib/api/h01-wspolpraca";
import {
  LICZBA_ZNAKOW_MAX,
  maOtwarteZgloszenie,
  sklasyfikujBladWysylki,
  wczytajStan,
  type StanEkranu,
} from "./dane";
import { HistoriaZgloszen } from "./HistoriaZgloszen";
import { KartaProgramuUkonczonego } from "./KartaProgramuUkonczonego";
import style from "./PoProgramieWspolpraca.module.css";

const OKRUSZKI = [{ etykieta: "Po programie" }];

/**
 * Ekran „Po programie” (uczestnik) na szablonie `DetailTemplate`:
 * nagłówek, w kolumnie głównej karta „Program ukończony” i formularz
 * zgłoszenia, w kolumnie wspierającej historia własnych zgłoszeń. Każdy stan
 * — ładowanie, dane, brak uprawnień, błąd sieci, program jeszcze
 * nieukończony, po zapisie — stoi w obszarach szablonu, więc jedyny `main`
 * jest korzeniem szablonu (pod powłoką panelu szablon jest zwykłym `div`).
 *
 * Trasy: `POST /cooperation-requests` i `GET /cooperation-requests/mine`
 * (`backend/routes/api/h01.php:41-42`). Gdy osoba nie ma prawa do zgłoszenia
 * (inna rola albo program nieukończony), ekran nie pyta o historię i nie
 * obiecuje wysyłki; historia wraca tylko wtedy, gdy osoba już ma zgłoszenia.
 *
 * Stan „program jeszcze nieukończony” stoi na szablonie `ListTemplate` (jedna
 * kolumna na każdej szerokości): wspólna karta stanu pustego (`EmptyStateCard`)
 * zajmuje całą szerokość treści, a historia zgłoszeń, jeśli osoba ją ma, stoi pod nią.
 * Na `DetailTemplate` (kolumny 7/5 od 1380 px) karta zajmowałaby tylko
 * kolumnę główną i stan pusty leżałby na lewo od środka treści.
 *
 * Formularz znika, gdy na liście jest zgłoszenie `new`: nowe zgłoszenie
 * trafia na początek TEJ SAMEJ tablicy, z której liczy się „otwarte”, więc
 * nie ma osobnej flagi, która mogłaby się z listą rozjechać.
 */
export function PoProgramieWspolpraca() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [tresc, setTresc] = useState("");
  const [wysylanie, setWysylanie] = useState(false);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let aktualne = true;
    wczytajStan()
      .then((wczytany) => {
        if (aktualne) setStan(wczytany);
      })
      .catch(() => {
        if (aktualne) setStan({ rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [proba]);

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  /** Ponowny odczyt historii po 409 — zgłoszenie oczekujące pojawia się na liście. */
  function odswiezHistorie() {
    pobierzMojeZgloszenia({ page: 1 })
      .then(({ data, meta }) => {
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy" ? { ...poprzedni, zgloszenia: data, meta } : poprzedni,
        );
      })
      .catch(() => undefined);
  }

  function zmienStrone(nowa: number) {
    pobierzMojeZgloszenia({ page: nowa })
      .then(({ data, meta }) => {
        setStan((poprzedni) =>
          poprzedni.rodzaj === "gotowy" ? { ...poprzedni, zgloszenia: data, meta } : poprzedni,
        );
      })
      .catch(() => setKomunikat("Nie udało się wczytać zgłoszeń. Spróbuj ponownie."));
  }

  async function wyslij() {
    if (wysylanie) return;
    setWysylanie(true);
    setKomunikat(null);
    setBledyPol(undefined);
    try {
      const nowe = await zglosWspolprace(tresc.trim());
      setStan((poprzedni) =>
        poprzedni.rodzaj === "gotowy"
          ? {
              ...poprzedni,
              zgloszenia: [nowe, ...poprzedni.zgloszenia],
              meta: poprzedni.meta && { ...poprzedni.meta, total: poprzedni.meta.total + 1 },
            }
          : poprzedni,
      );
      setTresc("");
      setToast("Zgłoszenie zostało wysłane.");
    } catch (blad: unknown) {
      const opis = sklasyfikujBladWysylki(blad);
      if (opis.rodzaj === "pola") {
        setBledyPol(opis.bledy);
      } else if (opis.rodzaj === "program-nieukonczony") {
        setStan((poprzedni) => (poprzedni.rodzaj === "gotowy" ? { ...poprzedni, program: "w-toku" } : poprzedni));
        setTresc("");
      } else if (opis.rodzaj === "otwarte") {
        setKomunikat(opis.komunikat);
        odswiezHistorie();
      } else {
        setKomunikat(opis.komunikat);
      }
    } finally {
      setWysylanie(false);
    }
  }

  const naglowek = {
    okruszki: OKRUSZKI,
    tytul: "Po programie",
    opis: "Zgłoszenie dalszej współpracy po zakończeniu programu i historia dotychczasowych zgłoszeń.",
    onPowrot: () => router.back(),
  };

  if (stan.rodzaj === "ladowanie") {
    return <DetailTemplate naglowek={naglowek} glowna={<Skeleton wiersze={4} />} wspierajaca={null} />;
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <DetailTemplate
        naglowek={naglowek}
        glowna={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Po programie"
            rola="uczestników"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
        wspierajaca={null}
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <DetailTemplate
        naglowek={naglowek}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać ekranu"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer jest nieosiągalny albo zwrócił błąd. Żadne dane nie zostały zmienione.
          </Notice>
        }
        wspierajaca={null}
      />
    );
  }

  const { program, rola, zakonczonoO, zgloszenia, meta } = stan;
  const maOtwarte = maOtwarteZgloszenie(zgloszenia);

  const stronicowanie =
    meta && meta.last_page > 1 ? (
      <Pagination
        strona={meta.current_page}
        stron={meta.last_page}
        naPoprzednia={() => zmienStrone(meta.current_page - 1)}
        naNastepna={() => zmienStrone(meta.current_page + 1)}
      />
    ) : undefined;

  const blokKomunikatu = komunikat ? (
    <Notice wariant="error" tytul="Nie udało się wysłać zgłoszenia">
      {komunikat}
    </Notice>
  ) : null;

  if (program === "w-toku") {
    return (
      <>
        <ListTemplate
          naglowek={<PageHeader {...naglowek} />}
          lista={
            <div className={style.stanPusty}>
              <EmptyStateCard
                naglowek="Ten ekran otworzy się po ukończeniu programu"
                tresc="Zgłoszenie dalszej współpracy będzie można wysłać po ukończeniu programu."
                przycisk={{ etykieta: "Przejdź do kursów", onClick: () => router.push("/panel/kursy") }}
              />
              <HistoriaZgloszen zgloszenia={zgloszenia} stronicowanie={stronicowanie} />
            </div>
          }
        />
        {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
      </>
    );
  }

  return (
    <>
      <DetailTemplate
        naglowek={naglowek}
        glowna={
          <>
            <KartaProgramuUkonczonego zakonczonoO={zakonczonoO} rola={rola} />
            {blokKomunikatu}
            {maOtwarte ? (
              <Notice wariant="info" tytul="Zgłoszenie w toku">
                Masz otwarte zgłoszenie. Poczekaj na odpowiedź.
              </Notice>
            ) : (
              <FormSection
                tytul="Zgłoszenie dalszej współpracy"
                pola={[
                  {
                    id: "wspolpraca-tresc",
                    etykieta: "Treść zgłoszenia",
                    rodzaj: "wieloliniowy",
                    wartosc: tresc,
                    onZmiana: (wartosc: string) => setTresc(wartosc.slice(0, LICZBA_ZNAKOW_MAX)),
                    blad: bledyPol?.body?.[0],
                    podpowiedz: `${tresc.length}/${LICZBA_ZNAKOW_MAX} znaków`,
                    wymagane: true,
                  },
                ]}
                etykietaZapisz={wysylanie ? "Wysyłanie…" : "Wyślij zgłoszenie"}
                etykietaAnuluj="Wyczyść"
                onAnuluj={() => {
                  setTresc("");
                  setBledyPol(undefined);
                  setKomunikat(null);
                }}
                onZapisz={() => void wyslij()}
              />
            )}
          </>
        }
        wspierajaca={
          <HistoriaZgloszen
            zgloszenia={zgloszenia}
            pusty="Nie masz jeszcze zgłoszeń. Zgłoszenia dalszej współpracy pojawią się tu po wysłaniu."
            stronicowanie={stronicowanie}
          />
        }
      />
      {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </>
  );
}
