"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { CaseCard } from "@/design-system/organizmy/CaseCard/CaseCard";
import { DetailTemplate } from "@/design-system/szablony/DetailTemplate/DetailTemplate";
import { PanelDecyzji } from "./PanelDecyzji";
import { ETYKIETY_ZALACZNIKOW, dataPl, pobierzZalacznik, poprawneId, wczytajWniosek, type Wniosek } from "./dane";
import style from "./ProfilDecyzja.module.css";

/**
 * Ekran szczegółu: pierwszy okruszek to pozycja menu, pod którą stoi ekran
 * (nazwa i adres jak w menu ramki administracji), ostatni — bieżąca pozycja.
 * W nowej ramce to jedyna droga powrotu (nagłówek nie ma tam „Wstecz”).
 */
const OKRUSZKI = [{ etykieta: "Profile psychologa", href: "/admin/profile" }, { etykieta: "Wniosek o profil" }];

type WariantStatusu = "neutral" | "ok" | "warn" | "error" | "pending";

const STATUS_WNIOSKU: Record<string, { wariant: WariantStatusu; etykieta: string }> = {
  draft: { wariant: "neutral", etykieta: "Wersja robocza" },
  submitted: { wariant: "pending", etykieta: "Czeka na decyzję" },
  returned: { wariant: "warn", etykieta: "Do poprawy" },
  accepted: { wariant: "ok", etykieta: "Zaakceptowany" },
  // Serwer zna też „published” (`AdminProfileController::VALID_STATUSES`), którego typ klienta nie wylicza.
  published: { wariant: "ok", etykieta: "Opublikowany" },
  withdrawn: { wariant: "neutral", etykieta: "Wycofany" },
};

function statusWniosku(status: string): { wariant: WariantStatusu; etykieta: string } {
  return STATUS_WNIOSKU[status] ?? { wariant: "neutral", etykieta: "Status nieznany" };
}

type Stan =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "gotowy"; wniosek: Wniosek };

interface WlasciwosciRamy {
  tytul: string;
  status?: { wariant: WariantStatusu; etykieta: string };
  wroc: () => void;
  glowna: ReactNode;
  wspierajaca?: ReactNode;
}

function Rama({ tytul, status, wroc, glowna, wspierajaca = null }: WlasciwosciRamy) {
  return (
    <DetailTemplate
      naglowek={{ okruszki: OKRUSZKI, tytul, status, onPowrot: wroc }}
      glowna={glowna}
      wspierajaca={wspierajaca}
    />
  );
}

/**
 * Ekran „Wniosek o profil — decyzja” na szablonie `DetailTemplate`: treść wniosku i załączniki
 * w kolumnie głównej, decyzja administracji w kolumnie wspierającej. Każdy stan — ładowanie,
 * dane, po decyzji, brak uprawnień, brak wniosku, błąd — renderuje się wewnątrz szablonu,
 * którego korzeń jest jedynym `main`. Odczyt i zapis biegną z przeglądarki tokenem osoby.
 */
export function ProfilDecyzja({ id }: { id: string }) {
  const router = useRouter();
  const wroc = () => router.back();
  const [stan, setStan] = useState<Stan>(() =>
    poprawneId(id) === null ? { rodzaj: "nie-znaleziono" } : { rodzaj: "ladowanie" },
  );
  const [proba, setProba] = useState(0);

  useEffect(() => {
    const idLiczba = poprawneId(id);
    if (idLiczba === null) return;
    let aktualne = true;
    void wczytajWniosek(idLiczba).then((wynik) => {
      if (!aktualne) return;
      if (wynik.rodzaj === "gotowy") setStan({ rodzaj: "gotowy", wniosek: wynik.wniosek });
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
        tytul="Wczytywanie wniosku"
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
        tytul="Wniosek o profil"
        wroc={wroc}
        glowna={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać wniosku"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Dane wniosku nie są zmyślane bez odpowiedzi.
          </Notice>
        }
      />
    );
  }
  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <Rama
        tytul="Wniosek o profil"
        wroc={wroc}
        glowna={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Wniosek jest niedostępny"
            rola="administracji"
            przycisk={{ etykieta: "Wróć do listy", onClick: wroc }}
          />
        }
      />
    );
  }
  if (stan.rodzaj === "nie-znaleziono") {
    return (
      <Rama
        tytul="Wniosek o profil"
        wroc={wroc}
        glowna={
          <EmptyState
            naglowek="Nie znaleziono wniosku"
            tresc="Wniosku o tym numerze nie ma na liście albo został usunięty."
            przycisk={{ etykieta: "Wróć do listy", onClick: wroc }}
          />
        }
      />
    );
  }
  return <Widok poczatkowy={stan.wniosek} wroc={wroc} odswiez={ponow} />;
}

interface WlasciwosciWidoku {
  poczatkowy: Wniosek;
  wroc: () => void;
  odswiez: () => void;
}

function Widok({ poczatkowy, wroc, odswiez }: WlasciwosciWidoku) {
  const [wniosek, setWniosek] = useState(poczatkowy);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [bladZalacznika, setBladZalacznika] = useState<string | null>(null);
  const zamknijToast = useCallback(() => setKomunikat(null), []);

  async function otworz(adres: string, nazwa: string) {
    setBladZalacznika(null);
    const wynik = await pobierzZalacznik(adres, nazwa);
    if (wynik.rodzaj === "blad") setBladZalacznika(wynik.komunikat);
  }

  const nazwa = `${wniosek.user.first_name} ${wniosek.user.last_name}`;

  return (
    <Rama
      tytul={`Wniosek o profil: ${nazwa}`}
      status={statusWniosku(wniosek.status)}
      wroc={wroc}
      glowna={
        <div className={style.kolumna}>
          <CaseCard
            rodzaj="podstawowa"
            tytul={nazwa}
            pary={[
              { etykieta: "Miasto", wartosc: wniosek.city ?? "" },
              { etykieta: "Podejście", wartosc: wniosek.approach ?? "" },
              { etykieta: "Specjalizacje", wartosc: (wniosek.specializations ?? []).join(", ") },
              {
                etykieta: "Zgoda na publikację profilu",
                wartosc: wniosek.publication_consent_granted ? "udzielona" : "brak",
              },
              { etykieta: "Złożono", wartosc: dataPl(wniosek.created_at) },
            ]}
          />
          <section className={style.sekcja}>
            <Heading stopien={2}>Opis własny</Heading>
            {wniosek.bio ? (
              <div className={style.tresc}>
                <Text>{wniosek.bio}</Text>
              </div>
            ) : (
              <Text>Wniosek nie zawiera opisu.</Text>
            )}
          </section>
          <section className={style.sekcja}>
            <Heading stopien={2}>Załączniki wniosku</Heading>
            {wniosek.documents.length === 0 ? (
              <Text>Wniosek nie ma załączników.</Text>
            ) : (
              <>
                <Text>Każde otwarcie załącznika jest zapisywane w dzienniku działań.</Text>
                {bladZalacznika && (
                  <Notice wariant="error" tytul="Nie udało się pobrać załącznika">
                    {bladZalacznika}
                  </Notice>
                )}
                <ul className={style.zalaczniki}>
                  {wniosek.documents.map((dokument) => (
                    <li key={dokument.id} className={style.zalacznik}>
                      <Text>{`${ETYKIETY_ZALACZNIKOW[dokument.type]}, dodano ${dataPl(dokument.uploaded_at)}`}</Text>
                      <Button
                        poziom="outline"
                        aria-label={`Pobierz załącznik: ${ETYKIETY_ZALACZNIKOW[dokument.type]}`}
                        onClick={() =>
                          void otworz(dokument.download_url, `${dokument.type}-${dokument.id}`)
                        }
                      >
                        Pobierz
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {komunikat && <Toast komunikat={komunikat} onZamknij={zamknijToast} />}
        </div>
      }
      wspierajaca={
        <PanelDecyzji
          wniosek={wniosek}
          odswiez={odswiez}
          onRozstrzygniety={(rozstrzygniety) => {
            setWniosek(rozstrzygniety);
            setKomunikat(
              rozstrzygniety.status === "accepted" ? "Wniosek zaakceptowany." : "Wniosek odesłany do poprawy.",
            );
          }}
        />
      }
    />
  );
}
