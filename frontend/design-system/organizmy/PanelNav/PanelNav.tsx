import { Avatar } from "../../atomy/Avatar/Avatar";
import { Text } from "../../atomy/Text/Text";
import { MenuGroup } from "../../molekuly/MenuItem/MenuGroup";
import type { NazwaIkony } from "../../atomy/Icon/Icon";
import style from "./PanelNav.module.css";

interface PozycjaGrupyPanelNav {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  biezaca?: boolean;
  licznik?: { wartosc: number; etykieta: string };
}

interface GrupaPanelNav {
  naglowek: string;
  pozycje: PozycjaGrupyPanelNav[];
  wPrzygotowaniu?: string[];
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
}

/**
 * Panel nawigacji `PanelNav` (O2, 64 ekrany). Skład wprost ze specyfikacji:
 * `Avatar` (atom) + `MenuItem` (molekuła, przez `MenuGroup` — ta sama
 * jednostka co M9, patrz poligon/main.tsx "M9 MenuItem/MenuGroup"). Pole
 * dotyku każdej pozycji ma `min-height: var(--hit-min)` wbudowane w
 * `MenuItem.module.css` `.pozycja` — nic tu tego nie nadpisuje.
 */
export function PanelNav({ uzytkownik, grupy }: WlasciwosciPanelNav) {
  return (
    <nav aria-label="Nawigacja panelu" className={style.panel}>
      <div className={style.profil}>
        <Avatar imie={uzytkownik.imie} nazwisko={uzytkownik.nazwisko} />
        <div className={style.profilTekst}>
          <Text>{`${uzytkownik.imie} ${uzytkownik.nazwisko ?? ""}`.trim()}</Text>
          <Text>{uzytkownik.rola}</Text>
        </div>
      </div>

      <div className={style.grupy}>
        {grupy.map((grupa) => (
          <MenuGroup key={grupa.naglowek} {...grupa} />
        ))}
      </div>
    </nav>
  );
}
