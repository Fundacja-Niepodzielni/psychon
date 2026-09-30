import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Skaner źródeł ekranu: zwraca listę naruszeń reguł pliku ekranu (poza
 * `__tests__`). Wywołany na prawdziwych plikach musi oddać pustą listę, a na
 * sztucznych próbkach — niepustą (kontrola dodatnia), inaczej skaner milczałby
 * także wtedy, gdy nic nie mierzy.
 */
export function naruszenia(tekst: string): string[] {
  const wynik: string[] = [];
  if (/<(button|input|select|textarea)[\s/>]|<a[\s>]/.test(tekst)) wynik.push("surowy element DOM");
  if (surowyElementZObslugaKlikniecia(tekst)) wynik.push("onClick na surowym elemencie");
  if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(tekst)) wynik.push("twardy kolor");
  if (/from\s+["'](@\/components|(\.\.?\/)+components)\//.test(tekst)) wynik.push("import z components/");
  if (/dangerouslySetInnerHTML/.test(tekst)) wynik.push("dangerouslySetInnerHTML");
  if (/Brak dostępu|Ten widok jest dostępny|Nie masz uprawnień/.test(tekst)) wynik.push("zakazany tekst odmowy");
  return wynik;
}

/** `onClick=` w otwarciu elementu pisanego małą literą (surowy DOM), nie atomu. */
function surowyElementZObslugaKlikniecia(tekst: string): boolean {
  let indeks = tekst.indexOf("onClick=");
  while (indeks !== -1) {
    const otwarcie = tekst.lastIndexOf("<", indeks);
    const znak = otwarcie === -1 ? "" : tekst.charAt(otwarcie + 1);
    if (/[a-z]/.test(znak)) return true;
    indeks = tekst.indexOf("onClick=", indeks + 1);
  }
  return false;
}

export function plikiEkranu(katalog: string): string[] {
  if (!existsSync(katalog)) return [];
  return readdirSync(katalog).flatMap((nazwa) => {
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) return nazwa === "__tests__" ? [] : plikiEkranu(sciezka);
    return /\.(ts|tsx|css)$/.test(nazwa) ? [sciezka] : [];
  });
}

export function czytaj(sciezka: string): string {
  return readFileSync(sciezka, "utf-8");
}
