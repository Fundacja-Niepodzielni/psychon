/**
 * Kontrole wspólne dla testów ekranów. Rzucają (zamiast zwracać wartość logiczną), żeby
 * czerwień testu niosła treść błędu.
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

/** Nazwy dostępne wszystkich przycisków i odnośników z `href` w drzewie, w kolejności dokumentu. */
export function nazwyDzialan(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button, a[href]")].map(
    (element) => element.getAttribute("aria-label") ?? (element.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

export function odnosnik(container: HTMLElement, nazwa: string): HTMLAnchorElement {
  const znaleziony = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
    (element) => (element.getAttribute("aria-label") ?? element.textContent?.trim()) === nazwa,
  );
  if (!znaleziony) throw new Error(`Brak odnośnika o nazwie „${nazwa}”.`);
  return znaleziony;
}
