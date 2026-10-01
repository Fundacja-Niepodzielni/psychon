"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { NBSP, procentWyslania } from "@/nowy-front/lekcja-edycja/nagranie";
import { czyAdresZPaskiemWysylania } from "./adresy";
import { PasekPostepu } from "./PasekPostepu";
import { uchwytWysylania } from "./uchwyt";
import { useWysylanie } from "./useWysylanie";
import style from "./Wysylanie.module.css";

/** Czas między przerwaniem wysyłania a przejściem, na które osoba się zgodziła. */
const ZWLOKA_PRZEJSCIA_MS = 50;

/** Kotwica karty „Nagranie” na stronie lekcji. */
export const KOTWICA_NAGRANIA = "nagranie";

/** Wyjście na ekran bez paska wysyłania, wstrzymane pytaniem. */
interface Wyjscie {
  adres: string;
  /** Odnośnik, który wywołał wyjście — po „Zostań” fokus wraca na niego. */
  wyzwalacz: HTMLAnchorElement;
}

/** Odnośnik do adresu tej aplikacji otwierany w tej samej karcie przeglądarki, zwykłym kliknięciem. */
function odnosnikWewnetrzny(zdarzenie: MouseEvent): HTMLAnchorElement | null {
  if (zdarzenie.button !== 0 || zdarzenie.metaKey || zdarzenie.ctrlKey || zdarzenie.shiftKey || zdarzenie.altKey) return null;
  const cel = zdarzenie.target instanceof Element ? zdarzenie.target.closest<HTMLAnchorElement>("a[href]") : null;
  const adres = cel?.getAttribute("href");
  if (!cel || !adres || !adres.startsWith("/") || adres.startsWith("//")) return null;
  if (cel.target !== "" && cel.target !== "_self") return null;
  if (cel.hasAttribute("download")) return null;
  return cel;
}

/**
 * Pasek wysyłania nagrania u góry ramy panelu i straż przejść w trakcie
 * wysyłania. Bez wysyłania nie rysuje niczego i nie zmienia żadnego przejścia.
 *
 * W trakcie wysyłania:
 * - odnośnik do ekranu z paskiem przechodzi bez przeładowania dokumentu, więc
 *   wysyłanie trwa dalej;
 * - odnośnik do każdego innego ekranu najpierw pyta — wysyłanie nie urywa się
 *   po cichu; osoba może zostać;
 * - zamknięcie albo przeładowanie karty przeglądarki wywołuje pytanie przeglądarki.
 */
export function PasekWysylania() {
  const stan = useWysylanie();
  const sciezka = usePathname() ?? "";
  const router = useRouter();
  const [wyjscie, setWyjscie] = useState<Wyjscie | null>(null);
  // Osoba wybrała „Przejdź”: to wysyłanie nie pyta już o żadne wyjście.
  const zgodaNaWyjscie = useRef(false);
  const trwa = stan.rodzaj === "wysylanie";

  // Zgoda dotyczy jednego wysyłania: gdy się skończy albo stanie, następne pyta od nowa.
  useEffect(() => {
    if (!trwa) zgodaNaWyjscie.current = false;
  }, [trwa]);

  useEffect(() => {
    if (!trwa) return;

    function naZamkniecie(zdarzenie: BeforeUnloadEvent) {
      if (zgodaNaWyjscie.current) return;
      zdarzenie.preventDefault();
    }

    // Przed innymi obsługami kliknięcia: ekran bez paska wymaga pytania.
    function przedInnymi(zdarzenie: MouseEvent) {
      if (zgodaNaWyjscie.current) return;
      const cel = odnosnikWewnetrzny(zdarzenie);
      if (cel === null || czyAdresZPaskiemWysylania(cel.getAttribute("href") ?? "")) return;
      zdarzenie.preventDefault();
      zdarzenie.stopImmediatePropagation();
      // Odnośnik w oknie modalnym (menu na wąskim ekranie): okno zasłoniłoby pytanie, więc najpierw się zamyka.
      const okno = cel.closest("dialog");
      if (okno !== null && okno.open && typeof okno.close === "function") okno.close();
      setWyjscie({ adres: cel.getAttribute("href") ?? "/", wyzwalacz: cel });
    }

    // Po innych obsługach: zwykły odnośnik do ekranu z paskiem, którego nikt nie
    // obsłużył, przeładowałby dokument i urwał wysyłanie — przechodzi po stronie klienta.
    function poInnych(zdarzenie: MouseEvent) {
      if (zdarzenie.defaultPrevented) return;
      const cel = odnosnikWewnetrzny(zdarzenie);
      const adres = cel?.getAttribute("href") ?? "";
      if (cel === null || !czyAdresZPaskiemWysylania(adres)) return;
      zdarzenie.preventDefault();
      router.push(adres);
    }

    window.addEventListener("beforeunload", naZamkniecie);
    document.addEventListener("click", przedInnymi, true);
    window.addEventListener("click", poInnych);
    return () => {
      window.removeEventListener("beforeunload", naZamkniecie);
      document.removeEventListener("click", przedInnymi, true);
      window.removeEventListener("click", poInnych);
    };
  }, [trwa, router]);

  function zostan() {
    const wyzwalacz = wyjscie?.wyzwalacz;
    setWyjscie(null);
    // Odnośnik z zamkniętego menu już nie istnieje: fokus wraca tam, gdzie był przed pytaniem.
    if (wyzwalacz?.isConnected) wyzwalacz.focus();
  }

  function przejdz() {
    if (wyjscie === null) return;
    const { adres, wyzwalacz } = wyjscie;
    setWyjscie(null);
    zgodaNaWyjscie.current = true;
    uchwytWysylania.przerwij();
    // To samo kliknięcie jeszcze raz: ekran, na którym stoi odnośnik, obsługuje je po swojemu
    // (np. pyta o niezapisany tekst), już bez pytania o wysyłanie. Chwilę później, żeby
    // przerwanie doszło do ekranów i przeglądarka nie zapytała drugi raz o to samo.
    window.setTimeout(() => {
      if (wyzwalacz.isConnected) wyzwalacz.click();
      else router.push(adres);
    }, ZWLOKA_PRZEJSCIA_MS);
  }

  const okno = wyjscie !== null && stan.rodzaj === "wysylanie" && (
    <Dialog
      tytul="Wysyłanie nagrania zostanie przerwane"
      etykietaWycofania="Zostań"
      etykietaPotwierdzenia="Przejdź i przerwij wysyłanie"
      onWycofaj={zostan}
      onPotwierdz={przejdz}
    >
      <Text>
        Ten ekran nie pokazuje wysyłania, więc po przejściu wysyłanie nagrania lekcji „{stan.lekcja.tytul}” zostanie
        przerwane. Dokończysz je później: w lekcji wybierz ten sam plik.
      </Text>
    </Dialog>
  );

  if (stan.rodzaj !== "wysylanie" && stan.rodzaj !== "przerwane") return null;

  const naStronieLekcji = sciezka === stan.lekcja.adres;
  const adresKarty = naStronieLekcji ? `#${KOTWICA_NAGRANIA}` : `${stan.lekcja.adres}#${KOTWICA_NAGRANIA}`;

  if (stan.rodzaj === "przerwane") {
    return (
      <div className={`${style.pasek} ${style.pasekPrzerwany}`} data-pasek-wysylania="przerwane" data-obszar="pasek-wysylania">
        <p className={style.zdanie} role="status">
          <span className={style.tytul}>Wysyłanie przerwane: {stan.lekcja.tytul}</span>
        </p>
        <span className={style.odnosnik}>
          <Link href={adresKarty} aria-label={`Dokończ wysyłanie nagrania lekcji ${stan.lekcja.tytul}`}>
            Dokończ
          </Link>
        </span>
      </div>
    );
  }

  const procent = procentWyslania(stan.wyslano, stan.rozmiar);
  const minuty = stan.zostaloSekund === null ? null : Math.max(1, Math.round(stan.zostaloSekund / 60));
  return (
    <>
      <div className={style.pasek} data-pasek-wysylania="wysylanie" data-obszar="pasek-wysylania">
        <p className={style.zdanie}>
          {/* Ogłaszany jest początek wysyłania i tytuł lekcji; procent niesie pasek postępu. */}
          <span className={style.poczatek}>Wysyłanie nagrania:{NBSP}</span>
          <span className={style.tytul} role="status">
            {stan.lekcja.tytul}
          </span>
          <span>
            {NBSP}· {procent}
            {NBSP}%
          </span>
          {minuty !== null && (
            <span className={style.czas}>
              {NBSP}· zostało ok. {minuty}
              {NBSP}min
            </span>
          )}
        </p>
        <PasekPostepu procent={procent} nazwa={`Wysyłanie nagrania lekcji ${stan.lekcja.tytul}`} />
        {/* Na stronie tej lekcji karta nagrania jest na ekranie — odnośnik do niej byłby pusty. */}
        {!naStronieLekcji && (
          <span className={style.odnosnik}>
            <Link href={adresKarty} aria-label={`Pokaż lekcję ${stan.lekcja.tytul}`}>
              Pokaż lekcję
            </Link>
          </span>
        )}
      </div>
      {okno}
    </>
  );
}
