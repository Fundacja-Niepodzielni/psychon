"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import {
  pobierzJa,
  pobierzMojeZgloszenia,
  zglosWspolprace,
  type CooperationRequest,
  type CooperationRequestStatus,
} from "@/lib/api/h01-wspolpraca";
import { useWPowloce } from "@/design-system/szablony/KontekstPowloki";
import style from "./PoProgramieWspolpraca.module.css";

/**
 * Korzeń ekranu. Poza powłoką panelu: `main` pod `id="tresc"` jak dotąd.
 * W powłoce (`DostawcaPowloki`) `main` niesie powłoka, więc tu jest zwykły `div`.
 */
function Korzen({ children }: { children: ReactNode }) {
  const wPowloce = useWPowloce();
  if (wPowloce) return <div className={style.uklad}>{children}</div>;
  return <main id="tresc" className={style.uklad}>{children}</main>;
}

type StanEkranu = "ladowanie" | "blad" | "ok";
type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

const LICZBA_ZNAKOW_MAX = 2000;

const PLAKIETKA_STATUSU: Record<CooperationRequestStatus, { wariant: WariantPlakietki; tekst: string }> = {
  new: { wariant: "pending", tekst: "Nowe" },
  answered: { wariant: "ok", tekst: "Z odpowiedzią" },
  closed: { wariant: "neutral", tekst: "Zamknięte" },
};

/** Jedna linia `Hint` łącząca datę złożenia oraz — gdy jest — treść
 * odpowiedzi administracji i jej datę (kontrakt H01: "przy odpowiedzi —
 * treść odpowiedzi i jej data"). Bez formatowania daty na coś innego niż
 * znacznik ISO z API — ten sam wybór co w innych ekranach nowego frontu
 * (np. `SuperwizjeTerminy.tsx`), które nie przeliczają dat serwera na
 * lokalny zapis w miejscach czysto informacyjnych. */
function opisZgloszenia(zgloszenie: CooperationRequest): string {
  const podstawa = `Złożono: ${zgloszenie.created_at ?? "brak daty"}.`;
  if (zgloszenie.response !== null && zgloszenie.responded_at !== null) {
    return `${podstawa} Odpowiedź (${zgloszenie.responded_at}): ${zgloszenie.response}`;
  }
  return podstawa;
}

/**
 * Trasa `/nowy-front/po-programie`, sekcja „Dalsza współpraca” (H01) —
 * trasy przyjęte bez zmian wobec stanu kodu.
 * `CooperationRequestController::store`/`mine`
 * (`backend/routes/api/h01.php:38-39`).
 *
 * Cztery stany trasy: `ladowanie`, `blad`, `ok` (dalej rozgałęzione przez
 * `zakazane`/`programUkonczony`/`maOtwarte` — pochodne z odpowiedzi, nigdy
 * osobny stan mogący się z nimi rozjechać). Formularz znika automatycznie,
 * gdy na liście własnych zgłoszeń jest pozycja `new` — także zaraz po 201,
 * bo nowe zgłoszenie trafia na początek TEJ SAMEJ tablicy, z której liczy
 * się `maOtwarte`; nie ma osobnej flagi „właśnie wysłano”, która mogłaby
 * się z listą rozjechać.
 *
 * Akcja wiersza `RecordList` (organizm wymaga jej dla każdego wiersza —
 * `WierszRecordList.akcja` nie jest opcjonalna) kopiuje treść zgłoszenia do
 * schowka: to jedyna czynność, jaką ma sens wykonać na własnym, tylko do
 * odczytu wpisie historii, bez dokładania nowej trasy API ani nowego atomu.
 *
 * Odczyt startowy biegnie z przeglądarki — ten sam powód co
 * `nowy-front/formy-stazu/dane.ts`: `@/auth` po stronie serwera nie wstaje
 * pod Vitest/jsdom na trasach statycznych.
 */
export function PoProgramieWspolpraca() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [zakazane, setZakazane] = useState(false);
  const [programUkonczony, setProgramUkonczony] = useState(false);
  const [zgloszenia, setZgloszenia] = useState<CooperationRequest[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>(undefined);
  const [tresc, setTresc] = useState("");
  const [wysylanie, setWysylanie] = useState(false);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [bladOgolny, setBladOgolny] = useState<string | null>(null);

  function wczytaj(strona: number, straz?: { anulowane: boolean }) {
    return Promise.all([pobierzJa(), pobierzMojeZgloszenia({ page: strona })])
      .then(([ja, mine]) => {
        if (straz?.anulowane) return;
        setProgramUkonczony(ja.program_completed_at !== null);
        setZakazane(false);
        setZgloszenia(mine.data);
        setMeta(mine.meta);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (straz?.anulowane) return;
        if (wyjatek instanceof ApiError && wyjatek.status === 403 && wyjatek.code === "forbidden") {
          setZakazane(true);
          setStan("ok");
          return;
        }
        setStan("blad");
      });
  }

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytaj(1, straz);
    return () => {
      straz.anulowane = true;
    };
    // Wyłącznie przy zamontowaniu — kolejne strony wczytuje `Pagination` niżej.
  }, []);

  async function wyslij() {
    setWysylanie(true);
    setBladOgolny(null);
    setBledyPol(undefined);
    try {
      const nowe = await zglosWspolprace(tresc.trim());
      setZgloszenia((poprzednie) => [nowe, ...poprzednie]);
      setTresc("");
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
      } else if (wyjatek instanceof ApiError) {
        setBladOgolny(wyjatek.message);
      } else {
        setBladOgolny("Nie udało się wysłać zgłoszenia. Spróbuj ponownie.");
      }
    } finally {
      setWysylanie(false);
    }
  }

  const maOtwarte = zgloszenia.some((zgloszenie) => zgloszenie.status === "new");

  const wiersze: WierszRecordList[] = zgloszenia.map((zgloszenie) => ({
    id: String(zgloszenie.id),
    tytul: zgloszenie.body,
    podpowiedz: opisZgloszenia(zgloszenie),
    plakietka: PLAKIETKA_STATUSU[zgloszenie.status],
    akcja: {
      etykieta: "Kopiuj treść",
      onKliknij: () => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(zgloszenie.body).catch(() => {});
        }
      },
    },
  }));

  const pola: PoleFormSection[] = [
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
  ];

  if (stan === "ladowanie") {
    return (
      <Korzen>
        <Heading stopien={1}>Dalsza współpraca</Heading>
        <Skeleton wiersze={4} />
      </Korzen>
    );
  }
  if (stan === "blad") {
    return (
      <Korzen>
        <Heading stopien={1}>Dalsza współpraca</Heading>
        <Text>Backend H01 nieosiągalny albo zwrócił błąd — spróbuj ponownie później.</Text>
      </Korzen>
    );
  }

  return (
    <Korzen>
      <PageHeader
        okruszki={[{ etykieta: "Po programie" }, { etykieta: "Dalsza współpraca" }]}
        tytul="Dalsza współpraca"
        opis="Zgłoszenie dalszej współpracy po zakończeniu programu i historia dotychczasowych zgłoszeń."
        onPowrot={() => router.back()}
      />

      {zakazane && (
        <Notice wariant="warn" tytul="Brak dostępu">
          Ta sekcja jest dostępna dla wolontariuszy i studentów.
        </Notice>
      )}

      {!zakazane && !programUkonczony && (
        <Notice wariant="info" tytul="Sekcja niedostępna">
          Zgłoszenie dalszej współpracy będzie dostępne po zakończeniu programu.
        </Notice>
      )}

      {!zakazane && programUkonczony && maOtwarte && (
        <Notice wariant="info" tytul="Zgłoszenie w toku">
          Masz otwarte zgłoszenie. Poczekaj na odpowiedź.
        </Notice>
      )}

      {!zakazane && programUkonczony && !maOtwarte && (
        <>
          {bladOgolny && (
            <Notice wariant="error" tytul="Nie udało się wysłać zgłoszenia">
              {bladOgolny}
            </Notice>
          )}
          <FormSection
            tytul="Zgłoszenie dalszej współpracy"
            pola={pola}
            etykietaZapisz={wysylanie ? "Wysyłanie…" : "Wyślij zgłoszenie"}
            etykietaAnuluj="Wyczyść"
            onAnuluj={() => {
              setTresc("");
              setBledyPol(undefined);
              setBladOgolny(null);
            }}
            onZapisz={() => {
              if (!wysylanie) void wyslij();
            }}
          />
        </>
      )}

      {!zakazane && (
        <>
          <RecordList
            tytul="Moje zgłoszenia"
            wiersze={wiersze}
            pusty={{
              naglowek: "Brak zgłoszeń",
              tresc: "Zgłoszenia dalszej współpracy pojawią się tu po wysłaniu.",
              przycisk: { etykieta: "Odśwież", onClick: () => void wczytaj(1) },
            }}
          />
          {meta && meta.last_page > 1 && (
            <Pagination
              strona={meta.current_page}
              stron={meta.last_page}
              naPoprzednia={() => void wczytaj(meta.current_page - 1)}
              naNastepna={() => void wczytaj(meta.current_page + 1)}
            />
          )}
        </>
      )}
    </Korzen>
  );
}
