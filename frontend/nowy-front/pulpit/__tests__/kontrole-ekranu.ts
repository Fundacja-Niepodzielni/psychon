/**
 * Kontrole wspólne dla ekranów pulpitów. Rzucają (zamiast zwracać wartość
 * logiczną), żeby czerwień testu niosła treść błędu; każdy z nich ma w
 * testach kontrolę dodatnią na sztucznym drzewie, które go łamie.
 */
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/** Korzeń szablonu pulpitu: jeden `main#tresc` z `data-style-id="szablon-pulpit"`. */
export function szablonPulpitu(container: HTMLElement): void {
  jedenMain(container);
  const main = container.querySelector("main") as HTMLElement;
  const znacznik = main.getAttribute("data-style-id");
  if (znacznik !== "szablon-pulpit") {
    throw new Error(`szablonPulpitu: data-style-id="${znacznik}", oczekiwano "szablon-pulpit".`);
  }
}

/** Liczba przycisków głównych (`Button poziom="primary"`) w drzewie. */
export function liczPrzyciskiGlowne(container: HTMLElement): number {
  return [...container.querySelectorAll("button")].filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  ).length;
}
