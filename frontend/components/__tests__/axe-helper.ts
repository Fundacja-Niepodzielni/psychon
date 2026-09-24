/**
 * Wspólny pomocnik axe-core dla świadków molekuł, organizmów i layoutu.
 * Jedno miejsce dla wszystkich katalogów `__tests__` pod `components/` —
 * druga kopia tej samej konfiguracji rozjeżdża się przy pierwszej zmianie
 * reguł.
 *
 * jsdom nie renderuje pikseli, więc `getComputedStyle` nie liczy realnego
 * kontrastu tła i tekstu. Regułę `color-contrast` wyłączamy tutaj świadomie:
 * kontrast mierzy dopiero pomiar w przeglądarce (poza tym świadkiem), nie
 * jsdom — wyłączenie nie jest obejściem awarii przyrządu, tylko przyznaniem,
 * czego ten przyrząd nie potrafi zmierzyć. Pozostałe reguły (role, name,
 * aria-*, struktura semantyczna, nav/landmark) liczą się z drzewa DOM i
 * działają w jsdom tak samo jak w przeglądarce.
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
