"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { rowneWartosci } from "@/nowy-front/wspolne/rowne-wartosci";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Label } from "@/design-system/atomy/Label/Label";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { ErrorText } from "@/design-system/atomy/ErrorText/ErrorText";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { TableTemplate } from "@/design-system/szablony/TableTemplate/TableTemplate";
import { Field } from "@/design-system/molekuly/Field/Field";
import { DialogActions } from "@/design-system/molekuly/DialogActions/DialogActions";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { ApiError } from "@/lib/api/klient";
import { formatujDateICzas } from "../wspolne/daty";
import { odmien } from "../wspolne/odmiana";
import {
  cancelAdminSupervisionSlot,
  fetchAdminSupervisionSlots,
  updateAdminSupervisionSlot,
  type AdminSupervisionSlot,
} from "@/lib/api/h12";
import { TabelaTerminow } from "./TabelaTerminow";
import style from "./SuperwizjeTerminy.module.css";

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";

interface StanFormularza {
  /** Wartość natywnego `<input type="datetime-local">` — czas LOKALNY
   * przeglądarki, bez strefy w zapisie. Konwersja do UTC dopiero przy
   * wysyłce, patrz `lokalnyWpisNaIsoUtc`. */
  starts_at_lokalnie: string;
  duration_minutes: string;
  seats_limit: string;
  location_or_link: string;
}

interface BladListy {
  tekst: string;
  /** Odmowa stanu terminu — obok zdania serwera stoi „Wczytaj terminy ponownie”. */
  przeladuj: boolean;
}

/**
 * Konwertuje znacznik UTC z API (`"2026-10-03T12:00:00Z"`) na wartość
 * gotową dla `<input type="datetime-local">` w czasie LOKALNYM przeglądarki
 * — używa getterów lokalnych (`getHours`, nie `getUTCHours`) celowo: to jest
 * dokładnie to, co ma zobaczyć osoba edytująca termin na własnym zegarze.
 * Nieprawidłowy znacznik wejściowy zwraca pusty string zamiast rzucać.
 */
function isoUtcNaLokalnyWpis(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const dwie = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${dwie(data.getMonth() + 1)}-${dwie(data.getDate())}T${dwie(data.getHours())}:${dwie(data.getMinutes())}`;
}

/**
 * Odwrotność `isoUtcNaLokalnyWpis`: wartość `datetime-local` (bez strefy —
 * silnik JS parsuje taki zapis jako czas LOKALNY, zgodnie ze specyfikacją
 * `Date`) na znacznik UTC dla API. Pusty albo niesparsowalny wpis wraca BEZ
 * zmian — trafia do serwera dosłownie, żeby walidacja (`starts_at.date`)
 * naprawdę go zobaczyła, zamiast frontu po cichu decydującego, że „to na
 * pewno teraz".
 */
function lokalnyWpisNaIsoUtc(wpis: string): string {
  const oczyszczony = wpis.trim();
  if (oczyszczony === "") return oczyszczony;
  const data = new Date(oczyszczony);
  if (Number.isNaN(data.getTime())) return oczyszczony;
  return data.toISOString();
}

function formularzZTerminu(slot: AdminSupervisionSlot): StanFormularza {
  return {
    starts_at_lokalnie: isoUtcNaLokalnyWpis(slot.starts_at),
    duration_minutes: String(slot.duration_minutes),
    seats_limit: String(slot.seats_limit),
    location_or_link: slot.location_or_link ?? "",
  };
}

/** Treść okna potwierdzenia odwołania — liczba osób z `active_signups_count`. */
export function trescPotwierdzeniaOdwolania(zapisane: number): string {
  if (zapisane === 0) return "Nikt nie jest zapisany na ten termin.";
  return `Zapisane osoby: ${zapisane}. Każda dostanie powiadomienie. Termin zostanie na liście ze stanem „Odwołany”.`;
}

/** Zdanie po odwołaniu — liczba z odpowiedzi serwera (`signups_released`). */
export function zdaniePoOdwolaniu(powiadomione: number): string {
  if (powiadomione === 0) return "Termin odwołany. Nikt nie był zapisany.";
  return `Termin odwołany. Powiadomiono ${powiadomione} ${odmien(powiadomione, "osobę", "osoby", "osób")}.`;
}

/** Odmowa stanu terminu (409 odwołany, 422 rozpoczęty): lista na ekranie jest
 * nieaktualna, więc obok zdania serwera stoi „Wczytaj terminy ponownie”. */
function odmowaStanuTerminu(wyjatek: unknown): boolean {
  return wyjatek instanceof ApiError && (wyjatek.status === 409 || wyjatek.status === 422);
}

/**
 * Trasa `/nowy-front/admin/superwizje` — edycja i odwołanie terminów
 * superwizji (H12), `AdminSupervisionController::updateSlot`/`cancelSlot`
 * (`backend/routes/api/h12.php:47-49`). Dotychczasowy ekran administracji
 * (`components/h12`, `lib/api/h12.ts:fetchAdminSupervisionSlots`) jest
 * TYLKO DO ODCZYTU — ta trasa dodaje zapis wobec ISTNIEJĄCYCH tras.
 *
 * Układ: `TableTemplate` — nagłówek, informacja zwrotna (powiadomienie,
 * odmowa), tabela terminów z kolumną akcji (`TabelaTerminow`: „Edytuj” i
 * „Odwołaj termin” w wierszu), pod tabelą panel edycji. Odwołany termin
 * zostaje w tabeli z plakietką „Odwołany” i bez akcji. Odwołanie zawsze
 * przechodzi przez okno `Dialog` z liczbą zapisanych osób.
 *
 * `starts_at` edytuje się przez natywny `<input type="datetime-local">` w
 * czasie lokalnym przeglądarki — konwersja do/z UTC żyje w
 * `isoUtcNaLokalnyWpis`/`lokalnyWpisNaIsoUtc` powyżej. Złożenie z gotowych
 * atomów `Label`/`Hint`/`ErrorText` (jak `Field`), bo żaden istniejący
 * `rodzaj` pola `Field` nie łączy daty z godziną w jednym natywnym
 * elemencie — dopisywanie nowego atomu współdzielonego wyłącznie dla tego
 * ekranu byłoby zmianą poza jego zakresem.
 *
 * Odczyt startowy biegnie z przeglądarki (`fetchAdminSupervisionSlots`) —
 * powód identyczny jak w `nowy-front/formy-stazu/FormyStazu.tsx`: `@/auth`
 * po stronie serwera nie wstaje pod Vitest/jsdom na trasach statycznych.
 */
export function SuperwizjeTerminy() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [terminy, setTerminy] = useState<AdminSupervisionSlot[]>([]);
  const [edytowanyId, setEdytowanyId] = useState<number | null>(null);
  const [formularz, setFormularz] = useState<StanFormularza | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [bladStanuEdycji, setBladStanuEdycji] = useState(false);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [doOdwolania, setDoOdwolania] = useState<AdminSupervisionSlot | null>(null);
  const [odwolywanie, setOdwolywanie] = useState(false);
  const [bladListy, setBladListy] = useState<BladListy | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Otwarty formularz bez żadnej zmiany nie jest niezapisaną pracą.
  const edytowanyTermin = edytowanyId === null ? undefined : terminy.find((termin) => termin.id === edytowanyId);
  useZgloszenieNiezapisanychZmian(
    formularz !== null && edytowanyTermin !== undefined && !rowneWartosci(formularz, formularzZTerminu(edytowanyTermin)),
    "Terminy superwizji",
  );

  /** Wspólny rdzeń wczytania listy — wywoływany przy montowaniu, przez
   * przycisk „Odśwież" w pustym stanie, „Spróbuj ponownie” po błędzie
   * i „Wczytaj terminy ponownie” po odmowie stanu terminu. Bez wspólnej
   * funkcji przycisk wywoływałby `router.refresh()`, który tu nic nie robi:
   * dane płyną z efektu klienckiego, nie z serwerowego renderu. */
  function wczytajTerminy(strazAnulowania?: { anulowane: boolean }) {
    return fetchAdminSupervisionSlots()
      .then(({ data }) => {
        if (strazAnulowania?.anulowane) return;
        setTerminy(data);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (strazAnulowania?.anulowane) return;
        setStan(wyjatek instanceof ApiError && wyjatek.status === 403 ? "brak-uprawnien" : "blad");
      });
  }

  useEffect(() => {
    const straz = { anulowane: false };
    void wczytajTerminy(straz);
    return () => {
      straz.anulowane = true;
    };
  }, []);

  const posortowane = useMemo(
    () => terminy.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [terminy],
  );

  function zamknijPanel() {
    setEdytowanyId(null);
    setFormularz(null);
    setBlad(null);
    setBladStanuEdycji(false);
    setBledyPol(undefined);
  }

  function wczytajPonownie() {
    setBladListy(null);
    zamknijPanel();
    void wczytajTerminy();
  }

  function otworzEdycje(termin: AdminSupervisionSlot) {
    setToast(null);
    setBladListy(null);
    setBlad(null);
    setBladStanuEdycji(false);
    setBledyPol(undefined);
    setEdytowanyId(termin.id);
    setFormularz(formularzZTerminu(termin));
  }

  function otworzOdwolanie(termin: AdminSupervisionSlot) {
    setToast(null);
    setBladListy(null);
    setDoOdwolania(termin);
  }

  async function zapisz() {
    if (edytowanyId === null || formularz === null) return;
    setZapisywanie(true);
    setToast(null);
    setBlad(null);
    setBladStanuEdycji(false);
    setBledyPol(undefined);
    // Puste albo nieliczbowe pole trafia do serwera dosłownie — bez cichej
    // zamiany na „brak zmiany" (`undefined`), żeby walidacja serwera
    // (`duration_minutes.integer`/`seats_limit.integer`) naprawdę zobaczyła,
    // co wpisano.
    const wpisanyCzasTrwania = formularz.duration_minutes.trim();
    const wpisanyLimitMiejsc = formularz.seats_limit.trim();
    try {
      const zaktualizowany = await updateAdminSupervisionSlot(edytowanyId, {
        starts_at: lokalnyWpisNaIsoUtc(formularz.starts_at_lokalnie),
        duration_minutes: /^\d+$/.test(wpisanyCzasTrwania) ? Number(wpisanyCzasTrwania) : wpisanyCzasTrwania,
        seats_limit: /^\d+$/.test(wpisanyLimitMiejsc) ? Number(wpisanyLimitMiejsc) : wpisanyLimitMiejsc,
        location_or_link: formularz.location_or_link.trim() === "" ? null : formularz.location_or_link.trim(),
      });
      setTerminy((poprzednie) =>
        poprzednie.map((termin) => (termin.id === zaktualizowany.id ? zaktualizowany : termin)),
      );
      zamknijPanel();
      setToast("Zapisano zmiany terminu superwizji.");
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
        setBlad(wyjatek.message);
      } else {
        setBledyPol(undefined);
        setBladStanuEdycji(odmowaStanuTerminu(wyjatek));
        setBlad(
          wyjatek instanceof ApiError
            ? wyjatek.message
            : "Nie udało się zapisać terminu. Spróbuj ponownie.",
        );
      }
    } finally {
      setZapisywanie(false);
    }
  }

  async function odwolaj(termin: AdminSupervisionSlot) {
    setOdwolywanie(true);
    setToast(null);
    setBladListy(null);
    try {
      const wynik = await cancelAdminSupervisionSlot(termin.id);
      // Wiersz zostaje — ze stanem „Odwołany”, bez aktywnych zapisów.
      setTerminy((poprzednie) =>
        poprzednie.map((t) =>
          t.id === termin.id
            ? {
                ...t,
                status: "cancelled" as const,
                cancelled_at: wynik.cancelled_at,
                active_signups_count: 0,
                available_seats: t.seats_limit,
                signups: [],
              }
            : t,
        ),
      );
      if (edytowanyId === termin.id) zamknijPanel();
      setToast(zdaniePoOdwolaniu(wynik.signups_released));
    } catch (wyjatek) {
      setBladListy({
        tekst:
          wyjatek instanceof ApiError
            ? wyjatek.message
            : "Nie udało się odwołać terminu. Spróbuj ponownie.",
        przeladuj: odmowaStanuTerminu(wyjatek),
      });
    } finally {
      setOdwolywanie(false);
      setDoOdwolania(null);
    }
  }

  if (stan === "ladowanie") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Terminy superwizji</Heading>
        <Skeleton wiersze={4} />
      </main>
    );
  }
  if (stan === "brak-uprawnien") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Terminy superwizji</Heading>
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Terminy superwizji dla administracji"
          rola="administracji"
          przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
        />
      </main>
    );
  }
  if (stan === "blad") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Terminy superwizji</Heading>
        <Text>Nie udało się wczytać terminów.</Text>
        <div>
          <Button
            poziom="outline"
            onClick={() => {
              setStan("ladowanie");
              void wczytajTerminy();
            }}
          >
            Spróbuj ponownie
          </Button>
        </div>
      </main>
    );
  }

  const informacjaZwrotna =
    toast || bladListy ? (
      <>
        {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
        {bladListy && (
          <Notice
            wariant="error"
            tytul="Nie udało się odwołać terminu"
            akcja={
              bladListy.przeladuj ? (
                <Button poziom="outline" onClick={wczytajPonownie}>
                  Wczytaj terminy ponownie
                </Button>
              ) : undefined
            }
          >
            {bladListy.tekst}
          </Notice>
        )}
      </>
    ) : undefined;

  const panelEdycji =
    edytowanyId !== null && formularz !== null ? (
      <div className={style.panel}>
        <Heading stopien={3}>Edytuj termin</Heading>

        {blad && (
          <Notice
            wariant="error"
            tytul="Nie udało się zapisać"
            akcja={
              bladStanuEdycji ? (
                <Button poziom="outline" onClick={wczytajPonownie}>
                  Wczytaj terminy ponownie
                </Button>
              ) : undefined
            }
          >
            {blad}
          </Notice>
        )}

        <div className={style.pole}>
          <Label htmlFor="termin-starts-at" dzieci="Data i godzina spotkania" wymagane />
          <input
            id="termin-starts-at"
            type="datetime-local"
            className={style.inputNatywny}
            value={formularz.starts_at_lokalnie}
            onChange={(zdarzenie) =>
              setFormularz((f) => (f ? { ...f, starts_at_lokalnie: zdarzenie.target.value } : f))
            }
            aria-invalid={Boolean(bledyPol?.starts_at?.[0]) || undefined}
            aria-describedby="termin-starts-at-podpowiedz termin-starts-at-blad"
            required
          />
          <Hint id="termin-starts-at-podpowiedz">Czas lokalny Twojej przeglądarki.</Hint>
          <ErrorText id="termin-starts-at-blad">{bledyPol?.starts_at?.[0]}</ErrorText>
        </div>
        <div className={style.wiersz}>
          <Field
            id="termin-czas-trwania"
            etykieta="Czas trwania (minuty)"
            rodzaj="liczba"
            wartosc={formularz.duration_minutes}
            onZmiana={(wartosc) => setFormularz((f) => (f ? { ...f, duration_minutes: wartosc } : f))}
            blad={bledyPol?.duration_minutes?.[0]}
          />
          <Field
            id="termin-limit-miejsc"
            etykieta="Limit miejsc"
            rodzaj="liczba"
            wartosc={formularz.seats_limit}
            onZmiana={(wartosc) => setFormularz((f) => (f ? { ...f, seats_limit: wartosc } : f))}
            blad={bledyPol?.seats_limit?.[0]}
          />
        </div>
        <Field
          id="termin-lokalizacja"
          etykieta="Lokalizacja albo odnośnik"
          rodzaj="tekst"
          wartosc={formularz.location_or_link}
          onZmiana={(wartosc) => setFormularz((f) => (f ? { ...f, location_or_link: wartosc } : f))}
          blad={bledyPol?.location_or_link?.[0]}
        />

        <DialogActions
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia={zapisywanie ? "Zapisywanie…" : "Zapisz"}
          onWycofaj={zamknijPanel}
          onPotwierdz={() => {
            if (!zapisywanie) void zapisz();
          }}
        />
      </div>
    ) : undefined;

  return (
    <>
      <TableTemplate
        naglowek={
          <PageHeader
            okruszki={[{ etykieta: "Administracja" }, { etykieta: "Terminy superwizji" }]}
            tytul="Terminy superwizji"
            opis="Edycja i odwołanie terminów wszystkich prowadzących. Zapisy są tylko do odczytu."
            onPowrot={() => router.back()}
          />
        }
        zdanie={informacjaZwrotna}
        tabela={
          posortowane.length === 0 ? (
            <EmptyState
              naglowek="Brak terminów"
              tresc="Terminy pojawią się tu, gdy prowadzący je utworzą."
              przycisk={{ etykieta: "Odśwież", onClick: () => void wczytajTerminy() }}
            />
          ) : (
            <TabelaTerminow
              terminy={posortowane}
              onEdytuj={otworzEdycje}
              onOdwolaj={otworzOdwolanie}
              akcjeZablokowane={odwolywanie}
            />
          )
        }
        wsparcie={panelEdycji}
      />

      {doOdwolania && (
        <Dialog
          tytul={`Odwołać termin ${formatujDateICzas(doOdwolania.starts_at)}?`}
          etykietaWycofania="Nie odwołuj"
          etykietaPotwierdzenia={odwolywanie ? "Odwoływanie…" : "Odwołaj termin"}
          niebezpieczne
          onWycofaj={() => {
            if (!odwolywanie) setDoOdwolania(null);
          }}
          onPotwierdz={() => {
            if (!odwolywanie) void odwolaj(doOdwolania);
          }}
        >
          <Text>{trescPotwierdzeniaOdwolania(doOdwolania.active_signups_count)}</Text>
        </Dialog>
      )}
    </>
  );
}
