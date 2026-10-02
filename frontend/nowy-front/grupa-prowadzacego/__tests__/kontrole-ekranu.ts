/**
 * Kontrole wspólne dla testów ekranów. Rzucają (zamiast zwracać wartość logiczną), żeby czerwień
 * testu niosła treść błędu.
 */
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/** Korzeń szablonu listy: jeden `main#tresc` z `data-style-id="szablon-lista"`. */
export function szablonListy(container: HTMLElement): void {
  jedenMain(container);
  const znacznik = (container.querySelector("main") as HTMLElement).getAttribute("data-style-id");
  if (znacznik !== "szablon-lista") {
    throw new Error(`szablonListy: data-style-id="${znacznik}", oczekiwano "szablon-lista".`);
  }
}

/** Przyciski główne (`Button poziom="primary"`) w drzewie. */
export function przyciskiGlowne(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

const normalizuj = (tekst: string | null) => (tekst ?? "").replace(/\s+/g, " ").trim();

/**
 * Nazwy dostępne przycisków i odnośników z `href`, w kolejności dokumentu. Listy wyboru (rola
 * `combobox`) mają osobne sprawdzenia po roli i nazwie.
 */
export function nazwyDzialan(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button:not([role='combobox']), a[href]")].map(
    (element) => element.getAttribute("aria-label") ?? normalizuj(element.textContent),
  );
}

/** Etykiety pól formularza, w kolejności dokumentu. */
export function etykietyPol(container: HTMLElement): string[] {
  return [...container.querySelectorAll("label")].map((etykieta) => normalizuj(etykieta.textContent).replace(/\s*\*$/, ""));
}

/** Tekst wiersza listy rekordów o danym identyfikatorze. */
export function wiersz(container: HTMLElement, id: string): string {
  const element = container.querySelector(`[data-wiersz="${id}"]`);
  if (element === null) throw new Error(`Brak wiersza „${id}”.`);
  return normalizuj(element.textContent);
}
