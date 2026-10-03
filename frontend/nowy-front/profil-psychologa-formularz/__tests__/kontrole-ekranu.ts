/**
 * Kontrole wspólne dla testów ekranu. Rzucają (zamiast zwracać wartość logiczną), żeby czerwień
 * testu niosła treść błędu.
 */
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/** Korzeń szablonu formularza: jeden `main#tresc` z `data-style-id="szablon-formularz"`. */
export function szablonFormularza(container: HTMLElement): void {
  jedenMain(container);
  const znacznik = (container.querySelector("main") as HTMLElement).getAttribute("data-style-id");
  if (znacznik !== "szablon-formularz") {
    throw new Error(`szablonFormularza: data-style-id="${znacznik}", oczekiwano "szablon-formularz".`);
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
 * Nazwy dostępne przycisków i odnośników z `href`, w kolejności dokumentu. Lista wyboru i obszar
 * wyboru pliku (role `combobox` i `button` na elemencie `div`) mają osobne sprawdzenia po roli i nazwie.
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
