import type { Page, TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Reguły WCAG objęte skanem — te same tagi co deklaracja dostępności
 * (WCAG 2.1 AA), plus 2A jako podstawa.
 *
 * GRANICA ZASIĘGU (nie do rozszerzenia w tym zleceniu, tylko do zapisania):
 * `axe.run()` skanuje DOM w stanie spoczynku — bez kursora nad elementem i
 * bez fokusu klawiatury. Kontrast, który zależy WYŁĄCZNIE od `:hover` albo
 * `:focus-visible` (a nie jest już niewystarczający w stanie spoczynku),
 * NIE jest tu łapany — zmierzone wstrzyknięciem takiej reguły osobno: axe
 * przechodzi zielono mimo złego kontrastu w tych dwóch stanach. Kontrast
 * jest więc pokryty tylko w stanie spoczynku, nie w całości.
 */
const TAGI_WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];

export type WagaNaruszenia = "critical" | "serious" | "moderate" | "minor";

export interface WynikAxe {
  id: string;
  impact: WagaNaruszenia | null;
  liczbaWezlow: number;
  pomoc: string;
  /** Selektory CSS węzłów, na których axe zgłosił naruszenie (do komunikatu błędu). */
  selektory: string[];
}

/**
 * Przerywa WYŁĄCZNIE zapytania prefetchu linków Next.js (nagłówek
 * `Next-Router-Prefetch`, wysyłany przez `next/link`, gdy odnośnik wejdzie w
 * widok — np. stopka publiczna, `PublicFooter.tsx`, ma kilka takich
 * odnośników). Prefetch sam w sobie nic nie psuje, ale IntersectionObserver
 * Next.js ponawia go w kółko i przez to strona NIGDY nie jest sieciowo
 * bezczynna — zmierzone: `waitForLoadState("networkidle")` bez tego blokowania
 * potrafił trwać kilkanaście-24,5 s na trasach ze stopką (limit testu to
 * 30 s), więc naprawa jednego wyścigu wprowadzałaby drugi, nowy, na granicy
 * timeoutu. Inne zapytania (w tym prawdziwe wywołania API aplikacji) idą
 * dalej bez zmian — przepuszczone przez `route.continue()`.
 */
async function zatrzymajPrefetchLinkow(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    if (route.request().headers()["next-router-prefetch"] !== undefined) {
      return route.abort();
    }
    return route.continue();
  });
}

/**
 * Czeka, aż ustaną wszystkie CSS-owe PRZEJŚCIA (transition) na stronie,
 * zanim axe zeskanuje DOM. Bez tego axe potrafi złapać kolor w trakcie
 * interpolacji — np. `Button` (`components/ui/Button.tsx`) ma
 * `transition-colors duration-150` i zmienia wariant (a więc i kolor
 * obramowania/tła) w reakcji na odpowiedź sieciową ustaloną w efekcie po
 * zamontowaniu (`/logowanie/niepowiazane`: wariant przycisku "Wyloguj"
 * zmienia się z `primary` na `secondary`, gdy sprawdzenie powiązania konta
 * rozstrzygnie się na "awaria"). Zmierzone jako niestabilna czerwień na
 * `.border-primary` tego przycisku: 4/7 pełnych biegów lokalnie, 1/7 na
 * WSL, zawsze to samo miejsce — axe skanował dokładnie w oknie interpolacji
 * koloru, nie po jej zakończeniu. Najpierw czekamy na ustanie ruchu
 * sieciowego (żeby efekt zdążył w ogóle przełączyć wariant — stąd
 * `zatrzymajPrefetchLinkow` wyżej, bez niego to czekanie samo staje się
 * niestabilne), potem na zakończenie przejścia.
 *
 * Celowo NIE czeka na `CSSAnimation` (np. spinner `animate-spin` na
 * przycisku w stanie `loading`) — to pętla bez końca, więc czekanie na jej
 * zakończenie zawiesiłoby test w nieskończoność. Filtr sprawdza wyłącznie
 * `CSSTransition`.
 */
async function poczekajNaZakonczeniePrzejsc(page: Page): Promise<void> {
  await zatrzymajPrefetchLinkow(page);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.constructor?.name !== "CSSTransition" || a.playState !== "running"),
  );
}

/**
 * Uruchamia axe-core na aktualnej stronie i zwraca listę naruszeń w
 * uproszczonej postaci (do logu/attachmentu w raporcie testu).
 */
export async function uruchomAxe(page: Page): Promise<WynikAxe[]> {
  await poczekajNaZakonczeniePrzejsc(page);
  const wynik = await new AxeBuilder({ page }).withTags(TAGI_WCAG).analyze();
  return wynik.violations.map((v) => ({
    id: v.id,
    impact: (v.impact as WagaNaruszenia | null) ?? null,
    liczbaWezlow: v.nodes.length,
    pomoc: v.help,
    selektory: v.nodes.map((n) => n.target.map(String).join(" ")),
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
 * Pierwszy realny pomiar: test PADA na critical/serious, bo to
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
