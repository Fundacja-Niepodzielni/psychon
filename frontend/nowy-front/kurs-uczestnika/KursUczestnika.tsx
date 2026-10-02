"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Text } from "@/design-system/atomy/Text/Text";
import { Breadcrumbs } from "@/design-system/molekuly/Breadcrumbs/Breadcrumbs";
import { KorzenSzablonu } from "@/design-system/szablony/KontekstPowloki";
import { useDaneRamki } from "@/design-system/szablony/KontekstRamki";
import { okruszekRamki } from "@/design-system/szablony/OkruszekRamki";
import { adresLekcji } from "@/nowy-front/lekcja/adres";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { adresPowrotuZPodgladu, PasTrybuPodgladu, zParametremPodgladu } from "@/nowy-front/wspolne/tryb-podgladu";
import {
  ADRES_LISTY_KURSOW,
  adresTestu,
  pobierzKurs,
  sklasyfikujBladKursu,
  type BladKursu,
  type KursUczestnika as DaneKursu,
} from "./dane";
import {
  licznikLekcji,
  opisKursu,
  zbudujWidok,
  zdaniePostepu,
  czasLekcji,
  type LekcjaWiersza,
  type TematEkranu,
  type WidokKursu,
} from "./logika";
import style from "./KursUczestnika.module.css";

interface WlasciwosciKursUczestnika {
  slug: string;
  /**
   * Tryb podglądu (rozstrzyga go wyżej parametr adresu i rola konta —
   * `KursUczestnikaZAdresu`): pas „Tryb podglądu…” nad ekranem, wszystkie
   * lekcje otwarte bez kłódek (pole `locked` z odczytu jest ignorowane),
   * odnośniki do lekcji i testu niosą parametr podglądu. Jedna właściwość
   * steruje całością.
   */
  podglad?: boolean;
  /** Rola konta; razem z `podglad` wyznacza adres powrotu „Wróć do edycji kursu”. Bez roli pasa nie ma. */
  rola?: string | null;
}

type Wynik = { rodzaj: "ok"; kurs: DaneKursu } | { rodzaj: "blad"; blad: BladKursu };

const ZNACZNIK_UKONCZONA = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

/**
 * Strona kursu uczestnika (`/panel/kursy/[slug]`): tytuł, opis i jedyny
 * zielony przycisk („Rozpocznij lekcję 1” · „Kontynuuj lekcję N” · „Przejdź do
 * testu”) przy tytule, a na telefonie w stałym pasku u dołu; postęp kursu,
 * karty tematów z wierszami lekcji i karta testu. Dane z jednego odczytu
 * `GET /courses/{slug}`. Stany bez danych: ładowanie, błąd odczytu z
 * ponowieniem, kurs zamknięty kolejnością (zdanie z `message` serwera), brak
 * kursu, dostęp wygasły.
 */
export function KursUczestnika({ slug, podglad = false, rola = null }: WlasciwosciKursUczestnika) {
  const [proba, setProba] = useState(0);
  const [wczytane, setWczytane] = useState<{ klucz: string; wynik: Wynik } | null>(null);
  const klucz = `${slug}#${proba}`;

  useEffect(() => {
    let aktywne = true;
    pobierzKurs(slug).then(
      (kurs) => {
        if (aktywne) setWczytane({ klucz, wynik: { rodzaj: "ok", kurs } });
      },
      (wyjatek: unknown) => {
        if (aktywne) setWczytane({ klucz, wynik: { rodzaj: "blad", blad: sklasyfikujBladKursu(wyjatek) } });
      },
    );
    return () => {
      aktywne = false;
    };
  }, [slug, klucz]);

  const ponow = useCallback(() => setProba((n) => n + 1), []);
  const wynik = wczytane !== null && wczytane.klucz === klucz ? wczytane.wynik : null;

  if (wynik === null) {
    return (
      <PowlokaStanu tytul="Kurs">
        <p role="status" className={style.stanPusty}>
          Ładowanie kursu…
        </p>
        <Skeleton wiersze={6} />
      </PowlokaStanu>
    );
  }

  if (wynik.rodzaj === "blad") return <StanBezDanych blad={wynik.blad} onPonow={ponow} />;

  return <KursZDanymi kurs={wynik.kurs} podglad={podglad} rola={rola} />;
}

/** Wspólna ramka stanów bez danych: ten sam korzeń i ten sam powrót co ekran z danymi. */
function PowlokaStanu({ tytul, children }: { tytul: string; children: ReactNode }) {
  return (
    <KorzenSzablonu className={style.strona} styleId="kurs-uczestnika">
      <div className={style.stos}>
        <Heading stopien={1}>{tytul}</Heading>
        {children}
      </div>
    </KorzenSzablonu>
  );
}

/**
 * Komunikat stanu bez danych: wygląd jak `Notice`, ale tytuł jest nagłówkiem
 * drugiego stopnia — pod `h1` ekranu `Notice` (zawsze `h3`) łamałby kolejność
 * nagłówków.
 */
function KomunikatStanu({
  wariant,
  tytul,
  akcja,
  children,
}: {
  wariant: "warn" | "error";
  tytul: string;
  akcja: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${style.komunikat} ${wariant === "error" ? style.komunikatBlad : style.komunikatUwaga}`} role={wariant === "error" ? "alert" : undefined}>
      <Icon nazwa="help" />
      <div className={style.komunikatTresc}>
        <Heading stopien={2}>{tytul}</Heading>
        <Text>{children}</Text>
        <div className={style.komunikatAkcja}>{akcja}</div>
      </div>
    </div>
  );
}

function StanBezDanych({ blad, onPonow }: { blad: BladKursu; onPonow: () => void }) {
  const router = useRouter();
  const powrot = { etykieta: "Wróć do kursów", onClick: () => router.push(ADRES_LISTY_KURSOW) };
  switch (blad.rodzaj) {
    case "zamkniety":
      return (
        <PowlokaStanu tytul="Kurs">
          <EkranOdmowy rodzaj="brak-dostepu" stopien={2} coDalej={blad.komunikat} przycisk={powrot} />
        </PowlokaStanu>
      );
    case "dostep-wygasl":
      return (
        <PowlokaStanu tytul="Kurs">
          <EkranOdmowy
            rodzaj="dostep-wygasl"
            stopien={2}
            coDalej="Za chwilę przeniesiemy Cię na stronę z informacją o wygaśnięciu dostępu."
            przycisk={powrot}
          />
        </PowlokaStanu>
      );
    case "nie-znaleziono":
      return (
        <PowlokaStanu tytul="Kurs">
          <EkranOdmowy rodzaj="nie-znaleziono" stopien={2} coDalej="Sprawdź adres albo wróć do listy kursów." przycisk={powrot} />
        </PowlokaStanu>
      );
    case "siec":
      return (
        <PowlokaStanu tytul="Kurs">
          <KomunikatStanu
            wariant="error"
            tytul="Brak połączenia"
            akcja={
              <Button poziom="outline" onClick={onPonow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.
          </KomunikatStanu>
        </PowlokaStanu>
      );
    case "blad":
      return (
        <PowlokaStanu tytul="Kurs">
          <KomunikatStanu
            wariant="error"
            tytul="Nie udało się wczytać kursu"
            akcja={
              <Button poziom="outline" onClick={onPonow}>
                Spróbuj ponownie
              </Button>
            }
          >
            Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.
          </KomunikatStanu>
        </PowlokaStanu>
      );
  }
}

function KursZDanymi({ kurs, podglad, rola }: { kurs: DaneKursu; podglad: boolean; rola: string | null }) {
  // Podgląd bez roli, która ma dokąd wrócić, nie powstaje: ekran jest wtedy zwykły.
  const powrot = podglad ? adresPowrotuZPodgladu(rola, kurs.id) : null;
  const trybPodgladu = powrot !== null;
  const widok = zbudujWidok(kurs, { podglad: trybPodgladu });
  const daneRamki = useDaneRamki();
  const wRamce = daneRamki !== null;
  const idPowodu = useId();
  const korzen = useRef<HTMLDivElement>(null);
  const naglowek = useRef<HTMLDivElement>(null);
  const dok = useRef<HTMLDivElement>(null);
  const [przyklejony, setPrzyklejony] = useState(false);

  const maAkcje = widok.akcja.rodzaj !== "brak";
  const okruszki = [{ etykieta: "Kursy", href: ADRES_LISTY_KURSOW }, { etykieta: kurs.title }];
  const pozycjeOkruszkow = daneRamki
    ? okruszekRamki({ menu: daneRamki.menu, sciezka: daneRamki.sciezka, okruszki, tytul: kurs.title })
    : okruszki;

  // Wysokość stałego paska u dołu (telefon) i cień przyklejonego nagłówka (szeroki ekran).
  useEffect(() => {
    const element = korzen.current;
    const obszarAkcji = dok.current;
    if (element === null) return undefined;
    // Bez `matchMedia` (środowisko bez układu strony) ekran uznaje szeroki układ.
    const telefon = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 639px)") : { matches: false };
    const dokument = document.documentElement;
    const zapamietanyOdstep = dokument.style.scrollPaddingBottom;

    function zmierz() {
      if (element === null) return;
      const wysokosc = telefon.matches && obszarAkcji !== null ? Math.ceil(obszarAkcji.getBoundingClientRect().height) : 0;
      element.style.setProperty("--dock-h", `${wysokosc}px`);
      // Fokus i przewijanie do elementu nie kończą się pod stałym paskiem.
      dokument.style.scrollPaddingBottom = wysokosc > 0 ? `${wysokosc + 16}px` : zapamietanyOdstep;
      const glowa = naglowek.current;
      const wysokoscPaska = Number.parseFloat(getComputedStyle(element).getPropertyValue("--topbar-h")) || 0;
      setPrzyklejony(!telefon.matches && glowa !== null && window.scrollY > 0 && glowa.getBoundingClientRect().top <= wysokoscPaska + 0.5);
    }

    zmierz();
    window.addEventListener("resize", zmierz);
    window.addEventListener("scroll", zmierz, { passive: true });
    const obserwator = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(zmierz);
    if (obserwator !== null && obszarAkcji !== null) obserwator.observe(obszarAkcji);
    return () => {
      window.removeEventListener("resize", zmierz);
      window.removeEventListener("scroll", zmierz);
      obserwator?.disconnect();
      dokument.style.scrollPaddingBottom = zapamietanyOdstep;
    };
  }, [maAkcje, widok.akcja]);

  return (
    <KorzenSzablonu className={style.strona} styleId="kurs-uczestnika">
      <div
        ref={korzen}
        className={style.wnetrze}
        data-w-ramce={wRamce ? "" : undefined}
        data-z-paskiem={maAkcje ? "" : undefined}
      >
        {trybPodgladu && (
          <div className={style.podgladMiejsce}>
            <PasTrybuPodgladu powrot={powrot} />
          </div>
        )}

        {pozycjeOkruszkow.length > 0 && (
          <div className={style.okruszki}>
            <Breadcrumbs pozycje={pozycjeOkruszkow} oznaczBiezaca={wRamce} />
          </div>
        )}
        <a className={style.wroc} href={ADRES_LISTY_KURSOW} aria-label="Wróć do listy kursów">
          <span aria-hidden="true">‹</span>Kursy
        </a>

        <div
          ref={naglowek}
          className={`${style.glowa} ${przyklejony ? style.przyklejony : ""}`.trim()}
        >
          <div className={style.tytul}>
            <Heading stopien={1}>{kurs.title}</Heading>
            <div className={style.podtytulWiersz}>
              <p className={style.podtytul}>{opisKursu(widok.lekcje, widok.bezTestu)}</p>
              {widok.znacznikUkonczenia !== null && (
                <span className={style.znacznik}>
                  {ZNACZNIK_UKONCZONA}
                  {widok.znacznikUkonczenia}
                </span>
              )}
            </div>
            {widok.powrotDoKursow && (
              <a className={`${style.przycisk} ${style.powrotDoKursow}`} href={ADRES_LISTY_KURSOW} data-powrot-do-kursow="">
                Wróć do kursów
              </a>
            )}
          </div>
          {widok.akcja.rodzaj !== "brak" && (
            <div className={style.dok} ref={dok}>
              <div className={style.akcje}>
                <a
                  className={`${style.przycisk} ${style.przyciskGlowny}`}
                  href={zParametremPodgladu(widok.akcja.href, trybPodgladu)}
                  aria-describedby={idPowodu}
                  data-przycisk-glowny=""
                >
                  {widok.akcja.etykieta}
                </a>
                <p className={style.powod} id={idPowodu}>
                  {widok.akcja.powod}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className={style.stos}>
          {widok.razem === 0 ? (
            <section className={style.karta} aria-labelledby={`${idPowodu}-pusty`}>
              <div className={style.kartaNaglowek}>
                <Heading stopien={2} id={`${idPowodu}-pusty`}>
                  Lekcje
                </Heading>
              </div>
              <p className={style.stanPusty}>Ten kurs nie ma jeszcze opublikowanych lekcji.</p>
            </section>
          ) : (
            <>
              <Postep widok={widok} />
              {widok.tematy.map((temat) => (
                <KartaTematu key={temat.klucz} temat={temat} slug={kurs.slug} podglad={trybPodgladu} />
              ))}
              {!widok.bezTestu && <KartaTestu widok={widok} slug={kurs.slug} idPowodu={idPowodu} podglad={trybPodgladu} />}
            </>
          )}
        </div>
      </div>
    </KorzenSzablonu>
  );
}

function Postep({ widok }: { widok: WidokKursu }) {
  const pierwszaNieukonczona = widok.indeksNastepnej;
  return (
    <div className={style.postep}>
      <div className={style.kroki} aria-hidden="true">
        {widok.lekcje.map((lekcja, indeks) => (
          <i
            key={lekcja.id}
            className={`${style.krok} ${lekcja.is_completed ? style.krokZrobiony : indeks === pierwszaNieukonczona ? style.krokTeraz : ""}`.trim()}
          />
        ))}
      </div>
      <p className={style.postepTekst}>{zdaniePostepu(widok.ukonczone, widok.razem)}</p>
    </div>
  );
}

function KartaTematu({ temat, slug, podglad }: { temat: TematEkranu; slug: string; podglad: boolean }) {
  const id = useId();
  return (
    <section className={style.karta} aria-labelledby={id} data-temat={temat.klucz}>
      <div className={style.kartaNaglowek}>
        <Heading stopien={2} id={id}>
          {temat.tytul}
        </Heading>
        <p className={style.licznik}>{licznikLekcji(temat.ukonczone, temat.razem)}</p>
      </div>
      <ol className={style.lista}>
        {temat.wiersze.map((wiersz) => (
          <WierszLekcji key={wiersz.lekcja.id} wiersz={wiersz} slug={slug} podglad={podglad} />
        ))}
      </ol>
    </section>
  );
}

function WierszLekcji({ wiersz, slug, podglad }: { wiersz: LekcjaWiersza; slug: string; podglad: boolean }) {
  const { lekcja, numer, zamknieta, poLekcji, etykieta, postep } = wiersz;
  const czas = czasLekcji(lekcja);
  return (
    <li className={`${style.wiersz} ${zamknieta ? style.zamknieta : ""}`.trim()} data-lekcja={lekcja.id} data-zamknieta={zamknieta ? "" : undefined}>
      <span className={style.numer} aria-hidden="true">
        {numer}
      </span>
      <div>
        <b className={style.lekcjaTytul}>{lekcja.title}</b>
        {czas !== null && <span className={style.lekcjaMeta}>{czas}</span>}
        {lekcja.is_completed && (
          <span className={style.znacznik}>
            {ZNACZNIK_UKONCZONA}
            Ukończona
          </span>
        )}
        {postep !== null && <span className={style.lekcjaPostep}>{postep}</span>}
      </div>
      {zamknieta ? (
        <span className={style.zamkniecie}>
          <span className={style.ikona}>
            <Icon nazwa="lock" rozmiar={16} />
          </span>
          {poLekcji !== null ? `Po ukończeniu lekcji ${poLekcji}` : "Lekcja zamknięta"}
        </span>
      ) : (
        <a
          className={style.przycisk}
          href={zParametremPodgladu(adresLekcji(lekcja.id, slug), podglad)}
          aria-label={`${etykieta}: lekcja ${numer}, ${lekcja.title}`}
        >
          {etykieta}
        </a>
      )}
    </li>
  );
}

function KartaTestu({ widok, slug, idPowodu, podglad }: { widok: WidokKursu; slug: string; idPowodu: string; podglad: boolean }) {
  const idNaglowka = `${idPowodu}-test`;
  const idZdania = `${idPowodu}-test-zdanie`;
  return (
    <section className={style.karta} aria-labelledby={idNaglowka} data-karta-testu="">
      <div className={style.kartaNaglowek}>
        <Heading stopien={2} id={idNaglowka}>
          Test końcowy
        </Heading>
      </div>
      <p className={style.zapowiedz} id={idZdania}>
        {widok.test.zdanie}
      </p>
      {widok.test.czynny ? (
        <a className={style.przycisk} href={zParametremPodgladu(adresTestu(slug), podglad)} aria-describedby={idZdania}>
          Przejdź do testu
        </a>
      ) : (
        <button
          type="button"
          className={`${style.przycisk} ${style.nieczynny}`}
          aria-disabled="true"
          aria-describedby={idZdania}
          onClick={(zdarzenie) => zdarzenie.preventDefault()}
        >
          <span className={style.ikona}>
            <Icon nazwa="lock" rozmiar={16} />
          </span>
          Przejdź do testu
        </button>
      )}
    </section>
  );
}
