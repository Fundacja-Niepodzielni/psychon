"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { Field } from "@/design-system/molekuly/Field/Field";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import {
  pobierzZgloszeniaAdministracji,
  odpowiedzNaZgloszenie,
  type AdminCooperationRequest,
  type CooperationRequestStatus,
} from "@/lib/api/h01-wspolpraca";
import style from "./ZgloszeniaWspolpracy.module.css";

type StanEkranu = "ladowanie" | "blad" | "ok";
type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";
type FiltrStatusu = CooperationRequestStatus | "";

const LICZBA_ZNAKOW_MAX = 2000;

const PLAKIETKA_STATUSU: Record<CooperationRequestStatus, { wariant: WariantPlakietki; tekst: string }> = {
  new: { wariant: "pending", tekst: "Nowe" },
  answered: { wariant: "ok", tekst: "Z odpowiedzią" },
  closed: { wariant: "neutral", tekst: "Zamknięte" },
};

const OPCJE_FILTRA = [
  { wartosc: "", etykieta: "Wszystkie" },
  { wartosc: "new", etykieta: "Nowe" },
  { wartosc: "answered", etykieta: "Z odpowiedzią" },
  { wartosc: "closed", etykieta: "Zamknięte" },
];

interface StanFormularzaOdpowiedzi {
  response: string;
  status: "answered" | "closed";
}

const PUSTY_FORMULARZ: StanFormularzaOdpowiedzi = { response: "", status: "answered" };

/**
 * Trasa `/nowy-front/admin/zgloszenia-wspolpracy` (H01) —
 * `AdminCooperationRequestController::index`/`respond`
 * (`backend/routes/api/h01.php:41-43`).
 *
 * Lista jest złożona wprost z atomów (`Badge`/`Text`/`Hint`/`Button`), nie z
 * `RecordList` — ten organizm wymaga JEDNEJ akcji na wiersz
 * (`WierszRecordList.akcja` nie jest opcjonalna), a tu wiersz `closed` ma
 * mieć ZERO przycisków (kontrakt: „przy `closed` przycisku NIE ma”), nie
 * jeden nieaktywny. Treść zgłoszenia renderuje się w całości, zawijana
 * (`.tresc` w module CSS), bez obcinania znakami.
 *
 * Odczyt startowy biegnie z przeglądarki — ten sam powód co
 * `nowy-front/formy-stazu/dane.ts`.
 */
export function ZgloszeniaWspolpracy() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [zakazane, setZakazane] = useState(false);
  const [filtr, setFiltr] = useState<FiltrStatusu>("");
  const [zgloszenia, setZgloszenia] = useState<AdminCooperationRequest[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>(undefined);

  const [otwartyId, setOtwartyId] = useState<number | null>(null);
  const [formularz, setFormularz] = useState<StanFormularzaOdpowiedzi>(PUSTY_FORMULARZ);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [bladDialogu, setBladDialogu] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);

  function wczytaj(filtrWartosc: FiltrStatusu, strona: number, straz?: { anulowane: boolean }) {
    return pobierzZgloszeniaAdministracji({
      status: filtrWartosc === "" ? undefined : filtrWartosc,
      page: strona,
    })
      .then(({ data, meta: metaOdpowiedzi }) => {
        if (straz?.anulowane) return;
        setZakazane(false);
        setZgloszenia(data);
        setMeta(metaOdpowiedzi);
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
    void wczytaj(filtr, 1, straz);
    return () => {
      straz.anulowane = true;
    };
    // Wyłącznie przy zamontowaniu — zmiana filtra i stronicowanie wołają
    // `wczytaj` wprost, z aktualnym filtrem/stroną w domknięciu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function naZmianeFiltra(wartosc: string) {
    const nowyFiltr = wartosc as FiltrStatusu;
    setFiltr(nowyFiltr);
    void wczytaj(nowyFiltr, 1);
  }

  function otworzDialog(zgloszenie: AdminCooperationRequest) {
    setOtwartyId(zgloszenie.id);
    setFormularz(PUSTY_FORMULARZ);
    setBledyPol(undefined);
    setBladDialogu(null);
  }

  function zamknijDialog() {
    setOtwartyId(null);
    setFormularz(PUSTY_FORMULARZ);
    setBledyPol(undefined);
    setBladDialogu(null);
  }

  async function zapisz() {
    if (otwartyId === null) return;
    setZapisywanie(true);
    setBladDialogu(null);
    setBledyPol(undefined);
    try {
      const zaktualizowany = await odpowiedzNaZgloszenie(otwartyId, {
        response: formularz.response.trim(),
        status: formularz.status,
      });
      setZgloszenia((poprzednie) =>
        poprzednie.map((zgloszenie) => (zgloszenie.id === zaktualizowany.id ? zaktualizowany : zgloszenie)),
      );
      zamknijDialog();
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
      } else if (wyjatek instanceof ApiError && wyjatek.status === 403 && wyjatek.code === "cooperation_request_closed") {
        setBladDialogu(wyjatek.message);
        void wczytaj(filtr, meta?.current_page ?? 1);
      } else if (wyjatek instanceof ApiError && wyjatek.status === 404) {
        setBladDialogu("Zgłoszenie nie istnieje.");
        void wczytaj(filtr, meta?.current_page ?? 1);
      } else if (wyjatek instanceof ApiError) {
        setBladDialogu(wyjatek.message);
      } else {
        setBladDialogu("Nie udało się zapisać odpowiedzi. Spróbuj ponownie.");
      }
    } finally {
      setZapisywanie(false);
    }
  }

  if (stan === "ladowanie") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Zgłoszenia dalszej współpracy</Heading>
        <Skeleton wiersze={4} />
      </main>
    );
  }
  if (stan === "blad") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Zgłoszenia dalszej współpracy</Heading>
        <Text>Backend H01 nieosiągalny albo zwrócił błąd — spróbuj ponownie później.</Text>
      </main>
    );
  }

  if (zakazane) {
    return (
      <main id="tresc" className={style.uklad}>
        <PageHeader
          okruszki={[{ etykieta: "Administracja" }, { etykieta: "Zgłoszenia dalszej współpracy" }]}
          tytul="Zgłoszenia dalszej współpracy"
          onPowrot={() => router.back()}
        />
        <Notice wariant="warn" tytul="Brak dostępu">
          Brak uprawnień do obsługi zgłoszeń.
        </Notice>
      </main>
    );
  }

  return (
    <main id="tresc" className={style.uklad}>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Zgłoszenia dalszej współpracy" }]}
        tytul="Zgłoszenia dalszej współpracy"
        opis="Zgłoszenia osób po zakończeniu programu — odczyt i odpowiedź (H01)."
        onPowrot={() => router.back()}
        dzieci={
          <div className={style.filtr}>
            <Field
              id="zgloszenia-filtr-status"
              etykieta="Status"
              rodzaj="wybor"
              opcje={OPCJE_FILTRA}
              wartosc={filtr}
              onZmiana={naZmianeFiltra}
            />
          </div>
        }
      />

      {zgloszenia.length === 0 ? (
        <EmptyState
          naglowek="Brak zgłoszeń"
          tresc="Dla wybranego filtra nie ma dziś żadnych zgłoszeń."
          przycisk={{ etykieta: "Odśwież", onClick: () => void wczytaj(filtr, meta?.current_page ?? 1) }}
        />
      ) : (
        <ul className={style.lista} aria-label="Zgłoszenia dalszej współpracy">
          {zgloszenia.map((zgloszenie) => (
            <li key={zgloszenie.id} className={style.wiersz}>
              <div className={style.naglowekWiersza}>
                <Text>
                  {zgloszenie.user
                    ? `${zgloszenie.user.first_name} ${zgloszenie.user.last_name}`
                    : "Osoba nieznana"}
                </Text>
                <Badge wariant={PLAKIETKA_STATUSU[zgloszenie.status].wariant}>
                  {PLAKIETKA_STATUSU[zgloszenie.status].tekst}
                </Badge>
              </div>
              <Hint>
                {(zgloszenie.user?.email ?? "brak e-maila")} — {zgloszenie.created_at ?? "brak daty"}
              </Hint>
              <div className={style.tresc}>
                <Text>{zgloszenie.body}</Text>
              </div>
              {zgloszenie.status !== "closed" && (
                <Button poziom="outline" onClick={() => otworzDialog(zgloszenie)}>
                  Odpowiedz
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {meta && meta.last_page > 1 && (
        <Pagination
          strona={meta.current_page}
          stron={meta.last_page}
          naPoprzednia={() => void wczytaj(filtr, meta.current_page - 1)}
          naNastepna={() => void wczytaj(filtr, meta.current_page + 1)}
        />
      )}

      {otwartyId !== null && (
        <Dialog
          tytul="Odpowiedz na zgłoszenie"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia={zapisywanie ? "Zapisywanie…" : "Zapisz odpowiedź"}
          onWycofaj={zamknijDialog}
          onPotwierdz={() => {
            if (!zapisywanie) void zapisz();
          }}
        >
          {bladDialogu && (
            <Notice wariant="error" tytul="Nie udało się zapisać odpowiedzi">
              {bladDialogu}
            </Notice>
          )}
          <Field
            id="odpowiedz-tresc"
            etykieta="Odpowiedź"
            rodzaj="wieloliniowy"
            wartosc={formularz.response}
            onZmiana={(wartosc) =>
              setFormularz((f) => ({ ...f, response: wartosc.slice(0, LICZBA_ZNAKOW_MAX) }))
            }
            blad={bledyPol?.response?.[0]}
            podpowiedz={`${formularz.response.length}/${LICZBA_ZNAKOW_MAX} znaków`}
            wymagane
          />
          <Field
            id="odpowiedz-status"
            etykieta="Status po odpowiedzi"
            rodzaj="wybor"
            opcje={[
              { wartosc: "answered", etykieta: "Z odpowiedzią" },
              { wartosc: "closed", etykieta: "Zamknięte" },
            ]}
            wartosc={formularz.status}
            onZmiana={(wartosc) => setFormularz((f) => ({ ...f, status: wartosc as "answered" | "closed" }))}
            blad={bledyPol?.status?.[0]}
            wymagane
          />
        </Dialog>
      )}
    </main>
  );
}
