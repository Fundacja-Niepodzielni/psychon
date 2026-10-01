import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pole dotyku strzałki wynika wyłącznie z arkusza stylów molekuły, a jsdom nie
 * liczy układu — więc próba czyta arkusz: poniżej 1100 px pole ma 44 × 44 px
 * (token `--hit-min`), od 1100 px — 28 × 24 px. Pomiar w przeglądarce robi
 * `e2e/kolejnosc-strzalki.spec.ts`.
 */

const ARKUSZ = readFileSync(
  join(process.cwd(), "design-system/molekuly/StrzalkiKolejnosci/StrzalkiKolejnosci.module.css"),
  "utf8",
);

function blok(tekst: string, otwarcie: string): string {
  const poczatek = tekst.indexOf(otwarcie);
  expect(poczatek, `w arkuszu brak „${otwarcie}”`).toBeGreaterThanOrEqual(0);
  const zaOtwarciem = poczatek + otwarcie.length;
  let glebokosc = 1;
  for (let i = zaOtwarciem; i < tekst.length; i += 1) {
    if (tekst[i] === "{") glebokosc += 1;
    if (tekst[i] === "}") glebokosc -= 1;
    if (glebokosc === 0) return tekst.slice(zaOtwarciem, i);
  }
  throw new Error(`niedomknięty blok „${otwarcie}”`);
}

describe("StrzalkiKolejnosci — pole dotyku w arkuszu", () => {
  it("domyślnie (poniżej 1100 px) strzałka ma 44 × 44 px z tokenu --hit-min", () => {
    const podstawa = blok(ARKUSZ, ".strzalka {");
    expect(podstawa).toMatch(/width:\s*var\(--hit-min\)/);
    expect(podstawa).toMatch(/height:\s*var\(--hit-min\)/);
  });

  it("od 1100 px strzałka ma 28 × 24 px", () => {
    const zapytanie = blok(ARKUSZ, "@media (min-width: 1100px) {");
    const strzalka = blok(zapytanie, ".strzalka {");
    expect(strzalka).toMatch(/width:\s*28px/);
    expect(strzalka).toMatch(/height:\s*24px/);
  });

  it("strzałka nie ma ramki ani tła w spoczynku", () => {
    const podstawa = blok(ARKUSZ, ".strzalka {");
    expect(podstawa).toMatch(/border:\s*0/);
    expect(podstawa).toMatch(/background:\s*transparent/);
  });
});
