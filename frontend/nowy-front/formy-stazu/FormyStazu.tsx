"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import {
  RecordList,
  type KolumnaRecordList,
  type WierszRecordList,
} from "@/design-system/organizmy/RecordList/RecordList";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { FormSection, type PoleFormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { ApiError } from "@/lib/api/klient";
import { utworzFormeStazu, zaktualizujFormeStazu } from "@/lib/api/h11-formy";
import { useWPowloce } from "@/design-system/szablony/KontekstPowloki";
import { pobierzFormyStazu, type FormaStazu } from "./dane";
import style from "./FormyStazu.module.css";

/**
 * Korzeń ekranu. Poza powłoką panelu: `main` pod `id="tresc"` jak dotąd.
 * W powłoce (`DostawcaPowloki`) `main` niesie powłoka, więc tu jest zwykły `div`.
 */
function Korzen({ children }: { children: ReactNode }) {
  const wPowloce = useWPowloce();
  if (wPowloce) return <div className={style.uklad}>{children}</div>;
  return <main id="tresc" className={style.uklad}>{children}</main>;
}

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";

interface StanFormularza {
  name: string;
  description: string;
  is_active: boolean;
  sort_order: string;
}

const PUSTY_FORMULARZ: StanFormularza = {
  name: "",
  description: "",
  is_active: true,
  sort_order: "",
};

/** Pola API, które formularz pokazuje pod kontrolką (reszta błędów trafia do ogólnego komunikatu). */
const POLA_FORMULARZA = ["name", "description", "sort_order", "is_active"] as const;

/** Kolumny listy form: nazwa z opisem, stan, miejsce na liście do prawej, akcja na końcu. */
export const KOLUMNY_FORM: KolumnaRecordList[] = [
  { nazwa: "Forma", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Miejsce na liście", rodzaj: "liczba", klucz: "miejsce" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

/**
 * Domyślne miejsce nowej formy na liście: następne wolne po największym
 * wczytanym (`sort_order`), a dla pustej listy — pierwsze.
 */
function nastepneMiejsceNaLiscie(formy: readonly FormaStazu[]): number {
  if (formy.length === 0) return 1;
  return Math.max(...formy.map((forma) => forma.sort_order)) + 1;
}

/**
 * Trasa `/nowy-front/admin/formy-stazu` — słownik form stażu (H11), jedyny
 * ekran administracji dla `AdminInternshipFormController`
 * (`backend/routes/api/h11.php:42-44`). Bez usuwania: pozycja wygasa przez
 * `is_active = false`, tak jak opisuje kontroler backendu — ten ekran nie
 * dorabia przycisku „Usuń”, którego trasa API nie ma.
 *
 * Odczyt startowy biegnie z przeglądarki (`pobierzFormyStazu`, patrz
 * `./dane.ts` — powód, dla którego ta trasa NIE woła `@/auth` po stronie
 * serwera, tak jak `nowy-front/kurs-publikacja`). Cztery stany trasy:
 * `ladowanie`, `brak-uprawnien`, `blad`, `ok`. Stanu „pusty” nie ma osobno:
 * pusty słownik to `ok` z zerem wierszy, `RecordList` ma na to własny
 * `EmptyState`.
 */
export function FormyStazu() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [formy, setFormy] = useState<FormaStazu[]>([]);
  const [edytowanaId, setEdytowanaId] = useState<number | null>(null);
  const [formularz, setFormularz] = useState<StanFormularza>(PUSTY_FORMULARZ);
  const [dodajOtwarte, setDodajOtwarte] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [bledyPol, setBledyPol] = useState<Record<string, string[]> | undefined>(undefined);
  const [zapisywanie, setZapisywanie] = useState(false);

  useEffect(() => {
    let anulowane = false;
    pobierzFormyStazu()
      .then((dane) => {
        if (anulowane) return;
        setFormy(dane);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        setStan(
          wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403) ? "brak-uprawnien" : "blad",
        );
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const wiersze: WierszRecordList[] = useMemo(
    () =>
      formy
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
        .map((forma) => ({
          id: String(forma.id),
          tytul: forma.name,
          // Opis pusty albo z samych białych znaków liczy się jak brak opisu.
          podpowiedz: forma.description?.trim() || "Bez opisu.",
          plakietka: forma.is_active
            ? { wariant: "ok" as const, tekst: "aktywna" }
            : { wariant: "neutral" as const, tekst: "nieaktywna" },
          // Miejsce na liście stoi we własnej kolumnie (komórka), nie w polu
          // `wartosc` — ranga sortowania nie ma sensownej sumy zbiorczej, więc
          // `RecordList` jej nie liczy ani nie pokazuje w stopce.
          komorki: { miejsce: { liczba: forma.sort_order, jednostka: "na liście" } },
          akcja: {
            etykieta: "Edytuj",
            onKliknij: () => otworzEdycje(forma),
          },
        })),
    [formy],
  );

  function otworzEdycje(forma: FormaStazu) {
    setBlad(null);
    setBledyPol(undefined);
    setDodajOtwarte(false);
    setEdytowanaId(forma.id);
    setFormularz({
      name: forma.name,
      description: forma.description ?? "",
      is_active: forma.is_active,
      sort_order: String(forma.sort_order),
    });
  }

  function otworzDodawanie() {
    setBlad(null);
    setBledyPol(undefined);
    setEdytowanaId(null);
    setDodajOtwarte(true);
    setFormularz({ ...PUSTY_FORMULARZ, sort_order: String(nastepneMiejsceNaLiscie(formy)) });
  }

  function zamknijPanel() {
    setEdytowanaId(null);
    setDodajOtwarte(false);
    setBlad(null);
    setBledyPol(undefined);
    setFormularz(PUSTY_FORMULARZ);
  }

  async function zapisz() {
    setZapisywanie(true);
    setBlad(null);
    setBledyPol(undefined);
    // Puste albo nieliczbowe pole miejsca na liście trafia do serwera
    // dosłownie — bez cichej zamiany na `0`, żeby walidacja serwera
    // (`sort_order.integer`) naprawdę zobaczyła to, co wpisano.
    const wpisanaKolejnosc = formularz.sort_order.trim();
    const payload = {
      name: formularz.name.trim(),
      description: formularz.description.trim() === "" ? null : formularz.description.trim(),
      is_active: formularz.is_active,
      sort_order: /^\d+$/.test(wpisanaKolejnosc) ? Number(wpisanaKolejnosc) : wpisanaKolejnosc,
    };
    try {
      if (edytowanaId !== null) {
        const zaktualizowana = await zaktualizujFormeStazu(edytowanaId, payload);
        setFormy((poprzednie) =>
          poprzednie.map((forma) => (forma.id === zaktualizowana.id ? zaktualizowana : forma)),
        );
      } else {
        const nowa = await utworzFormeStazu(payload);
        setFormy((poprzednie) => [...poprzednie, nowa]);
      }
      zamknijPanel();
      router.refresh();
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.errors) {
        setBledyPol(wyjatek.errors);
        setBlad(wyjatek.message);
      } else {
        setBledyPol(undefined);
        setBlad(
          wyjatek instanceof ApiError
            ? wyjatek.message
            : "Nie udało się zapisać formy stażu. Spróbuj ponownie.",
        );
      }
    } finally {
      setZapisywanie(false);
    }
  }

  if (stan === "ladowanie") {
    return (
      <Korzen>
        <Heading stopien={1}>Słownik form stażu</Heading>
        <Skeleton wiersze={4} />
      </Korzen>
    );
  }
  if (stan === "brak-uprawnien") {
    return (
      <Korzen>
        <Heading stopien={1}>Słownik form stażu</Heading>
        <EmptyState
          wariant="brak-uprawnien"
          naglowek="Słownik form stażu dla administracji"
          rola="administracji"
          przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
        />
      </Korzen>
    );
  }
  if (stan === "blad") {
    return (
      <Korzen>
        <Heading stopien={1}>Słownik form stażu</Heading>
        <Text>Serwer jest nieosiągalny albo zwrócił błąd — spróbuj ponownie później.</Text>
      </Korzen>
    );
  }

  const panelOtwarty = dodajOtwarte || edytowanaId !== null;
  // Błędy pól pokazuje podsumowanie `FormSection` i tekst pod kontrolką; ogólny
  // komunikat serwera jest osobno tylko wtedy, gdy żadne pole formularza nie ma błędu.
  const maBledyPol = POLA_FORMULARZA.some((pole) => Boolean(bledyPol?.[pole]?.[0]));
  const pola: PoleFormSection[] = [
    {
      id: "forma-nazwa",
      etykieta: "Nazwa",
      rodzaj: "tekst",
      wartosc: formularz.name,
      onZmiana: (wartosc) => setFormularz((f) => ({ ...f, name: wartosc })),
      blad: bledyPol?.name?.[0],
      wymagane: true,
    },
    {
      id: "forma-opis",
      etykieta: "Opis",
      rodzaj: "wieloliniowy",
      wartosc: formularz.description,
      onZmiana: (wartosc) => setFormularz((f) => ({ ...f, description: wartosc })),
      blad: bledyPol?.description?.[0],
    },
    {
      id: "forma-kolejnosc",
      etykieta: "Miejsce na liście",
      rodzaj: "liczba",
      podpowiedz: "1 = na górze listy form",
      wartosc: formularz.sort_order,
      onZmiana: (wartosc) => setFormularz((f) => ({ ...f, sort_order: wartosc })),
      blad: bledyPol?.sort_order?.[0],
    },
    {
      id: "forma-aktywna",
      etykieta: "Stan",
      rodzaj: "wybor",
      opcje: [
        { wartosc: "tak", etykieta: "Aktywna" },
        { wartosc: "nie", etykieta: "Nieaktywna" },
      ],
      wartosc: formularz.is_active ? "tak" : "nie",
      onZmiana: (wartosc) => setFormularz((f) => ({ ...f, is_active: wartosc === "tak" })),
      blad: bledyPol?.is_active?.[0],
    },
  ];

  return (
    <Korzen>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Słownik form stażu" }]}
        tytul="Słownik form stażu"
        opis="Formy dyżuru dostępne przy zgłaszaniu wpisu w dzienniku stażu. Pozycji nie da się usunąć — wygasza ją przełącznik aktywności."
        onPowrot={() => router.back()}
        przyciskGlowny={panelOtwarty ? undefined : { etykieta: "Dodaj formę", onKliknij: otworzDodawanie }}
      />

      <div data-obszar="lista-form">
        <RecordList
          tytul="Formy stażu"
          stopienNaglowka={2}
          naKarcie
          kolumny={KOLUMNY_FORM}
          wiersze={wiersze}
          pusty={{
            naglowek: "Brak form stażu",
            tresc: "Dodaj pierwszą formę, aby uczestnicy mogli wybrać ją w dzienniku.",
            przycisk: { etykieta: "Dodaj formę", onClick: otworzDodawanie },
          }}
        />
      </div>

      {panelOtwarty && (
        <div className={style.formularz}>
          {blad && !maBledyPol && (
            <Notice wariant="error" tytul="Nie udało się zapisać">
              {blad}
            </Notice>
          )}
          <FormSection
            key={edytowanaId ?? "nowa"}
            fokusPrzyOtwarciu
            tytul={edytowanaId !== null ? "Edytuj formę" : "Nowa forma"}
            pola={pola}
            etykietaAnuluj="Anuluj"
            etykietaZapisz={zapisywanie ? "Zapisywanie…" : "Zapisz"}
            onAnuluj={zamknijPanel}
            onZapisz={() => {
              if (!zapisywanie) void zapisz();
            }}
          />
        </div>
      )}
    </Korzen>
  );
}
