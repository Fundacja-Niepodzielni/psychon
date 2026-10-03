import { GRUPY, czyStaraTrasaPrzekierowuje } from "@/lib/przelaczenie/grupy";

/**
 * Dokąd przekierowuje stara trasa `/panel/po-programie`: nowa trasa ekranu uczestnika grupy
 * `wspolpraca`, gdy grupa jest włączona, inaczej `null`. Jedno źródło dla układu segmentu i strony.
 */
export function adresPrzekierowaniaPoProgramie(): string | null {
  if (!czyStaraTrasaPrzekierowuje(GRUPY.wspolpraca, "uczestnik")) return null;
  const ekranUczestnika = GRUPY.wspolpraca.ekrany.find((ekran) => ekran.panel === "uczestnik");
  return ekranUczestnika ? ekranUczestnika.nowaTrasa : null;
}
