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
 *   najbliższej ich funkcji (Zgłoszenia współpracy → Codziennie, słownik
 *   form stażu → Program, wzory dokumentów i ekran startowy → Rozliczenie);
 * - funkcje starego panelu bez miejsca w menu makiety — grupa na dole
 *   „Dotychczasowy panel” ze starymi wpisami (etykieta i adres wprost ze
 *   starego rejestru);
 * - kolejka stażu (`/admin/staz`) to pozycja „Dyżury do decyzji” w „Codziennie”
 *   zaraz po „Sprawy” (nazwa == `h1` ekranu); stary wpis „Akceptacja stażu”
 *   nie wchodzi wtedy do „Dotychczasowego panelu”;
 * - linie „W przygotowaniu” z makiety, bez łączy i bez funkcji obecnych
 *   w menu: w „Programie” bez „staż i superwizja” (w menu „Dyżury do decyzji”
 *   i „Superwizje”); w „Rozliczeniu” bez
 *   „treści i dokumenty” (wzory dokumentów i ekran startowy są już pozycjami
 *   tej grupy).
 */

export interface PozycjaMenuRamki {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  /** Pozycja korzenia sekcji (`/admin`) — bieżąca tylko przy dokładnym adresie. */
  dokladna?: boolean;
}

export interface GrupaMenuRamki {
  naglowek: string;
  pozycje: PozycjaMenuRamki[];
  /** Treść linii „W przygotowaniu: …” (bez przedrostka i kropki). */
  wPrzygotowaniu?: string;
}

/** Nazwy pozycji ekranów z włączonych grup — ze słownika 2.1 albo z `h1` ekranu. */
export const NAZWY_RAMKI_ADMINISTRACJI = {
  pulpit: "Pulpit",
  sprawy: "Sprawy",
  kolejkaStazu: "Dyżury do decyzji",
  uczestnicy: "Uczestnicy",
  zgloszeniaWspolpracy: "Zgłoszenia współpracy",
  kursy: "Kursy",
  formyStazu: "Słownik form stażu",
  raport: "Raport roku programu",
  dziennik: "Dziennik działań",
  wzoryDokumentow: "Wzory dokumentów",
  ekranStartowy: "Treść ekranu „Zacznij tutaj”",
} as const;

/** Nazwa grupy na dole menu ze starymi funkcjami panelu. */
export const GRUPA_DOTYCHCZASOWA = "Dotychczasowy panel";

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
  "/admin/ustawienia": "cog",
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
  // „Dyżury do decyzji” (kolejka stażu, `/admin/staz`) stoi w „Codziennie”; stary wpis
  // „Akceptacja stażu” znika z „Dotychczasowego panelu” dokładnie wtedy, gdy ta pozycja
  // jest w menu — adres jest ten sam przy obu stanach flagi, więc wejście nie ginie
  // i nie ma duplikatu.
  const kolejkaStazu = pozycja(cel(grupy, "kolejkaStazu"), "inbox", n.kolejkaStazu);
  const dotychczasowe = [h07CzasNauki, h13Certyfikaty, h15Profil, h11Staz, h12Superwizje, h16Emails, h19Ustawienia].filter(
    (wpis) => !(kolejkaStazu.length > 0 && wpis === h11Staz),
  );
  return [
    {
      naglowek: "Codziennie",
      pozycje: [
        ...pozycja(cel(grupy, "pulpitAdministracji"), "home", n.pulpit, true),
        ...pozycja(cel(grupy, "sprawy"), "inbox", n.sprawy),
        ...kolejkaStazu,
        ...pozycja(cel(grupy, "listaOsob"), "users", n.uczestnicy),
        ...pozycja(cel(grupy, "wspolpraca"), "chat", n.zgloszeniaWspolpracy),
      ],
    },
    {
      naglowek: "Program",
      pozycje: [
        ...pozycja(h08Kursy.href, "book", n.kursy),
        ...pozycja(cel(grupy, "formyStazu"), "clock", n.formyStazu),
      ],
      // Bez „staż i superwizja”: „Dyżury do decyzji” (Codziennie) i „Superwizje” („Dotychczasowy panel”) są pozycjami menu.
      wPrzygotowaniu: "prowadzący",
    },
    {
      naglowek: "Rozliczenie",
      pozycje: [
        ...pozycja(h20Raport.href, "chart", n.raport),
        ...pozycja(h20Dziennik.href, "file", n.dziennik),
        ...pozycja(cel(grupy, "wzoryDokumentow"), "file", n.wzoryDokumentow),
        ...pozycja(cel(grupy, "ekranStartowy"), "cog", n.ekranStartowy),
      ],
      wPrzygotowaniu: "certyfikaty · ustawienia roku programu",
    },
    {
      naglowek: GRUPA_DOTYCHCZASOWA,
      pozycje: dotychczasowe.map(dotychczasowa),
    },
  ].filter((grupa) => grupa.pozycje.length > 0);
}

/** Czy pozycja jest bieżąca dla ścieżki (korzeń sekcji tylko dokładnie, reszta z podstronami). */
export function czyPozycjaBiezaca(pozycja: PozycjaMenuRamki, sciezka: string): boolean {
  const s = sciezka.length > 1 ? sciezka.replace(/\/+$/, "") : sciezka;
  if (pozycja.dokladna) return s === pozycja.href;
  return s === pozycja.href || s.startsWith(`${pozycja.href}/`);
}
