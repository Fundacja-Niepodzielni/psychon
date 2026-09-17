/**
 * Wspólne przygotowanie środowiska testów frontu.
 * `@testing-library/jest-dom` dokłada asercje na węzłach DOM; sprzątanie po
 * każdym teście zapobiega temu, żeby test widział pozostałości poprzedniego
 * (najczęstsze źródło „zielonego", które mierzy nie ten render, co trzeba).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { vi } from "vitest";

afterEach(() => {
  cleanup();
});

/**
 * jsdom nie zna `ResizeObserver`. Zaślepka poniżej nie jest pusta: zapamiętuje
 * parę (węzeł, wywołanie zwrotne) z każdego `observe()`, żeby test mógł ją
 * wywołać ręcznie przez `wywolajResizeObserver(element)` — bez tego mutacja,
 * która usuwa `observer.observe(el)` w komponencie, przechodzi niezauważona:
 * pusta zaślepka i tak nigdy niczego nie woła.
 */
type WywolanieObserwatora = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

class ResizeObserverZaslepka implements ResizeObserver {
  private static rejestr = new Map<Element, Set<ResizeObserverZaslepka>>();
  private wezly = new Set<Element>();

  constructor(private readonly wywolaj: WywolanieObserwatora) {}

  observe(el: Element) {
    this.wezly.add(el);
    const obserwatorzy = ResizeObserverZaslepka.rejestr.get(el) ?? new Set();
    obserwatorzy.add(this);
    ResizeObserverZaslepka.rejestr.set(el, obserwatorzy);
  }

  unobserve(el: Element) {
    this.wezly.delete(el);
    ResizeObserverZaslepka.rejestr.get(el)?.delete(this);
  }

  disconnect() {
    for (const el of this.wezly) {
      ResizeObserverZaslepka.rejestr.get(el)?.delete(this);
    }
    this.wezly.clear();
  }

  static wywolajDlaElementu(el: Element) {
    const obserwatorzy = ResizeObserverZaslepka.rejestr.get(el);
    obserwatorzy?.forEach((obserwator) =>
      obserwator.wywolaj([] as unknown as ResizeObserverEntry[], obserwator),
    );
  }
}

vi.stubGlobal("ResizeObserver", ResizeObserverZaslepka);

/**
 * Wywołuje zwrotkę `ResizeObserver` dla danego węzła, tak jak zrobiłaby to
 * przeglądarka. Opakowanie w `act` odzwierciedla to, że w prawdziwym środowisku
 * wywołanie zwrotne dociera poza cyklem renderu Reacta.
 */
export function wywolajResizeObserver(el: Element) {
  act(() => {
    ResizeObserverZaslepka.wywolajDlaElementu(el);
  });
}
