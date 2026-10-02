"use client";

import { useZgloszenieNiezapisanychZmian } from "@/design-system/szablony/NiezapisaneZmiany";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/atomy/Button/Button";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { EmptyState } from "@/design-system/molekuly/EmptyState/EmptyState";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Pagination } from "@/design-system/molekuly/Pagination/Pagination";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import {
  RecordList,
  type KolumnaRecordList,
  type KomorkaRecordList,
} from "@/design-system/organizmy/RecordList/RecordList";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";
import type { PaginationMeta } from "@/lib/api/klient";
import { formatujDate } from "../wspolne/daty";
import { fokusNaNaglowku, naglowekEkranu, odbierzZapowiedzFokusu } from "../wspolne/fokus-otwartej-sprawy";
import { dniOczekiwania, tekstPlakietkiCzekania, wariantPlakietkiCzekania } from "../sprawy/wiek";
import {
  czyBrakUprawnien,
  nazwaOsoby,
  pobierzWpisyDoDecyzji,
  sklasyfikujBladDecyzji,
  zapiszDecyzje,
  type RodzajDecyzji,
  type WpisDoDecyzji,
} from "./dane";
import { PanelDyzuru, TEKSTY_DECYZJI, type OtwartaDecyzja, type RodzajDecyzjiZKomentarzem } from "./PanelDyzuru";

type StanListy =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "blad" }
  | { rodzaj: "gotowy"; wpisy: WpisDoDecyzji[]; meta: PaginationMeta | undefined };

interface KomunikatBledu {
  tytul: string;
  tresc: string;
}

const OKRUSZKI = [{ etykieta: "Administracja" }, { etykieta: "Dyżury do decyzji" }];

/** Kolumny listy dyżurów: dyżur (pod nazwą osoba), stan oczekiwania, godziny do prawej, akcja na końcu. */
export const KOLUMNY_DYZUROW: KolumnaRecordList[] = [
  { nazwa: "Dyżur", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Godziny", rodzaj: "liczba", klucz: "godziny" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

/**
 * Dyżur wskazany w adresie: `?dyzur=ID` (dodatnia liczba całkowita), które
 * dokleja „Otwórz” na ekranie „Sprawy do decyzji”. Inna wartość — brak.
 */
export function dyzurZAdresu(zapytanie: string): number | null {
  const wartosc = new URLSearchParams(zapytanie).get("dyzur");
  if (wartosc === null || !/^[1-9]\d*$/.test(wartosc)) return null;
  const id = Number(wartosc);
  return Number.isSafeInteger(id) ? id : null;
}

/** Godziny dyżuru (dziesiętny string z API) jako liczba z jednostką; napis nieliczbowy wraca dosłownie. */
export function komorkaGodzin(godziny: string): KomorkaRecordList {
  const liczba = Number(godziny);
  return godziny.trim() !== "" && Number.isFinite(liczba) ? { liczba, jednostka: "h" } : { tekst: godziny };
}

/**
 * Ekran decyzji o dyżurach na szablonie `ListTemplate` (makieta A-02, sprawa
 * „Dyżur”): nagłówek, lista dyżurów czekających na decyzję (serwer podaje
 * kolejność: od najstarszego zgłoszenia) i stronicowanie. Każdy stan —
 * ładowanie, dane, pusty, brak uprawnień, błąd sieci — stoi w obszarach
 * szablonu, więc jedyny `main` jest zawsze korzeniem szablonu.
 *
 * Lista jest domyślnie ZWINIĘTA: `RecordList` w kolumnach jak we Sprawach —
 * „Dyżur” z osobą pod nazwą, stan „czeka N dni” (tekst, wariant i próg
 * z `../sprawy/wiek.ts`, bez kopii), godziny dyżuru do prawej i akcja
 * „Otwórz” (pełna nazwa i data tylko dla czytnika), wyglądem jak akcja wiersza
 * Spraw (obrys od 640 px, „Otwórz ›” poniżej), ale nadal przyciskiem. „Otwórz” rozwija pod wierszem panel dyżuru
 * (`./PanelDyzuru.tsx`) — naraz jeden — z danymi wpisu, godzinami osoby i
 * decyzjami; otwarty wiersz nie ma już „Otwórz”. „Wróć do listy” zwija panel
 * i oddaje fokus „Otwórz” tego wiersza. Nagłówek `h2` listy jest tylko dla
 * czytnika — wzrokowo lista stoi bezpośrednio pod nagłówkiem ekranu.
 *
 * Decyzje: „Zatwierdź dyżur” (bez ciała), „Poproś o poprawkę” i „Odrzuć dyżur”.
 * Dwie ostatnie otwierają w panelu `FormSection` z wymaganym komentarzem —
 * bez okna dialogowego. Po decyzji wiersz znika z listy, a `Toast` potwierdza
 * wynik. Dyżur już rozstrzygnięty przez kogoś innego (403 `entry_locked`)
 * pokazuje komunikat z koperty i odświeża listę.
 *
 * Wejście z „Otwórz” na ekranie „Sprawy do decyzji” niesie w adresie
 * `?dyzur=ID`: po pierwszym wczytaniu listy ten dyżur jest od razu otwarty,
 * a jego panel bierze fokus i przewija się do widoku (jak po „Otwórz” w
 * wierszu). Dyżur, którego nie ma na wczytanej stronie (już rozstrzygnięty
 * albo dalej w kolejce), niczego nie otwiera — przy wejściu z „Otwórz” fokus
 * staje wtedy na nagłówku ekranu. Adres jest czytany raz, w przeglądarce.
 */
export function StazKolejka() {
  const router = useRouter();
  const [stan, setStan] = useState<StanListy>({ rodzaj: "ladowanie" });
  const [strona, setStrona] = useState(1);
  const [proba, setProba] = useState(0);
  // Chwila odczytu listy: od niej liczy się wiek dyżurów (w renderze nie czytamy zegara).
  const [teraz, setTeraz] = useState<number | null>(null);
  const [otwartyId, setOtwartyId] = useState<number | null>(null);
  const [decyzja, setDecyzja] = useState<OtwartaDecyzja | null>(null);
  const [zajete, setZajete] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [komunikat, setKomunikat] = useState<KomunikatBledu | null>(null);
  useZgloszenieNiezapisanychZmian(decyzja !== null && decyzja.komentarz.trim() !== "", "Kolejka stażu");
  const lista = useRef<HTMLDivElement>(null);
  // Wiersz, któremu po najbliższym renderze oddajemy fokus (na jego akcję „Otwórz”).
  const fokusWiersza = useRef<number | null>(null);
  // Wskazanie z adresu i zapowiedź fokusu są odbierane raz, przy pierwszym wczytaniu listy.
  const wskazanieOdebrane = useRef(false);
  // Po najbliższym renderze fokus na nagłówek ekranu (wskazany dyżur poza wczytaną stroną).
  const fokusNaglowka = useRef(false);

  useEffect(() => {
    let aktualne = true;
    pobierzWpisyDoDecyzji(strona)
      .then(({ wpisy, meta }) => {
        if (!aktualne) return;
        // Strona poza końcem (po decyzjach na ostatniej stronie) — cofnięcie o jedną.
        if (wpisy.length === 0 && strona > 1) {
          setStrona(strona - 1);
          return;
        }
        setTeraz(Date.now());
        setStan({ rodzaj: "gotowy", wpisy, meta });
        if (!wskazanieOdebrane.current) {
          wskazanieOdebrane.current = true;
          const zapowiedziany = odbierzZapowiedzFokusu();
          const wskazany = dyzurZAdresu(window.location.search);
          if (wskazany !== null && wpisy.some((wpis) => wpis.id === wskazany)) setOtwartyId(wskazany);
          else if (zapowiedziany) fokusNaglowka.current = true;
        }
      })
      .catch((blad: unknown) => {
        if (!aktualne) return;
        setStan(czyBrakUprawnien(blad) ? { rodzaj: "brak-uprawnien" } : { rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [strona, proba]);

  useEffect(() => {
    if (!fokusNaglowka.current) return;
    fokusNaglowka.current = false;
    fokusNaNaglowku(naglowekEkranu());
  });

  useEffect(() => {
    const id = fokusWiersza.current;
    if (id === null) return;
    fokusWiersza.current = null;
    lista.current?.querySelector<HTMLElement>(`[data-wiersz="${id}"] button`)?.focus();
  });

  function ponow() {
    setStan({ rodzaj: "ladowanie" });
    setProba((p) => p + 1);
  }

  function odswiez() {
    setProba((p) => p + 1);
  }

  function zmienStrone(nowa: number) {
    zamknijPanel();
    setStan({ rodzaj: "ladowanie" });
    setStrona(nowa);
  }

  function zamknijPanel() {
    setOtwartyId(null);
    setDecyzja(null);
  }

  function usunZListy(id: number) {
    setStan((poprzedni) => {
      if (poprzedni.rodzaj !== "gotowy") return poprzedni;
      const wpisy = poprzedni.wpisy.filter((wpis) => wpis.id !== id);
      const meta = poprzedni.meta && { ...poprzedni.meta, total: Math.max(poprzedni.meta.total - 1, 0) };
      return { rodzaj: "gotowy", wpisy, meta };
    });
  }

  async function wykonaj(rodzaj: RodzajDecyzji, wpis: WpisDoDecyzji, komentarz: string) {
    if (zajete !== null) return;
    setZajete(wpis.id);
    setKomunikat(null);
    try {
      await zapiszDecyzje(rodzaj, wpis.id, komentarz);
      // Fokus po decyzji: następny wiersz listy, a gdy go nie ma — poprzedni.
      if (stan.rodzaj === "gotowy") {
        const miejsce = stan.wpisy.findIndex((w) => w.id === wpis.id);
        fokusWiersza.current = (stan.wpisy[miejsce + 1] ?? stan.wpisy[miejsce - 1])?.id ?? null;
      }
      usunZListy(wpis.id);
      zamknijPanel();
      setToast(
        rodzaj === "zatwierdz"
          ? `Dyżur zatwierdzony: ${nazwaOsoby(wpis)}.`
          : `${TEKSTY_DECYZJI[rodzaj].toast} ${nazwaOsoby(wpis)}.`,
      );
      const pozostale = stan.rodzaj === "gotowy" ? stan.wpisy.filter((w) => w.id !== wpis.id).length : 0;
      if (pozostale === 0) odswiez();
    } catch (blad: unknown) {
      const opis = sklasyfikujBladDecyzji(blad);
      if (opis.rodzaj === "pola") {
        const bladKomentarza = opis.bledy.comment?.[0] ?? Object.values(opis.bledy)[0]?.[0];
        setDecyzja((biezaca) => (biezaca ? { ...biezaca, blad: bladKomentarza } : biezaca));
      } else if (opis.rodzaj === "rozstrzygniety" || opis.rodzaj === "brak-wpisu") {
        zamknijPanel();
        setKomunikat({ tytul: "Dyżur nie czeka już na decyzję", tresc: opis.komunikat });
        odswiez();
      } else {
        setKomunikat({ tytul: "Decyzja nie została zapisana", tresc: opis.komunikat });
      }
    } finally {
      setZajete(null);
    }
  }

  function otworz(wpis: WpisDoDecyzji) {
    setKomunikat(null);
    setDecyzja(null);
    setOtwartyId(wpis.id);
  }

  function wrocDoListy(wpis: WpisDoDecyzji) {
    fokusWiersza.current = wpis.id;
    zamknijPanel();
  }

  function otworzFormularz(rodzaj: RodzajDecyzjiZKomentarzem) {
    setKomunikat(null);
    setDecyzja({ rodzaj, komentarz: "", blad: undefined });
  }

  const naglowek = (
    <PageHeader
      okruszki={OKRUSZKI}
      tytul="Dyżury do decyzji"
      opis="Zatwierdź dyżur albo poproś o poprawkę. Odrzucenie jest ostateczne."
      onPowrot={() => router.back()}
    />
  );

  if (stan.rodzaj === "ladowanie") {
    return <ListTemplate naglowek={naglowek} lista={<Skeleton wiersze={5} />} />;
  }

  if (stan.rodzaj === "brak-uprawnien") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <EmptyState
            wariant="brak-uprawnien"
            naglowek="Dyżury do decyzji"
            rola="administracji"
            przycisk={{ etykieta: "Wróć", onClick: () => router.back() }}
          />
        }
      />
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <ListTemplate
        naglowek={naglowek}
        lista={
          <Notice
            wariant="error"
            tytul="Nie udało się wczytać dyżurów"
            akcja={
              <Button poziom="outline" onClick={ponow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Serwer nie odpowiedział albo zwrócił błąd. Żadne dane nie zostały zmienione.
          </Notice>
        }
      />
    );
  }

  const { wpisy, meta } = stan;

  const pusty = {
    naglowek: "Brak wpisów do decyzji",
    tresc: "Nowe dyżury pojawią się tutaj, gdy wolontariusze je zgłoszą.",
    przycisk: { etykieta: "Odśwież", onClick: ponow },
  };

  const zawartosc =
    wpisy.length === 0 ? (
      <>
        {komunikat && <KomunikatDecyzji komunikat={komunikat} />}
        <EmptyState naglowek={pusty.naglowek} tresc={pusty.tresc} przycisk={pusty.przycisk} />
      </>
    ) : (
      <>
        {komunikat && <KomunikatDecyzji komunikat={komunikat} />}
        {/* Kotwica fokusu: po decyzji i po „Wróć do listy” fokus wraca na „Otwórz” wiersza. */}
        <div ref={lista}>
          <RecordList
            tytul="Dyżury do decyzji"
            stopienNaglowka={2}
            naglowekTylkoDlaCzytnika
            naKarcie
            kolumny={KOLUMNY_DYZUROW}
            pusty={pusty}
            wiersze={wpisy.map((wpis) => {
              const osoba = nazwaOsoby(wpis);
              const dni = teraz === null ? null : dniOczekiwania(wpis.created_at ?? "", teraz);
              return {
                id: String(wpis.id),
                tytul: osoba,
                podpowiedz: `Czeka od ${formatujDate(wpis.created_at)}`,
                podpowiedzTylkoDlaCzytnika: true,
                plakietka:
                  dni === null
                    ? undefined
                    : { wariant: wariantPlakietkiCzekania(dni), tekst: tekstPlakietkiCzekania(dni) },
                komorki: { godziny: komorkaGodzin(wpis.hours) },
                akcja: {
                  etykieta: "Otwórz",
                  etykietaDostepna: `Otwórz dyżur: ${osoba}, z dnia ${formatujDate(wpis.date)}`,
                  onKliknij: () => otworz(wpis),
                },
                panel:
                  otwartyId === wpis.id ? (
                    <PanelDyzuru
                      wpis={wpis}
                      zajete={zajete !== null}
                      decyzja={decyzja}
                      onZatwierdz={() => void wykonaj("zatwierdz", wpis, "")}
                      onOtworzFormularz={otworzFormularz}
                      onZmienKomentarz={(wartosc) =>
                        setDecyzja((biezaca) => (biezaca ? { ...biezaca, komentarz: wartosc } : biezaca))
                      }
                      onZapiszFormularz={() => decyzja && void wykonaj(decyzja.rodzaj, wpis, decyzja.komentarz)}
                      onWroc={() => wrocDoListy(wpis)}
                    />
                  ) : undefined,
              };
            })}
          />
        </div>
      </>
    );

  return (
    <>
      <ListTemplate
        naglowek={naglowek}
        lista={zawartosc}
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

function KomunikatDecyzji({ komunikat }: { komunikat: KomunikatBledu }) {
  return (
    <Notice wariant="error" tytul={komunikat.tytul}>
      {komunikat.tresc}
    </Notice>
  );
}
