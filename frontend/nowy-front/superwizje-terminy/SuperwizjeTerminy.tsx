"use client";

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
import { RecordList, type WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { Field } from "@/design-system/molekuly/Field/Field";
import { DialogActions } from "@/design-system/molekuly/DialogActions/DialogActions";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { ApiError } from "@/lib/api/klient";
import {
  cancelAdminSupervisionSlot,
  fetchAdminSupervisionSlots,
  updateAdminSupervisionSlot,
  type AdminSupervisionSlot,
} from "@/lib/api/h12";
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

/**
 * Trasa `/nowy-front/admin/superwizje` — edycja i odwołanie terminów
 * superwizji (H12), `AdminSupervisionController::updateSlot`/`cancelSlot`
 * (`backend/routes/api/h12.php:47-49`). Dotychczasowy ekran administracji
 * (`components/h12`, `lib/api/h12.ts:fetchAdminSupervisionSlots`) jest
 * TYLKO DO ODCZYTU — ta trasa dodaje zapis wobec ISTNIEJĄCYCH tras, bez
 * dotykania starego frontu.
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
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [odwolywanyId, setOdwolywanyId] = useState<number | null>(null);
  const [potwierdzOdwolanie, setPotwierdzOdwolanie] = useState(false);

  /** Wspólny rdzeń wczytania listy — wywoływany przy montowaniu I przez
   * przycisk „Odśwież" w pustym stanie (patrz `pusty.przycisk` niżej). Bez
   * wspólnej funkcji przycisk wywoływałby `router.refresh()`, który tu nic
   * nie robi: dane płyną z efektu klienckiego, nie z serwerowego renderu. */
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

  const wiersze: WierszRecordList[] = useMemo(
    () =>
      terminy
        .slice()
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((termin) => {
          const pelny = termin.available_seats === 0;
          const superwizor = termin.supervisor
            ? `${termin.supervisor.first_name} ${termin.supervisor.last_name}`
            : "Bez przypisanego prowadzącego";
          return {
            id: String(termin.id),
            tytul: `${termin.starts_at} — ${superwizor}`,
            podpowiedz: termin.location_or_link ?? "Bez podanej lokalizacji.",
            plakietka: pelny
              ? { wariant: "warn" as const, tekst: "Brak wolnych miejsc" }
              : { wariant: "neutral" as const, tekst: "Wolne miejsca" },
            wartosc: termin.active_signups_count,
            akcja: {
              etykieta: "Edytuj",
              onKliknij: () => otworzEdycje(termin),
            },
          };
        }),
    [terminy],
  );

  function otworzEdycje(termin: AdminSupervisionSlot) {
    setBlad(null);
    setBledyPol(undefined);
    setPotwierdzOdwolanie(false);
    setEdytowanyId(termin.id);
    setFormularz(formularzZTerminu(termin));
  }

  function zamknijPanel() {
    setEdytowanyId(null);
    setFormularz(null);
    setBlad(null);
    setBledyPol(undefined);
    setPotwierdzOdwolanie(false);
  }

  async function zapisz() {
    if (edytowanyId === null || formularz === null) return;
    setZapisywanie(true);
    setBlad(null);
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
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
        setBlad(wyjatek.message);
      } else {
        setBledyPol(undefined);
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

  async function odwolaj(id: number) {
    setOdwolywanyId(id);
    setBlad(null);
    try {
      await cancelAdminSupervisionSlot(id);
      setTerminy((poprzednie) => poprzednie.filter((termin) => termin.id !== id));
      if (edytowanyId === id) zamknijPanel();
    } catch (wyjatek) {
      setPotwierdzOdwolanie(false);
      setBlad(
        wyjatek instanceof ApiError
          ? wyjatek.message
          : "Nie udało się odwołać terminu. Spróbuj ponownie.",
      );
    } finally {
      setOdwolywanyId(null);
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
        <Text>Backend H12 nieosiągalny albo zwrócił błąd — spróbuj ponownie później.</Text>
      </main>
    );
  }

  return (
    <main id="tresc" className={style.uklad}>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Terminy superwizji" }]}
        tytul="Terminy superwizji"
        opis="Edycja i odwołanie terminów wszystkich prowadzących (H12). Zapisy pozostają widoczne wyłącznie do odczytu."
        onPowrot={() => router.back()}
      />

      <RecordList
        tytul="Terminy"
        jednostkaSumy="zapisów"
        wiersze={wiersze}
        pusty={{
          naglowek: "Brak terminów",
          tresc: "Terminy pojawią się tu, gdy prowadzący je utworzą.",
          przycisk: { etykieta: "Odśwież", onClick: () => void wczytajTerminy() },
        }}
      />

      {edytowanyId !== null && formularz !== null && (
        <div className={style.panel}>
          <Heading stopien={3}>Edytuj termin</Heading>

          {blad && (
            <Notice wariant="error" tytul="Nie udało się zapisać">
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
            <Hint id="termin-starts-at-podpowiedz">
              Czas lokalny Twojej przeglądarki — do zapisu trafia jako UTC.
            </Hint>
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

          {!potwierdzOdwolanie && (
            <Button
              poziom="outline"
              niebezpieczny
              disabled={odwolywanyId !== null}
              onClick={() => setPotwierdzOdwolanie(true)}
            >
              Odwołaj termin
            </Button>
          )}

          {potwierdzOdwolanie && (
            <div className={style.potwierdzenie}>
              <Notice wariant="warn" tytul="Potwierdź odwołanie terminu">
                Odwołanie zwolni wszystkie zapisy uczestników i wyśle im powiadomienie. Tej operacji
                nie da się cofnąć.
              </Notice>
              <DialogActions
                etykietaWycofania="Nie odwołuj"
                etykietaPotwierdzenia={odwolywanyId !== null ? "Odwoływanie…" : "Odwołaj termin"}
                niebezpieczne
                onWycofaj={() => setPotwierdzOdwolanie(false)}
                onPotwierdz={() => {
                  if (odwolywanyId === null) void odwolaj(edytowanyId);
                }}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
