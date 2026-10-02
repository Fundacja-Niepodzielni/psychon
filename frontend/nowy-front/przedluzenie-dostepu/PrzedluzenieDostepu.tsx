"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/h18/labels";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { KeyValueRow } from "@/design-system/molekuly/KeyValueRow/KeyValueRow";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { FormTemplate } from "@/design-system/szablony/FormTemplate/FormTemplate";
import {
  MIESIACE_DOMYSLNE,
  MIESIACE_MAX,
  MIESIACE_MIN,
  czySkraca,
  dataPoPrzedluzeniu,
  formatujDate,
  idOsobyZAdresu,
  pobierzKarteOsoby,
  przedluzDostep,
  stanZBleduKarty,
  wynikZBleduZapisu,
  zbudujCialo,
  type BledyPol,
  type StanKarty,
  type TrybPrzedluzenia,
} from "./dane";
import style from "./PrzedluzenieDostepu.module.css";

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Osoby" }, { etykieta: "Przedłużenie dostępu" }];
const OPCJE_TRYBU = [
  { wartosc: "months", etykieta: "O liczbę miesięcy" },
  { wartosc: "until", etykieta: "Do wybranej daty" },
];

interface WlasciwosciPrzedluzenieDostepu {
  /** Segment adresu `[id]` — trasa serwera przyjmuje wyłącznie liczbę. */
  idOsoby: string;
}

/**
 * Ekran „Przedłużenie dostępu” na szablonie formularza: nagłówek, dwie daty
 * obok siebie (obecna i po przedłużeniu) oraz `FormSection` z akcją główną
 * „Zmień datę”. Każdy stan (ładowanie, dane, brak osoby, odmowa, błąd
 * sieci) renderuje się wewnątrz szablonu — jego korzeń jest jedynym `main`.
 *
 * Dane: karta osoby (`GET /admin/users/{id}`), zapis
 * `POST /admin/users/{id}/extend-access` z jednym z pól `months` albo `until`.
 * Dziennik działań zapisuje serwer; ekran niczego tam nie wysyła.
 */
export function PrzedluzenieDostepu({ idOsoby }: WlasciwosciPrzedluzenieDostepu) {
  const router = useRouter();
  const id = idOsobyZAdresu(idOsoby);
  const [stan, setStan] = useState<StanKarty>(id === null ? { rodzaj: "nie-znaleziono" } : { rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [teraz] = useState(() => new Date());
  const [tryb, setTryb] = useState<TrybPrzedluzenia>("months");
  const [miesiace, setMiesiace] = useState(MIESIACE_DOMYSLNE);
  const [data, setData] = useState("");
  const [bledy, setBledy] = useState<BledyPol>({});
  const [bladOgolny, setBladOgolny] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  useZgloszenieNiezapisanychZmian(
    stan.rodzaj === "gotowy" && (tryb !== "months" || miesiace !== MIESIACE_DOMYSLNE || data !== ""),
    "Przedłużenie dostępu",
  );

  useEffect(() => {
    if (id === null) return;
    let aktualne = true;
    pobierzKarteOsoby(id)
      .then((karta) => {
        if (aktualne) setStan({ rodzaj: "gotowy", karta });
      })
      .catch((blad: unknown) => {
        if (aktualne) setStan(stanZBleduKarty(blad));
      });
    return () => {
      aktualne = false;
    };
  }, [id, proba]);

  const wroc = () => router.back();
  const naglowek = (opis?: string) => (
    <PageHeader okruszki={OKRUSZKI} tytul="Przedłużenie dostępu" opis={opis} onPowrot={wroc} />
  );

  async function przedluz() {
    if (stan.rodzaj !== "gotowy" || id === null || zapisywanie) return;
    setBladOgolny(null);
    setKomunikat(null);
    const wynik = zbudujCialo(tryb, miesiace, data);
    if ("bledy" in wynik) {
      setBledy(wynik.bledy);
      return;
    }
    setBledy({});
    setZapisywanie(true);
    try {
      const osoba = await przedluzDostep(id, wynik.cialo);
      setStan({
        rodzaj: "gotowy",
        karta: { ...stan.karta, profile: { ...stan.karta.profile, access_expires_at: osoba.access_expires_at } },
      });
      setMiesiace(MIESIACE_DOMYSLNE);
      setData("");
      setKomunikat(
        `Dostęp do materiałów przedłużony do ${formatujDate(osoba.access_expires_at)}. Zdarzenie zapisało się w dzienniku działań; datę można zmienić kolejnym przedłużeniem.`,
      );
    } catch (wyjatek) {
      const blad = wynikZBleduZapisu(wyjatek);
      if (blad.rodzaj === "pola") setBledy(blad.bledy);
      else setBladOgolny(blad.tresc);
    } finally {
      setZapisywanie(false);
    }
  }

  if (stan.rodzaj === "ladowanie") {
    return <FormTemplate naglowek={naglowek()} tresc={<div aria-busy="true"><Skeleton wiersze={5} /></div>} />;
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <FormTemplate
        naglowek={naglowek()}
        tresc={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Przedłużeniem dostępu zajmuje się administracja"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "nie-znaleziono") {
    return (
      <FormTemplate
        naglowek={naglowek()}
        tresc={
          <EmptyState
            naglowek="Nie znaleziono osoby"
            tresc="Adres wskazuje osobę, której nie ma w systemie. Wróć do listy osób i otwórz kartę osoby jeszcze raz."
            przycisk={{ etykieta: "Wróć", onClick: wroc }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "siec") {
    return (
      <FormTemplate
        naglowek={naglowek()}
        tresc={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać osoby"
            akcja={
              <Button
                poziom="outline"
                onClick={() => {
                  setStan({ rodzaj: "ladowanie" });
                  setProba((numer) => numer + 1);
                }}
              >
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Dostęp nie został zmieniony.
          </Notice>
        }
      />
    );
  }

  const { profile } = stan.karta;
  const obecna = profile.access_expires_at;
  const nowa = dataPoPrzedluzeniu(obecna, tryb, miesiace, data, teraz);
  const opis = `${profile.first_name} ${profile.last_name}, ${ROLE_LABELS[profile.role] ?? "osoba w programie"}`;

  const poleZalezne =
    tryb === "months"
      ? {
          id: "przedluzenie-miesiace",
          etykieta: "Liczba miesięcy",
          rodzaj: "liczba" as const,
          wymagane: true,
          wartosc: miesiace,
          onZmiana: (wartosc: string) => setMiesiace(wartosc),
          podpowiedz: `Od ${MIESIACE_MIN} do ${MIESIACE_MAX}. Gdy dostęp jeszcze trwa, miesiące dolicza się do obecnej daty; gdy wygasł — od dziś.`,
          blad: bledy.months,
        }
      : {
          id: "przedluzenie-data",
          etykieta: "Data końca dostępu",
          rodzaj: "data" as const,
          wymagane: true,
          wartosc: data,
          onZmiana: (wartosc: string) => setData(wartosc),
          podpowiedz: "Dostęp do materiałów będzie otwarty do tego dnia.",
          blad: bledy.until,
        };

  const tresc: ReactNode = (
    <div className={style.kolumna}>
      <div className={style.daty}>
        <KeyValueRow
          etykieta="Obecnie dostęp do materiałów do"
          wartosc={obecna === null ? "brak ustawionej daty" : formatujDate(obecna)}
        />
        <KeyValueRow etykieta="Po przedłużeniu do" wartosc={nowa === null ? "—" : formatujDate(nowa)} />
        <Hint>
          {czySkraca(obecna, nowa)
            ? "Wybrana data jest wcześniejsza niż obecna — dostęp zostanie skrócony. Dokładną datę potwierdza serwer po zapisie."
            : "Dokładną datę potwierdza serwer po zapisie."}
        </Hint>
      </div>
      <FormSection
        tytul="Zmień datę"
        pola={[
          {
            id: "przedluzenie-tryb",
            etykieta: "Jak przedłużyć",
            rodzaj: "wybor",
            opcje: OPCJE_TRYBU,
            wartosc: tryb,
            onZmiana: (wartosc) => {
              setTryb(wartosc as TrybPrzedluzenia);
              setBledy({});
            },
          },
          poleZalezne,
        ]}
        etykietaZapisz="Zmień datę"
        onAnuluj={wroc}
        onZapisz={() => void przedluz()}
      />
      {komunikat && <Toast komunikat={komunikat} onZamknij={() => setKomunikat(null)} />}
    </div>
  );

  return (
    <FormTemplate
      naglowek={naglowek(opis)}
      powiadomienie={
        bladOgolny ? (
          <Notice wariant="error" tytul="Nie przedłużono dostępu">
            {bladOgolny}
          </Notice>
        ) : undefined
      }
      tresc={tresc}
    />
  );
}
