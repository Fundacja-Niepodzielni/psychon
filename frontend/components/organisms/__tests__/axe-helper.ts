/**
 * Pomocnik axe-core dla świadków P3a (molekuły/organizmy).
 *
 * jsdom nie renderuje pikseli: reguły policzone z układu/kolorów wizualnych
 * (`color-contrast`, `target-size`, `scrollable-region-focusable` w wersji
 * mierzącej realny scroll, `hidden-content` przez `getBoundingClientRect`)
 * nie działają wiarygodnie — axe-core sam je oznacza jako `incomplete` albo
 * pomija, bo `getComputedStyle` w jsdom nie liczy renderowanego kontrastu ani
 * geometrii. Dlatego w tym pomocniku wyłączamy `color-contrast`: bez tego axe
 * w jsdom raportowałby fałszywe zera ([]) zamiast prawdziwego pomiaru — a to
 * kontrast Badge/tło, który dostawca już zmierzył i naprawił poza jsdom.
 * Pozostałe reguły (role, name, aria-*, struktura semantyczna, nav/landmark)
 * liczą się z drzewa DOM i działają w jsdom tak samo jak w przeglądarce.
 */
import axe from "axe-core";

export async function axeViolations(container: Element) {
  const wynik = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  return wynik.violations;
}
