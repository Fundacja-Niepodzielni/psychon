"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { EmptyStateCard } from "@/design-system/organizmy/EmptyStateCard/EmptyStateCard";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import { ADRES_PULPITU, EkranOdmowy } from "../wspolne/ekran-odmowy";
import {
  czyMoznaSieZapisac,
  komunikatBleduAkcji,
  nazwaTerminu,
  podzielTerminy,
  pobierzTerminy,
  rodzajBleduOdczytu,
  tekstTerminow,
  wypiszZTerminu,
  zapiszNaTermin,
  type BladOdczytu,
  type TerminSuperwizji,
} from "./dane";
import { KartaTerminu } from "./KartaTerminu";
import style from "./SuperwizjaUczestnika.module.css";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; blad: BladOdczytu }
  | { rodzaj: "gotowy"; terminy: TerminSuperwizji[]; meta: PaginationMeta | undefined };

type Akcja = "zapis" | "wypis";

const OKRUSZKI = [{ etykieta: "Superwizja" }];
const TYTUL = "Superwizja";
const OPIS = "Zapisz się na termin u swojego superwizora i sprawdź, czy Twoja obecność została potwierdzona.";

/**
 * Ekran „Superwizja” osoby wolontariackiej na szablonie `ListTemplate`
 * (jedna kolumna na każdej szerokości): nagłówek, „Twoje terminy” (zapisy
 * osoby, także minione — z obecnością), „Wolne terminy” (przed rozpoczęciem,
 * bez zapisu osoby — z wolnymi miejscami albo pełne) i, gdy są, terminy,
 * które odbyły się bez zapisu osoby. Każdy stan — ładowanie, błąd, brak
 * połączenia, brak dostępu, wygasły dostęp, nie znaleziono, brak terminów —
 * stoi w obszarach szablonu, więc jedyny `main` jest zawsze korzeniem szablonu.
 *
 * Zachowanie starego ekranu bez zmian (`./POMIAR-STAREGO-EKRANU.md`): te same
 * trzy żądania, termin z odpowiedzi zastępuje kartę bez ponownego odczytu, a
 * po nieudanym zapisie albo wypisie lista jest wczytywana jeszcze raz (gdy to
 * też się nie uda, wczytane terminy zostają na ekranie). Nowe: wypis pyta o
 * potwierdzenie, a wynik mówi wspólny `Toast`.
 *
 * Jeden przycisk główny na stan: zielony jest wyłącznie „Zapisz się” przy
 * najbliższym terminie, na który można się teraz zapisać; pozostałe przyciski
 * są obrysowane, a każdy wyłączony ma zdanie z powodem. Okno wypisu nie
 * używa wariantu „niebezpieczne”: we wspólnym przycisku daje on czerwony
 * napis na zielonym tle, nieczytelny (wypis da się cofnąć ponownym zapisem).
 */
export function SuperwizjaUczestnika() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [proba, setProba] = useState(0);
  const [trwa, setTrwa] = useState<{ id: number; akcja: Akcja } | null>(null);
  const [bledy, setBledy] = useState<Record<number, { akcja: Akcja; tresc: string }>>({});
  const [bladOdswiezenia, setBladOdswiezenia] = useState(false);
  const [pytanieWypisu, setPytanieWypisu] = useState<TerminSuperwizji | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Termin, którego przycisk dostaje fokus po zmianie (karta przechodzi między częściami ekranu).
  const celFokusu = useRef<number | null>(null);
  // Czy lista była już wczytana — wtedy nieudane odświeżenie nie zabiera jej z ekranu.
  const wczytano = useRef(false);
  const idTwoich = useId();
  const idWolnych = useId();
  const idMinionych = useId();

  useEffect(() => {
    let aktualne = true;
    pobierzTerminy()
      .then(({ terminy, meta }) => {
        if (!aktualne) return;
        wczytano.current = true;
        setBladOdswiezenia(false);
        setStan({ rodzaj: "gotowy", terminy, meta });
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        // Nieudane odświeżenie przy wczytanej liście zostawia listę na ekranie (jak na starym ekranie).
        if (wczytano.current) setBladOdswiezenia(true);
        else setStan({ rodzaj: "blad", blad: rodzajBleduOdczytu(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [proba]);

  useEffect(() => {
    const id = celFokusu.current;
    if (id === null) return;
    celFokusu.current = null;
    document.querySelector<HTMLElement>(`[data-termin="${id}"] button`)?.focus();
  });

  function ponow() {
    wczytano.current = false;
    setBladOdswiezenia(false);
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  function odswiez() {
    setProba((p) => p + 1);
  }

  async function wykonaj(termin: TerminSuperwizji, akcja: Akcja) {
    if (trwa !== null) return;
    setTrwa({ id: termin.id, akcja });
    setToast(null);
    setBledy((poprzednie) => {
      const reszta = { ...poprzednie };
      delete reszta[termin.id];
      return reszta;
    });
    try {
      const zmieniony = akcja === "zapis" ? await zapiszNaTermin(termin.id) : await wypiszZTerminu(termin.id);
      setStan((poprzedni) =>
        poprzedni.rodzaj === "gotowy"
          ? { ...poprzedni, terminy: poprzedni.terminy.map((t) => (t.id === zmieniony.id ? zmieniony : t)) }
          : poprzedni,
      );
      celFokusu.current = zmieniony.id;
      setToast(
        akcja === "zapis"
          ? `Zapisano Cię na termin ${nazwaTerminu(zmieniony)}.`
          : `Wypisano Cię z terminu ${nazwaTerminu(zmieniony)}.`,
      );
    } catch (blad: unknown) {
      setBledy((poprzednie) => ({ ...poprzednie, [termin.id]: { akcja, tresc: komunikatBleduAkcji(blad) } }));
      odswiez();
    } finally {
      setTrwa(null);
    }
  }

  const naglowek = (
    <PageHeader okruszki={OKRUSZKI} tytul={TYTUL} opis={OPIS} onPowrot={() => router.back()} />
  );

  if (stan.rodzaj === "ladowanie") {
    return <ListTemplate naglowek={naglowek} lista={<Skeleton wiersze={6} />} />;
  }

  if (stan.rodzaj === "blad") {
    return <ListTemplate naglowek={naglowek} lista={<StanBledu blad={stan.blad} onPonow={ponow} />} />;
  }

  const { terminy, meta } = stan;

  if (terminy.length === 0) {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyStateCard
            naglowek="Nie ma jeszcze terminów superwizji"
            tresc="Terminy pojawią się tutaj, gdy Twój superwizor je wyznaczy. Lista jest też pusta, dopóki nie masz przypisanego superwizora."
            przycisk={{ etykieta: "Odśwież", onClick: ponow }}
          />
        }
      />
    );
  }

  const { twoje, wolne, minione } = podzielTerminy(terminy);
  const pierwszyDoZapisu = wolne.find(czyMoznaSieZapisac)?.id ?? null;

  const karta = (termin: TerminSuperwizji) => (
    <KartaTerminu
      key={termin.id}
      termin={termin}
      glowny={termin.id === pierwszyDoZapisu}
      trwa={trwa?.id === termin.id ? trwa.akcja : null}
      blad={bledy[termin.id]}
      onZapis={() => void wykonaj(termin, "zapis")}
      onWypis={() => setPytanieWypisu(termin)}
    />
  );

  return (
    <>
      <ListTemplate
        naglowek={naglowek}
        lista={
          <div className={style.tresc}>
            {bladOdswiezenia && (
              <Notice
                wariant="error"
                tytul="Nie udało się odświeżyć listy"
                akcja={
                  <Button poziom="outline" onClick={odswiez}>
                    Spróbuj ponownie
                  </Button>
                }
              >
                Widzisz terminy sprzed odświeżenia — liczba wolnych miejsc mogła się zmienić.
              </Notice>
            )}

            <section className={style.sekcja} aria-labelledby={idTwoich}>
              <Heading stopien={2} id={idTwoich}>
                Twoje terminy
              </Heading>
              {twoje.length > 0 ? (
                <>
                  <Hint>{`Masz zapis na ${tekstTerminow(twoje.length)}.`}</Hint>
                  <ul className={style.lista}>{twoje.map(karta)}</ul>
                </>
              ) : (
                <Text>
                  {wolne.length > 0
                    ? "Nie masz jeszcze zapisu na żaden termin. Wybierz termin z listy „Wolne terminy” niżej."
                    : "Nie masz zapisu na żaden termin."}
                </Text>
              )}
            </section>

            <section className={style.sekcja} aria-labelledby={idWolnych}>
              <Heading stopien={2} id={idWolnych}>
                Wolne terminy
              </Heading>
              {wolne.length > 0 ? (
                <>
                  <Hint>Terminy Twojego superwizora, od najbliższego.</Hint>
                  <ul className={style.lista}>{wolne.map(karta)}</ul>
                </>
              ) : (
                <Text>Nie ma teraz wolnych terminów u Twojego superwizora. Zajrzyj tu później.</Text>
              )}
            </section>

            {minione.length > 0 && (
              <section className={style.sekcja} aria-labelledby={idMinionych}>
                <Heading stopien={2} id={idMinionych}>
                  Terminy, które już się odbyły
                </Heading>
                <Hint>Na te terminy nie było Twojego zapisu.</Hint>
                <ul className={style.lista}>{minione.map(karta)}</ul>
              </section>
            )}

            {meta && meta.last_page > 1 && (
              <Hint>{`Widzisz pierwsze ${tekstTerminow(meta.per_page)} z ${meta.total}.`}</Hint>
            )}
          </div>
        }
      />
      {pytanieWypisu && (
        <Dialog
          tytul="Wypisać Cię z terminu?"
          etykietaWycofania="Nie wypisuj"
          etykietaPotwierdzenia="Wypisz się"
          onWycofaj={() => setPytanieWypisu(null)}
          onPotwierdz={() => {
            const termin = pytanieWypisu;
            setPytanieWypisu(null);
            void wykonaj(termin, "wypis");
          }}
        >
          <Text>
            {`Termin ${nazwaTerminu(pytanieWypisu)}. Twoje miejsce zwolni się dla innych osób. Zapisać się ponownie możesz, dopóki termin się nie rozpoczął i są wolne miejsca.`}
          </Text>
        </Dialog>
      )}
      {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </>
  );
}

/**
 * Komunikat stanu bez danych: tytuł jest nagłówkiem drugiego stopnia, żeby
 * pod `h1` ekranu nie przeskoczyć stopnia (`Notice` ma zawsze `h3`).
 */
function KomunikatStanu({ tytul, akcja, children }: { tytul: string; akcja: ReactNode; children: string }) {
  return (
    <div className={style.komunikat} role="alert">
      <Heading stopien={2}>{tytul}</Heading>
      <Text>{children}</Text>
      <div>{akcja}</div>
    </div>
  );
}

/** Stany bez danych: błąd serwera, brak połączenia, brak dostępu, wygasły dostęp, nie znaleziono. */
function StanBledu({ blad, onPonow }: { blad: BladOdczytu; onPonow: () => void }) {
  const router = useRouter();
  const doPulpitu = () => router.push(ADRES_PULPITU);
  const ponow = (
    <Button poziom="outline" onClick={onPonow}>
      Spróbuj ponownie
    </Button>
  );
  switch (blad) {
    case "siec":
      return (
        <KomunikatStanu tytul="Brak połączenia" akcja={ponow}>
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </KomunikatStanu>
      );
    case "blad":
      return (
        <KomunikatStanu tytul="Nie udało się wczytać terminów" akcja={ponow}>
          Coś poszło nie tak po naszej stronie. Twoje zapisy są bezpieczne — spróbuj ponownie za chwilę.
        </KomunikatStanu>
      );
    case "zakazane":
      return (
        <EkranOdmowy
          rodzaj="brak-dostepu"
          stopien={2}
          rolaDocelowa="wolontariuszy"
          coDalej="Na superwizję zapisują się osoby w programie wolontariackim."
          przycisk={{ onClick: doPulpitu }}
        />
      );
    case "wygasl":
      return (
        <EkranOdmowy
          rodzaj="dostep-wygasl"
          stopien={2}
          coDalej="Na terminy superwizji nie da się teraz zapisać. Jeśli to pomyłka, napisz do zespołu programu."
          przycisk={{ onClick: doPulpitu }}
        />
      );
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="terminów superwizji"
          stopien={2}
          coDalej="Terminy mogą być chwilowo niedostępne. Odśwież stronę za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
  }
}
