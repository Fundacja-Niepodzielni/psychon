import type { NazwaIkony } from "@/design-system/atomy/Icon/Icon";
import { GRUPY, celTrasyEkranu, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import h07CzasNauki from "../admin/h07-czas-nauki";
import h08Kursy from "../admin/h08-kursy";
import h11Staz from "../admin/h11-staz";
import h12Superwizje from "../admin/h12-superwizje";
import h13Certyfikaty from "../admin/h13-certyfikaty";
import h15Profil from "../admin/h15-profil";
import h16Emails from "../admin/h16-emails";
import h19Ustawienia from "../admin/h19-ustawienia";
import h20Dziennik from "../admin/h20-dziennik";
import h20Raport from "../admin/h20-raport";
import type { MenuEntry } from "../types";

/**
 * Menu administracji w nowej ramce panelu — układ z makiety 2.0.4 (menu
 * roli administracji budowane skryptem w `#nav`) i nazwy ze słownika
 * interfejsu 2.1. Stoi OBOK starego rejestru (`lib/menu/admin`), który
 * zostaje bit w bit dla starej ramki (`PanelShell`).
 *
 * Zasady:
 * - pozycja, której ekran ma włączoną grupę przełączenia, prowadzi na nową
 *   trasę; bez włączonej grupy — na starą trasę (otwiera stary ekran w starej
 *   ramce). Cel czyta rejestr (`celTrasyEkranu`), nic nie jest wpisane na
 *   sztywno w dwóch miejscach;
 * - nazwa pozycji ekranu z włączonej grupy == `h1` tego ekranu, chyba że
 *   słownik wprost daje parę menu/nagłówek (Pulpit / Pulpit administracji,
 *   Sprawy / Sprawy do decyzji);
 * - ekrany nowego frontu, których makieta nie ma w menu, stoją w grupie
 *   najbliższej ich funkcji: Zgłoszenia współpracy → Codziennie; słownik form
 *   stażu, wzory dokumentów i ekran startowy → „Ustawienia” (słowniki i treści
 *   ustawiane rzadko, nie codzienna praca). „Program” to Kursy, „Rozliczenie” —
 *   Raport roku programu i Dziennik działań;
 * - dawne łącze „Ustawienia” (`/admin/ustawienia`) stoi jako pierwsza pozycja grupy „Ustawienia” pod nazwą
 *   nagłówka ekranu, na który prowadzi („Ustawienia edycji” — grupa `ustawieniaProgramu` jest wyłączona, więc
 *   otwiera się stary ekran z `h1` „Ustawienia edycji”); w „Dotychczasowym panelu” już go nie ma, żeby
 *   w menu nie stały obok siebie dwa elementy o nazwie „Ustawienia”;
 * - „Ustawienia” to grupa zwijana (`zwijana: true`): szablon rysuje ją tym samym
 *   komponentem co „Dotychczasowy panel” — na wejściu zwiniętą, rozwiniętą, gdy
 *   bieżący ekran jest jej pozycją albo podstroną jej pozycji. Linia „W przygotowaniu:
 *   ustawienia roku programu” stoi wewnątrz jej części zwijanej, pod pozycjami;
 * - funkcje starego panelu bez miejsca w menu makiety — grupa na dole
 *   „Dotychczasowy panel” ze starymi wpisami (etykieta i adres wprost ze
 *   starego rejestru);
 * - kolejka stażu (`/admin/staz`, „Dyżury do decyzji”) i lista zgłoszeń rekrutacyjnych
 *   (`/admin/nabor`, „Zgłoszenia rekrutacyjne”) nie mają własnej pozycji w menu: w
 *   rejestrze (`PODSTRONY_ADMINISTRACJI`) ich rodzicem jest „Sprawy”, skąd się do nich
 *   wchodzi (filtr rodzaju), z pulpitu i z listy uczestników. Nazwa ekranu == `h1`.
 *   W menu świeci wtedy „Sprawy” jako sekcja (`aria-current="true"`), a okruszek
 *   składa się z rodzica („Administracja › Sprawy › Dyżury do decyzji”). Stary wpis
 *   „Akceptacja stażu” nie wchodzi wtedy do „Dotychczasowego panelu”. Bez pozycji
 *   „Sprawy” w menu (grupa wyłączona) ekran wraca na własną pozycję w „Codziennie”,
 *   żeby wejście nie zginęło. „Zgłoszenia rekrutacyjne” są w rejestrze wyłącznie przy
 *   włączonej grupie `nabor`; przy wyłączonej są zakładką starej strony pod
 *   `/admin/uczestniczki` — adres, który już niesie „Uczestnicy” (zero duplikatu
 *   adresu, zero utraty wejścia);
 * - linie „W przygotowaniu” z makiety, bez łączy i bez funkcji obecnych
 *   w menu: w „Programie” bez „staż i superwizja” (w menu „Dyżury do decyzji”
 *   i „Superwizje”); w „Rozliczeniu” „certyfikaty” (model), a po odjęciu pozycji
 *   menu (`liniaBezPozycjiMenu`) linia znika, bo „Certyfikaty” są pozycją
 *   „Dotychczasowego panelu”; w „Ustawieniach” „ustawienia roku programu” bez „treści
 *   i dokumenty” (wzory dokumentów i ekran startowy są już pozycjami tej grupy).
 */

/** Ekran bez własnej pozycji w menu, podstrona pozycji-rodzica (okruszek, podświetlenie sekcji). */
export interface PodstronaMenuRamki {
  etykieta: string;
  href: string;
}

export interface PozycjaMenuRamki {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  /** Pozycja korzenia sekcji (`/admin`) — bieżąca tylko przy dokładnym adresie. */
  dokladna?: boolean;
  /** Podstrony bez własnej pozycji w menu, które mają tę pozycję za rodzica (rejestr `PODSTRONY_ADMINISTRACJI`). */
  podstrony?: PodstronaMenuRamki[];
}

export interface GrupaMenuRamki {
  naglowek: string;
  pozycje: PozycjaMenuRamki[];
  /** Treść linii „W przygotowaniu: …” (bez przedrostka i kropki). */
  wPrzygotowaniu?: string;
  /** Grupa zwijana przyciskiem „{nagłówek} ({liczba pozycji})” — szablon rysuje ją jak „Dotychczasowy panel”. */
  zwijana?: true;
}

/** Nazwy pozycji ekranów z włączonych grup — ze słownika 2.1 albo z `h1` ekranu. */
export const NAZWY_RAMKI_ADMINISTRACJI = {
  pulpit: "Pulpit",
  sprawy: "Sprawy",
  kolejkaStazu: "Dyżury do decyzji",
  uczestnicy: "Uczestnicy",
  zgloszeniaRekrutacyjne: "Zgłoszenia rekrutacyjne",
  zgloszeniaWspolpracy: "Zgłoszenia współpracy",
  kursy: "Kursy",
  formyStazu: "Słownik form stażu",
  raport: "Raport roku programu",
  dziennik: "Dziennik działań",
  wzoryDokumentow: "Wzory dokumentów",
  ekranStartowy: "Treść ekranu „Zacznij tutaj”",
  ustawieniaEdycji: "Ustawienia edycji",
} as const;

/**
 * Rejestr ekranów administracji bez własnej pozycji w menu: nazwa pozycji-rodzica
 * w menu i klucz grupy przełączenia, od której zależy obecność ekranu w nowej ramce.
 * Okruszek składa się z rodzica, a w menu świeci rodzic jako sekcja.
 */
export const PODSTRONY_ADMINISTRACJI = [
  { grupa: "kolejkaStazu", etykieta: NAZWY_RAMKI_ADMINISTRACJI.kolejkaStazu, rodzic: NAZWY_RAMKI_ADMINISTRACJI.sprawy },
  {
    grupa: "nabor",
    etykieta: NAZWY_RAMKI_ADMINISTRACJI.zgloszeniaRekrutacyjne,
    rodzic: NAZWY_RAMKI_ADMINISTRACJI.sprawy,
  },
] as const;

/** Nazwa grupy na dole menu ze starymi funkcjami panelu. */
export const GRUPA_DOTYCHCZASOWA = "Dotychczasowy panel";

/** Nazwa grupy zwijanej ze słownikami i treściami ustawianymi rzadko (słownik form stażu, wzory dokumentów, ekran startowy). */
export const GRUPA_USTAWIENIA = "Ustawienia";

type Grupy = Record<string, DefinicjaGrupy>;

function cel(grupy: Grupy, klucz: keyof typeof GRUPY): string | null {
  const grupa = grupy[klucz];
  return grupa ? celTrasyEkranu(grupa, "administracja") : null;
}

function pozycja(
  href: string | null,
  ikona: NazwaIkony,
  etykieta: string,
  dokladna?: boolean,
): PozycjaMenuRamki[] {
  if (href === null) return [];
  return [dokladna ? { ikona, etykieta, href, dokladna } : { ikona, etykieta, href }];
}

const IKONY_DOTYCHCZASOWE: Record<string, NazwaIkony> = {
  "/admin/czas-nauki": "clock",
  "/admin/certyfikaty": "award",
  "/admin/profile": "user",
  "/admin/staz": "inbox",
  "/admin/superwizje": "chat",
  "/admin/emails": "inbox",
};

/** Stary wpis rejestru → pozycja grupy „Dotychczasowy panel” (etykieta i adres bez zmian). */
function dotychczasowa(wpis: MenuEntry): PozycjaMenuRamki {
  return { ikona: IKONY_DOTYCHCZASOWE[wpis.href] ?? "file", etykieta: wpis.label, href: wpis.href };
}

/**
 * Menu administracji nowej ramki przy danym stanie rejestru przełączenia.
 * Parametr `grupy` pozwala testom sprawdzić obie strony flag bez mutowania
 * współdzielonego rejestru.
 */
export function menuRamkiAdministracji(grupy: Grupy = GRUPY): GrupaMenuRamki[] {
  const n = NAZWY_RAMKI_ADMINISTRACJI;
  const sprawy = pozycja(cel(grupy, "sprawy"), "inbox", n.sprawy);
  // Ekrany z `PODSTRONY_ADMINISTRACJI` (kolejka stażu `/admin/staz`, nabór `/admin/nabor`) nie mają
  // własnej pozycji, gdy w menu stoi ich rodzic „Sprawy”: wchodzą jako jego podstrony. Bez rodzica
  // (grupa `sprawy` wyłączona) stoją jak dawniej w „Codziennie”, żeby wejście nie zginęło.
  // „Zgłoszenia rekrutacyjne” liczą się wyłącznie przy włączonej grupie `nabor`: przy wyłączonej cel
  // to stara trasa `/admin/uczestniczki` (adres pozycji „Uczestnicy”), a zgłoszenia są zakładką
  // tej strony. Stary wpis „Akceptacja stażu” znika z „Dotychczasowego panelu” dokładnie wtedy, gdy
  // kolejka stażu jest w menu albo pod rodzicem — adres jest ten sam przy obu stanach flagi.
  const ekrany = PODSTRONY_ADMINISTRACJI.flatMap((wpis) => {
    const adres = wpis.grupa === "nabor" && !grupy.nabor?.wlaczona ? null : cel(grupy, wpis.grupa);
    return adres === null ? [] : [{ wpis, adres }];
  });
  const podstrony: PodstronaMenuRamki[] = sprawy.length > 0 ? ekrany.map(({ wpis, adres }) => ({ etykieta: wpis.etykieta, href: adres })) : [];
  const wlasne = (grupa: (typeof PODSTRONY_ADMINISTRACJI)[number]["grupa"]): PozycjaMenuRamki[] =>
    sprawy.length > 0
      ? []
      : ekrany.filter(({ wpis }) => wpis.grupa === grupa).map(({ wpis, adres }) => ({ ikona: "inbox", etykieta: wpis.etykieta, href: adres }));
  const kolejkaStazuWRejestrze = ekrany.some(({ wpis }) => wpis.grupa === "kolejkaStazu");
  const dotychczasowe = [h07CzasNauki, h13Certyfikaty, h15Profil, h11Staz, h12Superwizje, h16Emails].filter(
    (wpis) => !(kolejkaStazuWRejestrze && wpis === h11Staz),
  );
  const grupyMenu: GrupaMenuRamki[] = [
    {
      naglowek: "Codziennie",
      pozycje: [
        ...pozycja(cel(grupy, "pulpitAdministracji"), "home", n.pulpit, true),
        ...sprawy.map((p) => (podstrony.length > 0 ? { ...p, podstrony } : p)),
        ...wlasne("kolejkaStazu"),
        ...pozycja(cel(grupy, "listaOsob"), "users", n.uczestnicy),
        ...wlasne("nabor"),
        ...pozycja(cel(grupy, "wspolpraca"), "chat", n.zgloszeniaWspolpracy),
      ],
    },
    {
      naglowek: "Program",
      pozycje: pozycja(h08Kursy.href, "book", n.kursy),
      // Bez „staż i superwizja”: „Dyżury do decyzji” (podstrona „Spraw”) i „Superwizje” („Dotychczasowy panel”) mają swoje wejścia.
      wPrzygotowaniu: "prowadzący",
    },
    {
      naglowek: "Rozliczenie",
      pozycje: [...pozycja(h20Raport.href, "chart", n.raport), ...pozycja(h20Dziennik.href, "file", n.dziennik)],
      // Linia znika w menu: „Certyfikaty” są pozycją „Dotychczasowego panelu” (`liniaBezPozycjiMenu`).
      wPrzygotowaniu: "certyfikaty",
    },
    {
      naglowek: GRUPA_USTAWIENIA,
      zwijana: true,
      pozycje: [
        ...pozycja(h19Ustawienia.href, "cog", n.ustawieniaEdycji),
        ...pozycja(cel(grupy, "formyStazu"), "clock", n.formyStazu),
        ...pozycja(cel(grupy, "wzoryDokumentow"), "file", n.wzoryDokumentow),
        ...pozycja(cel(grupy, "ekranStartowy"), "cog", n.ekranStartowy),
      ],
      wPrzygotowaniu: "ustawienia roku programu",
    },
    {
      naglowek: GRUPA_DOTYCHCZASOWA,
      pozycje: dotychczasowe.map(dotychczasowa),
    },
  ];
  return grupyMenu.filter((grupa) => grupa.pozycje.length > 0);
}

/** Czy pozycja jest bieżąca dla ścieżki (korzeń sekcji tylko dokładnie, reszta z podstronami). */
export function czyPozycjaBiezaca(pozycja: PozycjaMenuRamki, sciezka: string): boolean {
  const s = sciezka.length > 1 ? sciezka.replace(/\/+$/, "") : sciezka;
  if (pozycja.dokladna) return s === pozycja.href;
  return s === pozycja.href || s.startsWith(`${pozycja.href}/`);
}

/** Czy ścieżka należy do podstrony pozycji-rodzica (adres podstrony albo jego szczegół) — rodzic świeci jako sekcja. */
export function czyPodstronaPozycji(pozycja: PozycjaMenuRamki, sciezka: string): boolean {
  const s = sciezka.length > 1 ? sciezka.replace(/\/+$/, "") : sciezka;
  return (pozycja.podstrony ?? []).some((ekran) => s === ekran.href || s.startsWith(`${ekran.href}/`));
}
