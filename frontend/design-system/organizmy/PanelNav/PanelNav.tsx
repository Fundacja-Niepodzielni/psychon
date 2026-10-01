import type { ReactNode } from "react";
import { Avatar } from "../../atomy/Avatar/Avatar";
import { Text } from "../../atomy/Text/Text";
import { GrupaZwijana } from "../../molekuly/MenuItem/GrupaZwijana";
import { MenuGroup } from "../../molekuly/MenuItem/MenuGroup";
import type { NazwaIkony } from "../../atomy/Icon/Icon";
import style from "./PanelNav.module.css";

interface PozycjaGrupyPanelNav {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  /** `"sekcja"` — rodzic bieżącej podstrony bez własnej pozycji w menu (`aria-current="true"`). */
  biezaca?: boolean | "sekcja";
  /**
   * Podstrony bez własnej pozycji w menu, które mają tę pozycję za rodzica.
   * Menu ich nie rysuje — czytają je szablon powłoki i reguła okruszka.
   */
  podstrony?: { etykieta: string; href: string }[];
  licznik?: { wartosc: number; etykieta: string };
}

interface GrupaPanelNav {
  naglowek: string;
  pozycje: PozycjaGrupyPanelNav[];
  wPrzygotowaniu?: string[];
  /**
   * Jedna linia na dole grupy: „W przygotowaniu: {treść}.” — brzmienie ze
   * słownika interfejsu 2.1 (pozycje menu jeszcze niegotowe) i z makiety
   * 2.0.4. Zwykły tekst, bez łącza i bez roli odnośnika.
   */
  liniaWPrzygotowaniu?: string;
  /**
   * Grupa zwijana: zamiast nagłówka i listy — przycisk „{nagłówek} ({liczba pozycji})”
   * (komponent `GrupaZwijana`, ten sam co „Dotychczasowy panel” w szablonie powłoki).
   * Na wejściu zwinięta, rozwinięta, gdy niesie pozycję bieżącą; linia „W przygotowaniu”
   * stoi wtedy wewnątrz części zwijanej, pod pozycjami. Bez pola grupa rysuje się wprost.
   */
  zwijana?: boolean;
}

interface UzytkownikPanelNav {
  imie: string;
  nazwisko?: string;
  /** Opis roli pod nazwiskiem (np. "Terapeuta", "Podopieczny") — sam tekst,
   * bez odrębnego atomu (Text, tak jak nazwisko). */
  rola: string;
}

interface WlasciwosciPanelNav {
  uzytkownik: UzytkownikPanelNav;
  /**
   * Zestaw grup menu — TREŚĆ zestawu (które grupy/pozycje wchodzą dla danej
   * roli) ustala wywołujący (trasa/ekran), nie ten organizm — dokładnie jak
   * `PublishChecklist` nie jest właścicielem stanu widoczności. 64 ekrany, 3
   * zestawy wg roli to trzy RÓŻNE wartości tego propa, pokazane osobno w
   * poligonie, a nie trzy tryby zaszyte tutaj.
   */
  grupy: GrupaPanelNav[];
  /** Nazwa punktu orientacyjnego `nav` (domyślnie „Nawigacja panelu”). */
  etykieta?: string;
  /**
   * Blok konta na końcu menu (np. grupa „Konto” z wylogowaniem). Organizm go
   * tylko umieszcza — przycisk i jego obsługę dostarcza wywołujący.
   */
  konto?: ReactNode;
}

/**
 * Panel nawigacji `PanelNav` (O2, 64 ekrany). Skład wprost ze specyfikacji:
 * `Avatar` (atom) + `MenuItem` (molekuła, przez `MenuGroup` — ta sama
 * jednostka co M9, patrz poligon/main.tsx "M9 MenuItem/MenuGroup"). Pole
 * dotyku każdej pozycji ma `min-height: var(--hit-min)` wbudowane w
 * `MenuItem.module.css` `.pozycja` — nic tu tego nie nadpisuje.
 */
export function PanelNav({ uzytkownik, grupy, etykieta = "Nawigacja panelu", konto }: WlasciwosciPanelNav) {
  return (
    <nav aria-label={etykieta} className={style.panel}>
      <div className={style.profil}>
        <Avatar imie={uzytkownik.imie} nazwisko={uzytkownik.nazwisko} />
        <div className={style.profilTekst}>
          <Text>{`${uzytkownik.imie} ${uzytkownik.nazwisko ?? ""}`.trim()}</Text>
          <Text>{uzytkownik.rola}</Text>
        </div>
      </div>

      <div className={style.grupy}>
        {grupy.map(({ liniaWPrzygotowaniu, zwijana, ...grupa }) =>
          zwijana ? (
            <GrupaZwijana
              key={grupa.naglowek}
              grupa={{ naglowek: grupa.naglowek, pozycje: grupa.pozycje, liniaWPrzygotowaniu }}
            />
          ) : (
            <div key={grupa.naglowek} className={style.grupa}>
              <MenuGroup {...grupa} />
              {liniaWPrzygotowaniu && (
                <p className={style.wPrzygotowaniu}>{`W przygotowaniu: ${liniaWPrzygotowaniu}.`}</p>
              )}
            </div>
          ),
        )}
        {konto}
      </div>
    </nav>
  );
}
