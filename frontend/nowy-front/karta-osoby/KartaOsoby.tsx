"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { DataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { CollapsibleSection } from "@/design-system/molekuly/CollapsibleSection/CollapsibleSection";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { ApiError } from "@/lib/api/klient";
import {
  pobierzKarteOsoby,
  pobierzRzetelnoscOsoby,
  zapiszKarteOsoby,
  formularzZProfilu,
  filaryKartyOsoby,
  wierszeDanychOsoby,
  kolumnyDanychOsoby,
  POLA_FORMULARZA_KARTY,
  kluczBleduPola,
  type KartaOsobyDane,
  type RzetelnoscOsobyKarty,
  type DaneFormularzaKarty,
} from "./dane";
import style from "./KartaOsoby.module.css";

type StanEkranu = "ladowanie" | "brak-uprawnien" | "nie-znaleziono" | "blad" | "ok";
type StanRzetelnosci = "ladowanie" | "ok" | "brak-danych" | "blad";

interface WlasciwosciKartyOsoby {
  id: number;
}

/**
 * Ekran A-07 „Karta osoby" (administracja) —
 * `frontend/app/nowy-front/admin/uczestniczki/[id]/page.tsx`. Dane wyłącznie
 * z `GET /admin/users/{id}` i `GET /admin/reliability/{userId}`
 * (`backend/routes/api/h18.php:28`, `h07.php:18`); zapis wyłącznie
 * `PATCH /admin/users/{id}` (`h18.php:30`), bez pola roli.
 *
 * Szablon `TableTemplate`: nagłówek → `StatRow` (cztery filary + rzetelność)
 * → zdanie o źródle liczb → `DataTable` (dane kontaktowe i data wygaśnięcia
 * dostępu) → blok wspierający (sekcje rzadkie zwinięte z licznikiem:
 * powiadomienia, dziennik — bez ładunku zdarzenia).
 */
export function KartaOsoby({ id }: WlasciwosciKartyOsoby) {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [karta, setKarta] = useState<KartaOsobyDane | null>(null);
  const [stanRzetelnosci, setStanRzetelnosci] = useState<StanRzetelnosci>("ladowanie");
  const [rzetelnosc, setRzetelnosc] = useState<RzetelnoscOsobyKarty | null>(null);

  const [formularzOtwarty, setFormularzOtwarty] = useState(false);
  const [formularz, setFormularz] = useState<DaneFormularzaKarty | null>(null);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [pokazToast, setPokazToast] = useState(false);

  function wczytajRzetelnosc(straz?: { anulowane: boolean }) {
    pobierzRzetelnoscOsoby(id)
      .then((dane) => {
        if (straz?.anulowane) return;
        setRzetelnosc(dane);
        setStanRzetelnosci("ok");
      })
      .catch((wyjatek: unknown) => {
        if (straz?.anulowane) return;
        if (wyjatek instanceof ApiError && wyjatek.status === 404) {
          setRzetelnosc(null);
          setStanRzetelnosci("brak-danych");
          return;
        }
        setStanRzetelnosci("blad");
      });
  }

  function wczytajKarte(straz?: { anulowane: boolean }) {
    pobierzKarteOsoby(id)
      .then((dane) => {
        if (straz?.anulowane) return;
        setKarta(dane);
        setStan("ok");
        wczytajRzetelnosc(straz);
      })
      .catch((wyjatek: unknown) => {
        if (straz?.anulowane) return;
        if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) {
          setStan("brak-uprawnien");
          return;
        }
        if (wyjatek instanceof ApiError && wyjatek.status === 404) {
          setStan("nie-znaleziono");
          return;
        }
        setStan("blad");
      });
  }

  useEffect(() => {
    const straz = { anulowane: false };
    wczytajKarte(straz);
    return () => {
      straz.anulowane = true;
    };
    // Wyłącznie przy zamontowaniu i zmianie `id` — ponowne wczytanie po
    // zapisie woła `wczytajKarte` wprost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function otworzFormularz() {
    if (!karta) return;
    setFormularz(formularzZProfilu(karta.profile));
    setBledyPol(undefined);
    setFormularzOtwarty(true);
  }

  function zamknijFormularz() {
    setFormularzOtwarty(false);
    setFormularz(null);
    setBledyPol(undefined);
  }

  async function zapisz() {
    if (!formularz) return;
    setZapisywanie(true);
    setBledyPol(undefined);
    try {
      await zapiszKarteOsoby(id, formularz);
      zamknijFormularz();
      setPokazToast(true);
      wczytajKarte();
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
      }
    } finally {
      setZapisywanie(false);
    }
  }

  if (stan === "ladowanie") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Karta osoby</Heading>
        <Skeleton wiersze={6} />
      </main>
    );
  }

  if (stan === "blad") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Karta osoby</Heading>
        <Text>Backend H18 nieosiągalny albo zwrócił błąd — spróbuj ponownie później.</Text>
      </main>
    );
  }

  if (stan === "brak-uprawnien") {
    return (
      <main id="tresc" className={style.uklad}>
        <PageHeader
          okruszki={[{ etykieta: "Administracja" }, { etykieta: "Karta osoby" }]}
          tytul="Karta osoby"
          onPowrot={() => router.back()}
        />
        <EmptyState
          naglowek="Brak dostępu"
          wariant="brak-uprawnien"
          rola="opiekuna projektu i Super Admina"
          przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
        />
      </main>
    );
  }

  if (stan === "nie-znaleziono") {
    return (
      <main id="tresc" className={style.uklad}>
        <PageHeader
          okruszki={[{ etykieta: "Administracja" }, { etykieta: "Karta osoby" }]}
          tytul="Karta osoby"
          onPowrot={() => router.back()}
        />
        <Notice wariant="warn" tytul="Nie znaleziono osoby">
          Nie znaleziono osoby.
        </Notice>
      </main>
    );
  }

  if (!karta) return null;

  const kafle = filaryKartyOsoby(karta.progress, stanRzetelnosci === "ok" ? rzetelnosc : null);
  const wiersze = wierszeDanychOsoby(karta.profile);

  const pola: PoleFormSection[] = formularz
    ? POLA_FORMULARZA_KARTY.map((konfiguracja) => ({
        id: konfiguracja.id,
        etykieta: konfiguracja.etykieta,
        rodzaj: konfiguracja.rodzaj,
        wymagane: konfiguracja.wymagane,
        opcje: konfiguracja.opcje,
        wartosc: formularz[konfiguracja.klucz],
        onZmiana: (wartosc: string) =>
          setFormularz((poprzedni) => (poprzedni ? { ...poprzedni, [konfiguracja.klucz]: wartosc } : poprzedni)),
        blad: bledyPol?.[kluczBleduPola(konfiguracja.klucz)]?.[0],
      }))
    : [];

  return (
    <main id="tresc" className={style.uklad}>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Osoby" }, { etykieta: `${karta.profile.first_name} ${karta.profile.last_name}` }]}
        tytul={`${karta.profile.first_name} ${karta.profile.last_name}`}
        opis={`Rola: ${karta.profile.role}`}
        onPowrot={() => router.back()}
        dzieci={
          <div className={style.akcjaGlowna}>
            <Button poziom="primary" onClick={otworzFormularz}>
              Zmień dane
            </Button>
          </div>
        }
      />

      <StatRow kafle={kafle} />

      {stanRzetelnosci === "blad" && (
        <Notice wariant="warn" tytul="Rzetelność niedostępna">
          Nie udało się pobrać rzetelności nauki tej osoby — reszta karty działa.
        </Notice>
      )}

      <Text>Liczby pochodzą z jednego źródła (ProgressAggregator) — to samo, co pulpit i raport.</Text>

      <DataTable
        tytul="Dane osoby"
        kolumny={kolumnyDanychOsoby()}
        wiersze={wiersze}
      />

      <div className={style.sekcjeRzadkie}>
        <CollapsibleSection
          tytul="Powiadomienia"
          liczba={karta.recent_notifications.length}
          dzieci={
            karta.recent_notifications.length === 0 ? (
              <Text wariant="pusty">Brak powiadomień.</Text>
            ) : (
              <ul className={style.listaPowiadomien}>
                {karta.recent_notifications.map((powiadomienie) => (
                  <li key={powiadomienie.id}>
                    <Text>{powiadomienie.title}</Text>
                    <Text wariant="pusty">
                      {powiadomienie.created_at} — {powiadomienie.read_at ? "przeczytane" : "nieprzeczytane"}
                    </Text>
                  </li>
                ))}
              </ul>
            )
          }
        />

        <CollapsibleSection
          tytul="Dziennik działań"
          liczba={karta.audit_entries.length}
          dzieci={
            karta.audit_entries.length === 0 ? (
              <Text wariant="pusty">Brak wpisów dziennika.</Text>
            ) : (
              <ul className={style.listaDziennika} data-testid="dziennik-lista">
                {karta.audit_entries.map((wpis) => (
                  <li key={wpis.id}>
                    <Text>{wpis.action}</Text>
                    <Text wariant="pusty">
                      {wpis.created_at ?? "brak daty"} — kto: {wpis.actor_id ?? "brak"}
                    </Text>
                  </li>
                ))}
              </ul>
            )
          }
        />
      </div>

      {formularzOtwarty && formularz && (
        <Dialog
          tytul="Zmień dane"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia={zapisywanie ? "Zapisywanie…" : "Zapisz zmiany"}
          onWycofaj={zamknijFormularz}
          onPotwierdz={() => {
            if (!zapisywanie) void zapisz();
          }}
        >
          <FormSection
            tytul="Dane osoby"
            pola={pola}
            tytulDodatkowych="Adres i grupa produktowa"
            etykietaZapisz={zapisywanie ? "Zapisywanie…" : "Zapisz zmiany"}
            onAnuluj={zamknijFormularz}
            onZapisz={() => {
              if (!zapisywanie) void zapisz();
            }}
          />
        </Dialog>
      )}

      {pokazToast && <Toast komunikat="Zapisano zmiany." onZamknij={() => setPokazToast(false)} />}
    </main>
  );
}
