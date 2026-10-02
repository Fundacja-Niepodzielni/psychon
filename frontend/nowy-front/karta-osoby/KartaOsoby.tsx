"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { rowneWartosci } from "@/nowy-front/wspolne/rowne-wartosci";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Text } from "@/design-system/atomy/Text/Text";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { TableTemplate } from "@/design-system/szablony/TableTemplate/TableTemplate";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { DataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { CollapsibleSection } from "@/design-system/molekuly/CollapsibleSection/CollapsibleSection";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { ApiError } from "@/lib/api/klient";
import { formatujDateICzas } from "../wspolne/daty";
import {
  pobierzKarteOsoby,
  pobierzRzetelnoscOsoby,
  zapiszKarteOsoby,
  formularzZProfilu,
  filaryKartyOsoby,
  wierszeDanychOsoby,
  kolumnyDanychOsoby,
  opisRoliOsoby,
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
  /**
   * Adres ekranu przedłużenia dostępu tej osoby. Podaje go strona, pod którą
   * ten ekran naprawdę stoi; bez adresu karta nie pokazuje wejścia, żeby
   * przycisk nigdy nie prowadził donikąd. Ekran przedłużenia i karta mają
   * ten sam próg roli, więc kto widzi kartę, ten ma też ekran przedłużenia.
   */
  adresPrzedluzenia?: string;
}

/**
 * Ekran A-07 „Karta osoby" (administracja) —
 * `frontend/app/nowy-front/admin/uczestniczki/[id]/page.tsx`. Dane wyłącznie
 * z `GET /admin/users/{id}` i `GET /admin/reliability/{userId}`
 * (`backend/routes/api/h18.php:28`, `h07.php:18`); zapis wyłącznie
 * `PATCH /admin/users/{id}` (`h18.php:30`), bez pola roli.
 *
 * Każdy stan (ładowanie, dane, błąd, brak uprawnień, nie znaleziono) renderuje
 * się WEWNĄTRZ `TableTemplate`
 * (`@/design-system/szablony/TableTemplate/TableTemplate`), którego korzeń jest
 * jedynym `main`. Sloty: `naglowek` (`PageHeader`) → `statystyki` (`StatRow`,
 * cztery filary + rzetelność) → `zdanie` (źródło liczb) → `tabela` (`DataTable`
 * z danymi kontaktowymi i datą końca dostępu do materiałów) → `wsparcie` (sekcje rzadkie
 * zwinięte z licznikiem: powiadomienia, dziennik — bez ładunku zdarzenia).
 * Sloty `zakres` i `wykres` pominięte — ekran nie ma zakresu dat ani wykresu.
 *
 * Edycja danych żyje w JEDNYM kontenerze: w stanie edycji slot `tabela` niesie
 * `FormSection` zamiast `DataTable` (bez `Dialog`), więc na ekranie jest jeden
 * rząd przycisków „Anuluj” / „Zapisz zmiany”, a przycisk główny „Zmień dane”
 * znika z nagłówka na czas edycji.
 */
export function KartaOsoby({ id, adresPrzedluzenia }: WlasciwosciKartyOsoby) {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [karta, setKarta] = useState<KartaOsobyDane | null>(null);
  const [stanRzetelnosci, setStanRzetelnosci] = useState<StanRzetelnosci>("ladowanie");
  const [rzetelnosc, setRzetelnosc] = useState<RzetelnoscOsobyKarty | null>(null);

  const [formularzOtwarty, setFormularzOtwarty] = useState(false);
  const [formularz, setFormularz] = useState<DaneFormularzaKarty | null>(null);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [bladZapisu, setBladZapisu] = useState(false);
  const [pokazToast, setPokazToast] = useState(false);
  useZgloszenieNiezapisanychZmian(
    formularzOtwarty && formularz !== null && karta !== null && !rowneWartosci(formularz, formularzZProfilu(karta.profile)),
    "Karta osoby",
  );

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
    setBladZapisu(false);
    setFormularzOtwarty(true);
  }

  function zamknijFormularz() {
    setFormularzOtwarty(false);
    setFormularz(null);
    setBledyPol(undefined);
    setBladZapisu(false);
  }

  async function zapisz() {
    if (!formularz) return;
    setZapisywanie(true);
    setBledyPol(undefined);
    setBladZapisu(false);
    try {
      await zapiszKarteOsoby(id, formularz);
      zamknijFormularz();
      setPokazToast(true);
      wczytajKarte();
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.status === 422 && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
      } else {
        // Błąd serwera (500), sieci albo 422 bez pól: formularz zostaje
        // otwarty z wpisanymi danymi, a osoba dostaje komunikat i ponowienie.
        setBladZapisu(true);
      }
    } finally {
      setZapisywanie(false);
    }
  }

  const okruszki = [{ etykieta: "Administracja" }, { etykieta: "Osoby" }, { etykieta: "Karta osoby" }];
  const wroc = () => router.back();

  if (stan === "ladowanie") {
    return (
      <TableTemplate
        naglowek={<PageHeader okruszki={okruszki} tytul="Karta osoby" onPowrot={wroc} />}
        tabela={<Skeleton wiersze={6} />}
      />
    );
  }

  if (stan === "blad") {
    return (
      <TableTemplate
        naglowek={<PageHeader okruszki={okruszki} tytul="Karta osoby" onPowrot={wroc} />}
        tabela={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać karty osoby"
            akcja={
              <Button
                poziom="outline"
                onClick={() => {
                  setStan("ladowanie");
                  wczytajKarte();
                }}
              >
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Dane osoby nie są zgadywane bez odpowiedzi.
          </Notice>
        }
      />
    );
  }

  if (stan === "brak-uprawnien") {
    return (
      <TableTemplate
        naglowek={<PageHeader okruszki={okruszki} tytul="Karta osoby" onPowrot={wroc} />}
        tabela={
          <EmptyState
            naglowek="Karta osoby dla administracji"
            wariant="brak-uprawnien"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (stan === "nie-znaleziono") {
    return (
      <TableTemplate
        naglowek={<PageHeader okruszki={okruszki} tytul="Karta osoby" onPowrot={wroc} />}
        tabela={
          <Notice wariant="warn" tytul="Nie znaleziono osoby">
            Nie znaleziono osoby.
          </Notice>
        }
      />
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

  const edycja = formularzOtwarty && formularz !== null;

  return (
    <>
      <TableTemplate
        naglowek={
          <PageHeader
            okruszki={[{ etykieta: "Administracja" }, { etykieta: "Osoby" }, { etykieta: `${karta.profile.first_name} ${karta.profile.last_name}` }]}
            tytul={`${karta.profile.first_name} ${karta.profile.last_name}`}
            opis={opisRoliOsoby(karta.profile.role)}
            onPowrot={wroc}
            przyciskGlowny={edycja ? undefined : { etykieta: "Zmień dane", onKliknij: otworzFormularz }}
          />
        }
        statystyki={
          <>
            <StatRow kafle={kafle} />
            {stanRzetelnosci === "blad" && (
              <Notice wariant="warn" tytul="Rzetelność niedostępna">
                Nie udało się pobrać rzetelności nauki tej osoby — reszta karty działa.
              </Notice>
            )}
          </>
        }
        zdanie={<Text>Liczby pochodzą z jednego źródła (ProgressAggregator) — to samo, co pulpit i raport.</Text>}
        tabela={
          edycja ? (
            <>
              <FormSection
                fokusPrzyOtwarciu
                tytul="Dane osoby"
                pola={pola}
                tytulDodatkowych="Adres i grupa produktowa"
                etykietaZapisz={zapisywanie ? "Zapisywanie…" : "Zapisz zmiany"}
                onAnuluj={zamknijFormularz}
                onZapisz={() => {
                  if (!zapisywanie) void zapisz();
                }}
              />
              {bladZapisu && (
                <Notice
                  wariant="error"
                  tytul="Nie udało się zapisać zmian"
                  akcja={
                    <Button
                      poziom="outline"
                      onClick={() => {
                        if (!zapisywanie) void zapisz();
                      }}
                    >
                      Spróbuj ponownie
                    </Button>
                  }
                >
                  Serwer nie odpowiedział albo zwrócił błąd. Dane w formularzu zostały zachowane — spróbuj zapisać jeszcze raz.
                </Notice>
              )}
            </>
          ) : (
            <>
              <DataTable tytul="Dane osoby" kolumny={kolumnyDanychOsoby()} wiersze={wiersze} />
              {adresPrzedluzenia !== undefined && (
                <div className={style.akcjaDostepu}>
                  <Button poziom="outline" onClick={() => router.push(adresPrzedluzenia)}>
                    Przedłuż dostęp
                  </Button>
                </div>
              )}
            </>
          )
        }
        wsparcie={
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
                          {formatujDateICzas(powiadomienie.created_at)} — {powiadomienie.read_at ? "przeczytane" : "nieprzeczytane"}
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
                          {formatujDateICzas(wpis.created_at)} — kto: {wpis.actor_id ?? "brak"}
                        </Text>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </div>
        }
      />

      {pokazToast && <Toast komunikat="Zapisano zmiany." onZamknij={() => setPokazToast(false)} />}
    </>
  );
}
