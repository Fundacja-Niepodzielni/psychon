/**
 * Świadek `jedenMain` — jedno miejsce sprawdzające, że korzeń szablonu jest
 * DOKŁADNIE jednym punktem orientacyjnym treści: rola „main”, `id="tresc"`,
 * fokus programowy przez `tabIndex={-1}` (cel skip-linku z layoutu
 * `app/nowy-front/layout.tsx`). Używany w każdym z pięciu stanów każdego
 * z sześciu szablonów (`__tests__/<Szablon>.test.tsx`).
 *
 * Rzuca (nie zwraca `boolean`), żeby czerwień testu niosła od razu treść
 * błędu — bez dodatkowego `expect` w każdym z 30 miejsc wywołania.
 */
export function jedenMain(container: HTMLElement): void {
  const wszystkie = container.querySelectorAll("main");

  if (wszystkie.length !== 1) {
    throw new Error(
      `jedenMain: oczekiwano dokładnie jednego <main> w treści, znaleziono ${wszystkie.length}.`,
    );
  }

  const main = wszystkie[0] as HTMLElement;

  if (main.id !== "tresc") {
    throw new Error(`jedenMain: <main> ma id="${main.id}", oczekiwano id="tresc".`);
  }

  if (main.tabIndex !== -1) {
    throw new Error(`jedenMain: <main id="tresc"> ma tabIndex=${main.tabIndex}, oczekiwano -1.`);
  }
}
