/**
 * Wspólny pomocnik axe-core dla świadków molekuł, organizmów i layoutu.
 * Jedno miejsce dla wszystkich katalogów `__tests__` pod `components/` —
 * druga kopia tej samej konfiguracji rozjeżdża się przy pierwszej zmianie
 * reguł.
 *
 * Reguła `color-contrast` jest włączona. Zmierzone przy włączaniu
 * (ten sam bieg, cała suita 118 plików / 776 prób, dwa pełne przebiegi):
 * liczba prób nie zmienia się ani o jedną — reguła nie łapie tu NIC, ani na
 * kolorach z klas Tailwind, ani na kolorze wpisanym wprost przez `style`
 * (sprawdzone osobną sondą z czarno-białym tekstem na identycznym tle:
 * `incomplete`, nigdy `violation`, nawet z pakietem `canvas` doinstalowanym
 * dla jsdom). Powód nie jest konfiguracją tego pliku: jsdom nie ma silnika
 * layoutu, `getBoundingClientRect` zwraca same zera, a algorytm axe do
 * koloru efektywnego i widoczności węzła potrzebuje realnego pudełka —
 * bez niego kończy zawsze na „nie da się rozstrzygnąć”, nigdy na
 * naruszeniu. To jest ta sama granica, którą już nazwał `playwright.config.ts`
 * przy szkielecie `e2e/`: „axe-core wymaga prawdziwej przeglądarki, żeby
 * zmierzyć kontrast — w jsdom nie da się tego zmierzyć w ogóle”.
 *
 * Mimo to reguła zostaje włączona, nie z powrotem wyłączona: wyłączona
 * reguła jest twierdzeniem „kontrast jest sprawdzany”, które nie jest
 * prawdziwe nigdzie w drzewie tego świadka — samo wejście do zieleni suity
 * nic nie kosztuje i nie fałszuje niczego dodatkowego (0 zmian w wyniku
 * suity), a usuwa nieprawdziwe zdanie z komentarza, które tu wcześniej
 * stało. Realny pomiar kontrastu — w prawdziwej przeglądarce, z realnym
 * layoutem — mierzy `frontend/e2e/public-a11y.spec.ts` (`npm run e2e`).
 */
import axe from "axe-core";

export async function axeViolations(container: Element) {
  const wynik = await axe.run(container);
  return wynik.violations;
}
