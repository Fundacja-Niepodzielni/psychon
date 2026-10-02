import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WAZNOSC_MS,
  fokusNaNaglowku,
  naglowekEkranu,
  odbierzZapowiedzFokusu,
  zapowiedzFokusSprawy,
} from "../fokus-otwartej-sprawy";

/**
 * Zapowiedź fokusu po „Otwórz” sprawy: jednorazowa, ważna tylko dla ścieżki,
 * na którą prowadzi „Otwórz”, przeżywa pełne załadowanie strony (odnośnik
 * wiersza to zwykłe `<a href>`) i wygasa po `WAZNOSC_MS`; nagłówek dostaje
 * `tabindex="-1"` i fokus.
 */

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  odbierzZapowiedzFokusu();
  window.history.pushState({}, "", "/");
  document.body.innerHTML = "";
});

describe("zapowiedź fokusu sprawy", () => {
  it("bez zapowiedzi — fałsz", () => {
    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(false);
  });

  it("zapowiedź dla bieżącej ścieżki — prawda, a drugi odczyt już fałsz", () => {
    zapowiedzFokusSprawy("/admin/nabor/3");
    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(true);
    expect(odbierzZapowiedzFokusu()).toBe(false);
  });

  it("parametry adresu nie zmieniają ścieżki: /admin/staz?dyzur=5 pasuje do /admin/staz", () => {
    zapowiedzFokusSprawy("/admin/staz?dyzur=5");
    window.history.pushState({}, "", "/admin/staz?dyzur=5");
    expect(odbierzZapowiedzFokusu()).toBe(true);
  });

  it("zapowiedź dla innej ścieżki — fałsz i zapowiedź znika", () => {
    zapowiedzFokusSprawy("/admin/profile/2");
    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(false);
    window.history.pushState({}, "", "/admin/profile/2");
    expect(odbierzZapowiedzFokusu()).toBe(false);
  });
});

describe("zapowiedź fokusu sprawy — pełne załadowanie strony i ważność", () => {
  it("przeżywa ponowne załadowanie modułu (nowa strona po zwykłym odnośniku)", async () => {
    zapowiedzFokusSprawy("/admin/profile/2");
    vi.resetModules();
    const nowyModul = await import("../fokus-otwartej-sprawy");
    window.history.pushState({}, "", "/admin/profile/2");
    expect(nowyModul.odbierzZapowiedzFokusu()).toBe(true);
    expect(nowyModul.odbierzZapowiedzFokusu()).toBe(false);
  });

  it("zapowiedź starsza niż czas ważności nie działa", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    zapowiedzFokusSprawy("/admin/nabor/3");
    vi.setSystemTime(new Date(Date.parse("2026-10-02T12:00:00Z") + WAZNOSC_MS + 1));
    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(false);
  });

  it("zapowiedź w czasie ważności działa", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    zapowiedzFokusSprawy("/admin/nabor/3");
    vi.setSystemTime(new Date(Date.parse("2026-10-02T12:00:00Z") + WAZNOSC_MS));
    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(true);
  });

  it("magazyn niedostępny: brak zapowiedzi, bez wyjątku", () => {
    // Przeglądarka z zablokowanym magazynem rzuca już przy dostępie do `sessionStorage`.
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("magazyn zablokowany", "SecurityError");
    });
    expect(() => zapowiedzFokusSprawy("/admin/nabor/3")).not.toThrow();
    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(false);
  });

  it("uszkodzony zapis: brak zapowiedzi i zapis znika", () => {
    window.sessionStorage.setItem("np-fokus-otwartej-sprawy", "{nie-json");
    expect(odbierzZapowiedzFokusu()).toBe(false);
    expect(window.sessionStorage.getItem("np-fokus-otwartej-sprawy")).toBeNull();
  });
});

describe("fokus na nagłówku", () => {
  it("nagłówek bez tabindex dostaje -1 i fokus", () => {
    document.body.innerHTML = "<main><h1>Zgłoszenie: Marta Demo</h1></main>";
    const naglowek = naglowekEkranu();
    expect(naglowek?.textContent).toBe("Zgłoszenie: Marta Demo");
    fokusNaNaglowku(naglowek);
    expect(naglowek).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(naglowek);
  });

  it("istniejący tabindex zostaje bez zmian", () => {
    document.body.innerHTML = '<main><h1 tabindex="0">Tytuł</h1></main>';
    const naglowek = naglowekEkranu();
    fokusNaNaglowku(naglowek);
    expect(naglowek).toHaveAttribute("tabindex", "0");
    expect(document.activeElement).toBe(naglowek);
  });

  it("brak nagłówka — nic się nie dzieje", () => {
    document.body.innerHTML = "<div><h1>Poza main</h1></div>";
    expect(naglowekEkranu()).toBeNull();
    expect(() => fokusNaNaglowku(null)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});
