import { GRUPY, type DefinicjaGrupy, type NazwaPanelu } from "./grupy";

/**
 * Czy ekran pod daną ścieżką stoi w nowej ramce panelu (powłoka z makiety),
 * a nie w dotychczasowej (`PanelShell`). Dotyczy wyłącznie stron, które
 * zamieniają treść pod tym samym adresem (stara trasa == nowa trasa) — takie
 * strony leżą w starej grupie tras i dzielą z nią układ, więc układ musi sam
 * rozpoznać, który ekran niesie strona. Nowe trasy z innym adresem mają
 * własny układ w grupie `(przelaczenie)` i tej funkcji nie potrzebują.
 *
 * Prawda dokładnie wtedy, gdy istnieje WŁĄCZONA grupa z ekranem tego panelu,
 * którego stara i nowa trasa są tym samym adresem pasującym do ścieżki
 * (`[id]` pasuje do jednego segmentu). Grupa wyłączona nie zmienia niczego:
 * przy wszystkich grupach wyłączonych wynik jest zawsze fałszem.
 */
export function czyTrasaWNowejRamce(
  sciezka: string,
  panel: NazwaPanelu,
  grupy: Record<string, DefinicjaGrupy> = GRUPY,
): boolean {
  const znormalizowana = normalizuj(sciezka);
  return Object.values(grupy).some(
    (grupa) =>
      grupa.wlaczona &&
      grupa.ekrany.some(
        (ekran) =>
          ekran.panel === panel &&
          ekran.staraTrasa !== null &&
          ekran.staraTrasa === ekran.nowaTrasa &&
          pasujeDoWzorca(znormalizowana, ekran.nowaTrasa),
      ),
  );
}

function normalizuj(sciezka: string): string {
  const bezZapytania = sciezka.split(/[?#]/)[0] || "/";
  return bezZapytania.length > 1 ? bezZapytania.replace(/\/+$/, "") : bezZapytania;
}

/** Wzorzec trasy z rejestru (`/admin/profile/[id]`) wobec konkretnej ścieżki. */
export function pasujeDoWzorca(sciezka: string, wzorzec: string): boolean {
  const czesciSciezki = normalizuj(sciezka).split("/");
  const czesciWzorca = wzorzec.split("/");
  if (czesciSciezki.length !== czesciWzorca.length) return false;
  return czesciWzorca.every((czesc, i) =>
    /^\[[^\]/]+\]$/.test(czesc) ? czesciSciezki[i] !== "" : czesc === czesciSciezki[i],
  );
}
