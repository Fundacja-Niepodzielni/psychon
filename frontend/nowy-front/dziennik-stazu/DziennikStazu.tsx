"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { ProgressBar } from "@/design-system/atomy/ProgressBar/ProgressBar";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import {
  RecordList,
  type KolumnaRecordList,
  type KomorkaRecordList,
  type WierszBezAkcjiRecordList,
  type WierszRecordList,
} from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import { ADRES_PULPITU, EkranOdmowy } from "../wspolne/ekran-odmowy";
import { formatujDate } from "../wspolne/daty";
import { formatujDziesietny } from "../wspolne/formatuj-dziesietny";
import { rowneWartosci } from "../wspolne/rowne-wartosci";
import { procentGodzin } from "../staz-kolejka/dane";
import {
  brakujaceGodziny,
  czyDoPoprawy,
  nazwaFormy,
  nazwaWpisu,
  pobierzDziennik,
  polaZWpisu,
  pustyFormularz,
  rodzajBleduOdczytu,
  sklasyfikujBladZapisu,
  stanWpisu,
  tekstGodzin,
  tekstKonsultacji,
  tekstWpisow,
  zapiszWpis,
  type BladOdczytu,
  type GodzinyStazu,
  type PolaWpisu,
  type WpisStazu,
} from "./dane";
import { FormularzWpisu } from "./FormularzWpisu";
import { nazwaUwagi, PanelWpisu } from "./PanelWpisu";
import style from "./DziennikStazu.module.css";

type StanEkranu =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad"; blad: BladOdczytu }
  | { rodzaj: "gotowy"; wpisy: WpisStazu[]; meta: PaginationMeta | undefined; godziny: GodzinyStazu };

/** Otwarty formularz: nowy wpis albo poprawka wpisu z listy. */
type Formularz = {
  pola: PolaWpisu;
  /** Wartości z chwili otwarcia — od nich liczy się „niezapisane zmiany”. */
  startowe: PolaWpisu;
  bledy: Record<string, string[]> | undefined;
  /** Zdanie ogólne pod formularzem (błąd sieci, błąd spoza pól). */
  komunikat: string | null;
  zapisywanie: boolean;
} & ({ tryb: "nowy" } | { tryb: "edycja"; wpis: WpisStazu });

interface KomunikatListy {
  tytul: string;
  tresc: string;
}

/** Dokąd wraca fokus po zamknięciu formularza albo panelu. */
type CelFokusu = { rodzaj: "dodaj" } | { rodzaj: "wiersz"; id: number };

const OKRUSZKI = [{ etykieta: "Dziennik stażu" }];
const TYTUL = "Dziennik stażu";
const OPIS = "Zapisuj dyżury i sprawdzaj, ile godzin stażu masz już zatwierdzonych.";
const DODAJ_WPIS = "Dodaj wpis";

/** Kolumny listy wpisów: dyżur (data, pod nią forma i konsultacje), stan, godziny do prawej, akcja na końcu. */
export const KOLUMNY_WPISOW: KolumnaRecordList[] = [
  { nazwa: "Dyżur", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Godziny", rodzaj: "liczba", klucz: "godziny" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

/** Godziny wpisu (dziesiętny string z API) jako liczba z jednostką „godz.”; napis nieliczbowy wraca dosłownie. */
export function komorkaGodzin(godziny: string): KomorkaRecordList {
  const liczba = Number(godziny);
  return godziny.trim() !== "" && Number.isFinite(liczba)
    ? { liczba, jednostka: "godz." }
    : { tekst: godziny };
}

/** Zdanie pod datą wpisu w wierszu listy: uwaga z decyzji, gdy jest. */
function podpowiedzWiersza(wpis: WpisStazu): string | undefined {
  if (wpis.review_comment) return `${nazwaUwagi(wpis)}: ${wpis.review_comment}`;
  if (wpis.status === "returned") return "Popraw wpis i wyślij go ponownie.";
  return undefined;
}

/**
 * Dziennik stażu osoby wolontariackiej na szablonie `ListTemplate`, tak jak
 * ekran decyzji o dyżurach po stronie administracji: nagłówek z jedynym
 * przyciskiem głównym „Dodaj wpis”, karta zatwierdzonych godzin, lista wpisów
 * (`RecordList` w kolumnach) i stronicowanie. Każdy stan — ładowanie, błąd,
 * brak połączenia, brak dostępu, nie znaleziono, pusty dziennik, lista,
 * dodawanie i poprawka — stoi w obszarach szablonu, więc jedyny `main` jest
 * zawsze korzeniem szablonu.
 *
 * Zachowanie starego ekranu bez zmian: te same żądania i pola (`./dane.ts`),
 * poprawić można wpis czekający na decyzję i wpis odesłany do poprawy,
 * zatwierdzony i odrzucony są zamknięte. Po zapisie wpis trafia na listę bez
 * ponownego odczytu, a potwierdzenie mówi wspólny `Toast`.
 *
 * Jeden przycisk główny na stan: „Dodaj wpis” w nagłówku, dopóki żaden
 * formularz nie jest otwarty; przy otwartym formularzu jedynym przyciskiem
 * głównym jest jego zapis, a wiersze nie mają akcji (zdanie nad listą mówi
 * dlaczego), żeby wpisane dane nie znikały po przypadkowym kliknięciu.
 * Wpis do poprawy otwiera formularz pod swoim wierszem, z uwagą na górze.
 */
export function DziennikStazu() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "ladowanie" });
  const [strona, setStrona] = useState(1);
  const [proba, setProba] = useState(0);
  const [formularz, setFormularz] = useState<Formularz | null>(null);
  const [szczegol, setSzczegol] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [komunikat, setKomunikat] = useState<KomunikatListy | null>(null);
  const celFokusu = useRef<CelFokusu | null>(null);
  const idGodzin = useId();

  useZgloszenieNiezapisanychZmian(
    formularz !== null && !rowneWartosci(formularz.pola, formularz.startowe),
    "Dziennik stażu",
  );

  useEffect(() => {
    let aktualne = true;
    pobierzDziennik(strona)
      .then(({ wpisy, meta, godziny }) => {
        if (aktualne) setStan({ rodzaj: "gotowy", wpisy, meta, godziny });
      })
      .catch((blad: unknown) => {
        if (aktualne) setStan({ rodzaj: "blad", blad: rodzajBleduOdczytu(blad) });
      });
    return () => {
      aktualne = false;
    };
  }, [strona, proba]);

  // Fokus po zamknięciu formularza albo panelu: „Dodaj wpis” w nagłówku albo akcja wiersza.
  useEffect(() => {
    const cel = celFokusu.current;
    if (cel === null) return;
    celFokusu.current = null;
    if (cel.rodzaj === "dodaj") {
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((przycisk) => przycisk.textContent === DODAJ_WPIS)
        ?.focus();
    } else {
      document.querySelector<HTMLElement>(`[data-wiersz="${cel.id}"] button`)?.focus();
    }
  });

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  function odswiez() {
    setProba((p) => p + 1);
  }

  function zmienStrone(nowa: number) {
    // Formularz nowego wpisu nie zależy od strony listy — zostaje; panel wiersza znika razem z wierszem.
    setFormularz((biezacy) => (biezacy?.tryb === "edycja" ? null : biezacy));
    setSzczegol(null);
    setStan({ rodzaj: "ladowanie" });
    setStrona(nowa);
  }

  function otworzNowy() {
    const pola = pustyFormularz();
    setKomunikat(null);
    setSzczegol(null);
    setFormularz({ tryb: "nowy", pola, startowe: pola, bledy: undefined, komunikat: null, zapisywanie: false });
  }

  function otworzWpis(wpis: WpisStazu) {
    setKomunikat(null);
    if (!czyDoPoprawy(wpis)) {
      setSzczegol(wpis.id);
      return;
    }
    const pola = polaZWpisu(wpis);
    setSzczegol(null);
    setFormularz({ tryb: "edycja", wpis, pola, startowe: pola, bledy: undefined, komunikat: null, zapisywanie: false });
  }

  function zamknijSzczegol(id: number) {
    celFokusu.current = { rodzaj: "wiersz", id };
    setSzczegol(null);
  }

  function zamknijFormularz() {
    if (formularz === null || formularz.zapisywanie) return;
    celFokusu.current = formularz.tryb === "nowy" ? { rodzaj: "dodaj" } : { rodzaj: "wiersz", id: formularz.wpis.id };
    setFormularz(null);
  }

  function zmienPole<K extends keyof PolaWpisu>(klucz: K, wartosc: PolaWpisu[K]) {
    setFormularz((biezacy) => (biezacy ? { ...biezacy, pola: { ...biezacy.pola, [klucz]: wartosc } } : biezacy));
  }

  async function zapisz() {
    if (formularz === null || formularz.zapisywanie) return;
    const biezacy = formularz;
    setFormularz({ ...biezacy, zapisywanie: true, bledy: undefined, komunikat: null });
    try {
      const zapisany = await zapiszWpis(biezacy.tryb === "nowy" ? null : biezacy.wpis.id, biezacy.pola);
      setStan((poprzedni) => {
        if (poprzedni.rodzaj !== "gotowy") return poprzedni;
        if (biezacy.tryb === "nowy") {
          const meta = poprzedni.meta && { ...poprzedni.meta, total: poprzedni.meta.total + 1 };
          return { ...poprzedni, wpisy: [zapisany, ...poprzedni.wpisy], meta };
        }
        return { ...poprzedni, wpisy: poprzedni.wpisy.map((wpis) => (wpis.id === zapisany.id ? zapisany : wpis)) };
      });
      celFokusu.current = biezacy.tryb === "nowy" ? { rodzaj: "dodaj" } : { rodzaj: "wiersz", id: zapisany.id };
      setFormularz(null);
      setToast(
        biezacy.tryb === "nowy"
          ? "Wpis zapisany i wysłany do decyzji."
          : biezacy.wpis.status === "returned"
            ? "Poprawiony wpis wysłany ponownie do decyzji."
            : "Zmiany zapisane. Wpis nadal czeka na decyzję.",
      );
    } catch (blad: unknown) {
      const opis = sklasyfikujBladZapisu(blad);
      if (opis.rodzaj === "zablokowany" || opis.rodzaj === "brak-wpisu") {
        setFormularz(null);
        setKomunikat(
          opis.rodzaj === "zablokowany"
            ? {
                tytul: "Tego wpisu nie można już zmienić",
                tresc: "Decyzja o wpisie zapadła w międzyczasie. Lista jest odświeżona i pokazuje jego stan.",
              }
            : { tytul: "Nie znaleziono wpisu", tresc: "Tego wpisu nie ma już w Twoim dzienniku. Lista jest odświeżona." },
        );
        odswiez();
        return;
      }
      setFormularz((poprzedni) =>
        poprzedni === null
          ? poprzedni
          : opis.rodzaj === "pola"
            ? {
                ...poprzedni,
                zapisywanie: false,
                bledy: opis.bledy,
                komunikat: opis.pozostale.length > 0 ? opis.pozostale.join(" ") : null,
              }
            : { ...poprzedni, zapisywanie: false, komunikat: opis.komunikat },
      );
    }
  }

  const naglowek = (przycisk: boolean) => (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul={TYTUL}
      opis={OPIS}
      onPowrot={() => router.back()}
      przyciskGlowny={przycisk ? { etykieta: DODAJ_WPIS, onKliknij: otworzNowy } : undefined}
    />
  );

  if (stan.rodzaj === "ladowanie") {
    return <ListTemplate naglowek={naglowek(false)} lista={<Skeleton wiersze={6} />} />;
  }

  if (stan.rodzaj === "blad") {
    return <ListTemplate naglowek={naglowek(false)} lista={<StanBledu blad={stan.blad} onPonow={ponow} />} />;
  }

  const { wpisy, meta, godziny } = stan;
  const doPoprawy = wpisy.filter((wpis) => wpis.status === "returned").length;
  const formularzOtwarty = formularz !== null;

  const wiersze = wpisy.map((wpis): WierszRecordList | WierszBezAkcjiRecordList => {
    const plakietka = stanWpisu(wpis.status);
    const nazwa = nazwaWpisu(wpis);
    const edytowany = formularz?.tryb === "edycja" && formularz.wpis.id === wpis.id;
    const baza: WierszBezAkcjiRecordList = {
      id: String(wpis.id),
      tytul: formatujDate(wpis.date),
      tytulDodatek: `${nazwaFormy(wpis.form)} · ${tekstKonsultacji(wpis.consultations_count)}`,
      podpowiedz: podpowiedzWiersza(wpis),
      plakietka: { wariant: plakietka.wariant, tekst: plakietka.tekst },
      komorki: { godziny: komorkaGodzin(wpis.hours) },
      panel: edytowany ? (
        <PanelPoprawki formularz={formularz} onZmiana={zmienPole} onZapisz={() => void zapisz()} onAnuluj={zamknijFormularz} />
      ) : szczegol === wpis.id ? (
        <PanelWpisu wpis={wpis} onWroc={() => zamknijSzczegol(wpis.id)} />
      ) : undefined,
    };
    if (formularzOtwarty) return baza;
    const etykieta = wpis.status === "returned" ? "Popraw wpis" : wpis.status === "submitted" ? "Edytuj wpis" : "Szczegóły";
    return {
      ...baza,
      akcja: {
        etykieta,
        etykietaDostepna: wpis.status === "accepted" || wpis.status === "rejected" ? `Szczegóły: ${nazwa}` : `${etykieta} z ${formatujDate(wpis.date)}`,
        onKliknij: () => otworzWpis(wpis),
      },
    };
  });

  const lista = (
    <div className={style.tresc}>
      <KartaGodzin id={idGodzin} godziny={godziny} liczbaWpisow={meta?.total ?? wpisy.length} />
      {komunikat && (
        <Notice wariant="error" tytul={komunikat.tytul}>
          {komunikat.tresc}
        </Notice>
      )}
      {doPoprawy > 0 && !formularzOtwarty && (
        <Notice wariant="warn" tytul="Wpisy do poprawy">
          {`Masz ${tekstWpisow(doPoprawy)} do poprawy. Otwórz ${doPoprawy === 1 ? "go" : "je"} przyciskiem „Popraw wpis” na liście i wyślij ponownie.`}
        </Notice>
      )}
      {formularz?.tryb === "nowy" && (
        <div className={style.formularz}>
          {formularz.komunikat && (
            <Notice wariant="error" tytul="Wpis nie został zapisany">
              {formularz.komunikat}
            </Notice>
          )}
          <FormularzWpisu
            id="nowy-wpis"
            tytul="Dodaj wpis"
            pola={formularz.pola}
            bledy={formularz.bledy}
            zapisywanie={formularz.zapisywanie}
            etykietaZapisz="Zapisz i wyślij"
            etykietaAnuluj="Anuluj"
            onZmiana={zmienPole}
            onZapisz={() => void zapisz()}
            onAnuluj={zamknijFormularz}
          />
        </div>
      )}
      {formularzOtwarty && wpisy.length > 0 && <Hint>Inne wpisy otworzysz po zapisaniu albo zamknięciu formularza.</Hint>}
      {formularzOtwarty && wpisy.length === 0 ? (
        <Hint>Nie masz jeszcze innych wpisów — ten będzie pierwszy.</Hint>
      ) : (
        <RecordList
          tytul="Twoje wpisy"
          stopienNaglowka={2}
          naKarcie
          kolumny={KOLUMNY_WPISOW}
          pusty={{
            naglowek: "Nie masz jeszcze wpisów",
            tresc: "Dodaj pierwszy dyżur. Po zapisaniu trafi do decyzji, a zatwierdzone godziny policzą się powyżej.",
            przycisk: { etykieta: "Dodaj pierwszy wpis", onClick: otworzNowy },
          }}
          wiersze={wiersze}
        />
      )}
    </div>
  );

  return (
    <>
      <ListTemplate
        naglowek={naglowek(!formularzOtwarty)}
        lista={lista}
        stronicowanie={
          meta && meta.last_page > 1 ? (
            <Pagination
              strona={meta.current_page}
              stron={meta.last_page}
              naPoprzednia={() => zmienStrone(meta.current_page - 1)}
              naNastepna={() => zmienStrone(meta.current_page + 1)}
            />
          ) : undefined
        }
      />
      {toast && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </>
  );
}

/** Karta zatwierdzonych godzin: pasek, liczba z jednostką i zdanie, ile jeszcze brakuje. */
function KartaGodzin({ id, godziny, liczbaWpisow }: { id: string; godziny: GodzinyStazu; liczbaWpisow: number }) {
  const zatwierdzone = formatujDziesietny(godziny.zatwierdzone);
  const brakuje = brakujaceGodziny(godziny);
  const maWymagane = brakuje !== null && Number(godziny.wymagane) > 0;
  return (
    <section className={style.karta} aria-labelledby={id}>
      <Heading stopien={2} id={id}>
        Zatwierdzone godziny
      </Heading>
      {maWymagane ? (
        <ProgressBar
          procent={procentGodzin(godziny.zatwierdzone, godziny.wymagane)}
          etykieta={`${zatwierdzone} z ${tekstGodzin(godziny.wymagane)}`}
        />
      ) : (
        <Text>{`${tekstGodzin(godziny.zatwierdzone)} zatwierdzonych`}</Text>
      )}
      <Hint>
        {maWymagane && Number(brakuje) > 0
          ? `Brakuje jeszcze ${tekstGodzin(brakuje ?? "0")}. Liczą się tylko zatwierdzone wpisy.`
          : maWymagane
            ? "Masz już wszystkie wymagane godziny stażu."
            : "Liczą się tylko zatwierdzone wpisy."}
      </Hint>
      <Hint>{`W dzienniku: ${tekstWpisow(liczbaWpisow)}.`}</Hint>
    </section>
  );
}

/** Formularz poprawki otwarty pod wierszem wpisu; nad nim uwaga z decyzji, gdy jest. */
function PanelPoprawki({
  formularz,
  onZmiana,
  onZapisz,
  onAnuluj,
}: {
  formularz: Formularz & { tryb: "edycja" };
  onZmiana: <K extends keyof PolaWpisu>(klucz: K, wartosc: PolaWpisu[K]) => void;
  onZapisz: () => void;
  onAnuluj: () => void;
}) {
  const { wpis } = formularz;
  const doPoprawy = wpis.status === "returned";
  return (
    <div className={style.panel}>
      {doPoprawy && (
        <Notice wariant="warn" tytul="Co trzeba poprawić">
          {wpis.review_comment ?? "Popraw wpis i wyślij go ponownie."}
        </Notice>
      )}
      {formularz.komunikat && (
        <Notice wariant="error" tytul="Wpis nie został zapisany">
          {formularz.komunikat}
        </Notice>
      )}
      <div className={style.formularz}>
        <FormularzWpisu
          id={`wpis-${wpis.id}`}
          tytul={`${doPoprawy ? "Popraw" : "Edytuj"} ${nazwaWpisu(wpis)}`}
          pola={formularz.pola}
          bledy={formularz.bledy}
          zapisywanie={formularz.zapisywanie}
          etykietaZapisz={doPoprawy ? "Wyślij poprawiony wpis" : "Zapisz zmiany"}
          etykietaAnuluj="Wróć do listy"
          onZmiana={onZmiana}
          onZapisz={onZapisz}
          onAnuluj={onAnuluj}
        />
      </div>
    </div>
  );
}

/** Stany bez danych: błąd serwera, brak połączenia, brak dostępu, wygasły dostęp, nie znaleziono. */
function StanBledu({ blad, onPonow }: { blad: BladOdczytu; onPonow: () => void }) {
  const router = useRouter();
  const doPulpitu = () => router.push(ADRES_PULPITU);
  switch (blad) {
    case "siec":
      return (
        <Notice
          wariant="error"
          tytul="Brak połączenia"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
        </Notice>
      );
    case "blad":
      return (
        <Notice
          wariant="error"
          tytul="Nie udało się wczytać dziennika"
          akcja={
            <Button poziom="outline" onClick={onPonow}>
              Spróbuj ponownie
            </Button>
          }
        >
          Coś poszło nie tak po naszej stronie. Twoje wpisy są bezpieczne — spróbuj ponownie za chwilę.
        </Notice>
      );
    case "zakazane":
      return (
        <EkranOdmowy
          rodzaj="brak-dostepu"
          stopien={2}
          rolaDocelowa="wolontariuszy"
          coDalej="Dziennik stażu prowadzą osoby w programie wolontariackim."
          przycisk={{ onClick: doPulpitu }}
        />
      );
    case "wygasl":
      return (
        <EkranOdmowy
          rodzaj="dostep-wygasl"
          stopien={2}
          coDalej="Wpisów nie da się teraz dodawać ani poprawiać. Jeśli to pomyłka, napisz do zespołu programu."
          przycisk={{ onClick: doPulpitu }}
        />
      );
    case "nie-znaleziono":
      return (
        <EkranOdmowy
          rodzaj="nie-znaleziono"
          czego="dziennika stażu"
          stopien={2}
          coDalej="Dziennik może być chwilowo niedostępny. Odśwież stronę za chwilę."
          przycisk={{ etykieta: "Odśwież", onClick: onPonow }}
        />
      );
  }
}
