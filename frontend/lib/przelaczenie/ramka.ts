import { GRUPY, type DefinicjaGrupy, type NazwaPanelu } from "./grupy";

/**
 * Czy ekran pod daną ścieżką stoi w nowej ramce panelu (powłoka z makiety),
 * a nie w dotychczasowej (`PanelShell`). Dotyczy wyłącznie stron, które
 * zamieniają treść pod tym samym adresem (stara trasa == nowa trasa) — takie
 * strony leżą w starej grupie tras i dzielą z nią układ, więc układ musi sam
 * rozpoznać, który ekran niesie strona. Nowe trasy z innym adresem mają
 * własny układ w grupie `(przelaczenie)` i tej funkcji nie potrzebują.
 *
 * Prawda dokładnie wtedy, gdy WŁĄCZONA grupa z ekranem tego panelu, którego stara i
 * nowa trasa są tym samym adresem pasującym do ścieżki (`[id]` pasuje do jednego
 * segmentu), jest najdokładniejszym dopasowaniem (najmniej parametrów). Grupa wyłączona nie zmienia niczego:
 * przy wszystkich grupach wyłączonych wynik jest zawsze fałszem.
 */
export function czyTrasaWNowejRamce(
  sciezka: string,
  panel: NazwaPanelu,
  grupy: Record<string, DefinicjaGrupy> = GRUPY,
): boolean {
  const znormalizowana = normalizuj(sciezka);
  const pasujace = Object.values(grupy).flatMap((grupa) =>
    grupa.ekrany
      .filter(
        (ekran) =>
          ekran.panel === panel &&
          ekran.staraTrasa !== null &&
          ekran.staraTrasa === ekran.nowaTrasa &&
          pasujeDoWzorca(znormalizowana, ekran.nowaTrasa),
      )
      .map((ekran) => ({ wlaczona: grupa.wlaczona, parametry: liczbaParametrow(ekran.nowaTrasa) })),
  );
  if (pasujace.length === 0) return false;
  // Adres, który pasuje do kilku wzorców (`/admin/uczestniczki/nowa` do własnej trasy i do
  // `/admin/uczestniczki/[id]`), należy do wzorca bez parametru: tak wybiera trasę router.
  // Włączona grupa z parametrem nie zabiera ekranu grupie wyłączonej o dokładniejszym adresie.
  const najmniej = Math.min(...pasujace.map((p) => p.parametry));
  return pasujace.some((p) => p.parametry === najmniej && p.wlaczona);
}

function liczbaParametrow(wzorzec: string): number {
  return wzorzec.split("/").filter((czesc) => /^\[[^\]/]+\]$/.test(czesc)).length;
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
