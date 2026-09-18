import type { Page, TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Reguły WCAG objęte skanem — te same tagi co deklaracja dostępności
 * (WCAG 2.1 AA), plus 2A jako podstawa.
 */
const TAGI_WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];

export type WagaNaruszenia = "critical" | "serious" | "moderate" | "minor";

export interface WynikAxe {
  id: string;
  impact: WagaNaruszenia | null;
  liczbaWezlow: number;
  pomoc: string;
}

/**
 * Uruchamia axe-core na aktualnej stronie i zwraca listę naruszeń w
 * uproszczonej postaci (do logu/attachmentu w raporcie testu).
 */
export async function uruchomAxe(page: Page): Promise<WynikAxe[]> {
  const wynik = await new AxeBuilder({ page }).withTags(TAGI_WCAG).analyze();
  return wynik.violations.map((v) => ({
    id: v.id,
    impact: (v.impact as WagaNaruszenia | null) ?? null,
    liczbaWezlow: v.nodes.length,
    pomoc: v.help,
  }));
}

/**
 * Dołącza pełną listę naruszeń do raportu testu (Playwright HTML/JSON) —
 * widoczne dla lidera bez czytania logu konsoli.
 */
export async function dolaczNaruszeniaDoRaportu(
  testInfo: TestInfo,
  nazwa: string,
  naruszenia: WynikAxe[],
): Promise<void> {
  await testInfo.attach(nazwa, {
    body: JSON.stringify(naruszenia, null, 2),
    contentType: "application/json",
  });
}

/**
 * Pierwszy realny pomiar (F-240/D-22): test PADA na critical/serious, bo to
 * są naruszenia, które axe zgłasza z wysoką pewnością. moderate/minor tylko
 * logujemy — próg do ustalenia przez lidera po zobaczeniu liczb, nie tutaj.
 */
export function asercjaBrakPowaznychNaruszen(naruszenia: WynikAxe[]): void {
  const powazne = naruszenia.filter(
    (n) => n.impact === "critical" || n.impact === "serious",
  );
  if (powazne.length > 0) {
    const opis = powazne
      .map((n) => `${n.id} (${n.impact}, ${n.liczbaWezlow} węzłów): ${n.pomoc}`)
      .join("\n");
    throw new Error(`axe: ${powazne.length} poważnych naruszeń:\n${opis}`);
  }
}
