/**
 * Spis tego, co osoba widzi i może zrobić na ekranie: elementy, na które da się
 * wejść klawiaturą (w kolejności drzewa, czyli w kolejności fokusu), z rolą,
 * nazwą dostępną, stanem i opisem; nagłówki z poziomami; komunikaty ogłaszane
 * czytnikowi. Wspólne dla testów stanów ekranów pulpitu, kursu i lekcji.
 *
 * Kontrole rzucają (zamiast zwracać wartość logiczną), żeby czerwień testu
 * niosła treść błędu. Każda ma kontrolę dodatnią na sztucznym drzewie, które ją
 * łamie (`co-widac.test.tsx`).
 */
import { expect } from "vitest";

const SELEKTOR_INTERAKTYWNYCH = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "iframe",
  "[role='button']",
  "[role='link']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export interface OczekiwanyElement {
  /** Rola: `button`, `link`, `textbox`, `checkbox`, `radio`, `combobox`, `iframe` itd. */
  rola: string;
  /** Nazwa dostępna, dosłownie — tak, jak ją odczyta czytnik. */
  nazwa: string;
  /** Jedyny przycisk główny ekranu (klasa atomu `primary` albo `data-przycisk-glowny`). Domyślnie `false`. */
  glowny?: boolean;
  /** Atrybut `disabled` (element wypada z kolejności fokusu). Domyślnie `false`. */
  wylaczony?: boolean;
  /** `aria-disabled="true"`: wygląda na nieczynny, ale zostaje w kolejności fokusu. Domyślnie `false`. */
  nieczynny?: boolean;
  /** Zdanie wskazane przez `aria-describedby`, dosłownie. Bez tego pola opis nie jest sprawdzany. */
  opis?: string;
  /** Adres odnośnika. Bez tego pola adres nie jest sprawdzany. */
  href?: string;
}

/** Rola elementu: jawna z `role` albo wynikająca ze znacznika. */
export function rolaElementu(element: Element): string {
  const jawna = element.getAttribute("role");
  if (jawna !== null && jawna !== "") return jawna;
  const znacznik = element.tagName.toLowerCase();
  if (znacznik === "a") return "link";
  if (znacznik === "button" || znacznik === "summary") return "button";
  if (znacznik === "textarea") return "textbox";
  if (znacznik === "select") return "combobox";
  if (znacznik === "iframe") return "iframe";
  if (znacznik === "input") {
    const rodzaj = (element.getAttribute("type") ?? "text").toLowerCase();
    if (rodzaj === "checkbox") return "checkbox";
    if (rodzaj === "radio") return "radio";
    if (rodzaj === "submit" || rodzaj === "button" || rodzaj === "reset") return "button";
    return "textbox";
  }
  return "generic";
}

/** Czy element jest przyciskiem głównym: klasa atomu `primary` albo znacznik `data-przycisk-glowny`. */
export function jestGlowny(element: Element): boolean {
  if (element.hasAttribute("data-przycisk-glowny")) return true;
  return (element.getAttribute("class") ?? "").split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa));
}

/** Elementy, na które da się wejść klawiaturą, w kolejności drzewa; bez ukrytych (`hidden`, `inert`, `aria-hidden`). */
export function spisInteraktywnych(korzen: ParentNode): HTMLElement[] {
  return [...korzen.querySelectorAll<HTMLElement>(SELEKTOR_INTERAKTYWNYCH)].filter(
    (element) => element.closest("[hidden], [inert], [aria-hidden='true']") === null,
  );
}

function opisDoKomunikatu(element: Element): string {
  const nazwa = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent ?? "";
  return `${rolaElementu(element)} „${nazwa.replace(/\s+/g, " ").trim()}”`;
}

/**
 * Spis elementów interaktywnych ma być dokładnie taki jak `oczekiwane`: ta sama
 * liczba, ta sama kolejność, rola, nazwa dostępna, stan i (gdy podany) opis.
 * Brak nazwy, nadmiarowy albo brakujący element, przycisk główny w złym miejscu
 * — wszystko to czerwieni test z listą tego, co znaleziono.
 */
export function sprawdzSpis(korzen: ParentNode, oczekiwane: OczekiwanyElement[]): void {
  const znalezione = spisInteraktywnych(korzen);
  if (znalezione.length !== oczekiwane.length) {
    throw new Error(
      `Spis elementów interaktywnych: oczekiwano ${oczekiwane.length}, jest ${znalezione.length}.\n` +
        `Jest: ${znalezione.map(opisDoKomunikatu).join(" | ")}\n` +
        `Oczekiwano: ${oczekiwane.map((o) => `${o.rola} „${o.nazwa}”`).join(" | ")}`,
    );
  }
  znalezione.forEach((element, indeks) => {
    const oczekiwany = oczekiwane[indeks];
    const miejsce = `element ${indeks + 1} (${oczekiwany.rola} „${oczekiwany.nazwa}”)`;
    expect(rolaElementu(element), `${miejsce}: rola`).toBe(oczekiwany.rola);
    expect(element, `${miejsce}: ma nazwę dostępną`).toHaveAccessibleName();
    expect(element, `${miejsce}: nazwa dostępna`).toHaveAccessibleName(oczekiwany.nazwa);
    expect(jestGlowny(element), `${miejsce}: przycisk główny`).toBe(oczekiwany.glowny ?? false);
    expect(element.hasAttribute("disabled"), `${miejsce}: atrybut disabled`).toBe(oczekiwany.wylaczony ?? false);
    expect(element.getAttribute("aria-disabled") === "true", `${miejsce}: aria-disabled`).toBe(oczekiwany.nieczynny ?? false);
    if (oczekiwany.opis !== undefined) {
      expect(element, `${miejsce}: opis dostępny`).toHaveAccessibleDescription(oczekiwany.opis);
    }
    if (oczekiwany.href !== undefined) {
      expect(element.getAttribute("href"), `${miejsce}: adres`).toBe(oczekiwany.href);
    }
  });
  const glowne = znalezione.filter(jestGlowny).length;
  expect(glowne, "przycisków głównych na ekranie").toBeLessThanOrEqual(1);
}

export interface NaglowekEkranu {
  poziom: number;
  tekst: string;
}

/** Nagłówki w kolejności drzewa (także ukryte wizualnie, bo czytnik je odczyta); bez ukrytych przed czytnikiem. */
export function naglowki(korzen: ParentNode): NaglowekEkranu[] {
  return [...korzen.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [role='heading']")]
    .filter((element) => element.closest("[hidden], [inert], [aria-hidden='true']") === null)
    .map((element) => {
      const zZnacznika = /^h([1-6])$/i.exec(element.tagName);
      const poziom = zZnacznika !== null ? Number(zZnacznika[1]) : Number(element.getAttribute("aria-level") ?? "2");
      return { poziom, tekst: (element.textContent ?? "").replace(/\s+/g, " ").trim() };
    });
}

/** Miejsca, w których poziom nagłówka rośnie o więcej niż jeden (albo spis nie zaczyna się od h1). */
export function przeskokiNaglowkow(lista: NaglowekEkranu[]): string[] {
  const przeskoki: string[] = [];
  let poprzedni = 0;
  for (const naglowek of lista) {
    if (naglowek.poziom > poprzedni + 1) {
      przeskoki.push(`h${poprzedni} → h${naglowek.poziom} „${naglowek.tekst}”`);
    }
    poprzedni = naglowek.poziom;
  }
  return przeskoki;
}

/** Jeden nagłówek pierwszego stopnia i to on otwiera spis nagłówków. */
export function sprawdzJedenH1(korzen: ParentNode): void {
  const lista = naglowki(korzen);
  const pierwszego = lista.filter((n) => n.poziom === 1);
  expect(pierwszego, "nagłówków h1").toHaveLength(1);
  expect(lista[0]?.poziom, "pierwszy nagłówek na ekranie").toBe(1);
}

/** Teksty komunikatów z `role="alert"` (ogłaszane od razu, bez przenoszenia fokusu). */
export function alerty(korzen: ParentNode): string[] {
  return [...korzen.querySelectorAll<HTMLElement>("[role='alert']")].map((element) =>
    (element.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}
