/**
 * Kontrast dwóch barw `#rrggbb` według WCAG 2.1 (luminancja względna).
 * Pomocnik testów: wartości barw czyta z `tokeny/tokeny.css`, nie z pamięci.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function skladowa(wartosc: number): number {
  const s = wartosc / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancja(hex: string): number {
  const liczba = Number.parseInt(hex.replace("#", ""), 16);
  const r = skladowa((liczba >> 16) & 0xff);
  const g = skladowa((liczba >> 8) & 0xff);
  const b = skladowa(liczba & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function kontrast(a: string, b: string): number {
  const [jasna, ciemna] = [luminancja(a), luminancja(b)].sort((x, y) => y - x);
  return (jasna + 0.05) / (ciemna + 0.05);
}

/**
 * Wartość tokenu z pierwszego bloku `tokeny.css` (motyw jasny — nowy front
 * działa wyłącznie w jasnym, `app/nowy-front/layout.tsx`).
 */
export function tokenJasny(nazwa: string): string {
  const css = readFileSync(resolve(__dirname, "../../../tokeny/tokeny.css"), "utf8");
  const wynik = new RegExp(`--${nazwa}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
  if (!wynik) throw new Error(`Brak tokenu --${nazwa} w tokeny.css.`);
  return wynik[1];
}
