import { afterEach, describe, expect, it } from "vitest";
import {
  fokusNaNaglowku,
  naglowekEkranu,
  odbierzZapowiedzFokusu,
  zapowiedzFokusSprawy,
} from "../fokus-otwartej-sprawy";

/**
 * Zapowiedź fokusu po „Otwórz” sprawy: jednorazowa, ważna tylko dla ścieżki,
 * na którą prowadzi „Otwórz”; nagłówek dostaje `tabindex="-1"` i fokus.
 */

afterEach(() => {
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
