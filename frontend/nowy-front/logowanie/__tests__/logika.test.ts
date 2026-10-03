import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KONTO_BINDING_AWARIA, KONTO_BINDING_LIMIT_MS, KOD_KONTO_ZABLOKOWANE } from "@/lib/api";
import {
  adresPrzekierowaniaKont,
  czyZalogowana,
  KOMUNIKAT_BRAKU_POLACZENIA,
  KOMUNIKAT_NIEZNANEGO_BLEDU,
  KOMUNIKATY_BLEDU,
  komunikatAwariiStartu,
  komunikatBleduLogowania,
  LIMIT_CZASU_LOGOWANIA_MS,
  naglowekNiepowiazania,
  sprawdzZLimitem,
  stanZWyniku,
} from "../logika";

describe("logika ekranów logowania", () => {
  it("komunikaty kodów ?error= jak na starej stronie, nieznany kod — zdanie zastępcze", () => {
    expect(komunikatBleduLogowania("AccessDenied")).toBe("Logowanie zostało anulowane.");
    expect(komunikatBleduLogowania("OAuthCallbackError")).toBe(KOMUNIKATY_BLEDU.OAuthCallbackError);
    expect(komunikatBleduLogowania("Cokolwiek")).toBe(KOMUNIKAT_NIEZNANEGO_BLEDU);
    expect(komunikatBleduLogowania("constructor")).toBe(KOMUNIKAT_NIEZNANEGO_BLEDU);
  });

  it("sesja żywa tylko z identyfikatorem i bez błędu", () => {
    expect(czyZalogowana({ user: { id: "17" } })).toBe(true);
    expect(czyZalogowana({ user: { id: "17" }, error: "RefreshAccessTokenError" })).toBe(false);
    expect(czyZalogowana({ user: {} })).toBe(false);
    expect(czyZalogowana(null)).toBe(false);
  });

  it("TypeError to brak połączenia, inny wyjątek — niedostępne logowanie", () => {
    expect(komunikatAwariiStartu(new TypeError("Failed to fetch"))).toBe(KOMUNIKAT_BRAKU_POLACZENIA);
    expect(komunikatAwariiStartu(new Error("x"))).toBe(KOMUNIKATY_BLEDU.Configuration);
  });

  it("granica czasu logowania to 8000 ms i nie jest aliasem limitu sprawdzenia konta", () => {
    expect(LIMIT_CZASU_LOGOWANIA_MS).toBe(8_000);
    const zrodlo = readFileSync(resolve(__dirname, "../logika.ts"), "utf8");
    expect(zrodlo).not.toMatch(/LIMIT_CZASU_LOGOWANIA_MS\s*=\s*KONTO_BINDING_LIMIT_MS/);
  });

  it("przekierowanie starego adresu zachowuje ?error=", () => {
    expect(adresPrzekierowaniaKont(null)).toBe("/logowanie");
    expect(adresPrzekierowaniaKont("AccessDenied")).toBe("/logowanie?error=AccessDenied");
    expect(adresPrzekierowaniaKont("a b&c")).toBe("/logowanie?error=a%20b%26c");
  });

  it("wynik sprawdzenia → stan ekranu", () => {
    expect(stanZWyniku(null)).toEqual({ rodzaj: "awaria" });
    expect(stanZWyniku({ code: KOD_KONTO_ZABLOKOWANE })).toEqual({ rodzaj: "zablokowane" });
    expect(stanZWyniku({ code: "konto_niepowiazane", sub: "demo-sub-0001" })).toEqual({
      rodzaj: "identyfikator",
      sub: "demo-sub-0001",
    });
    expect(stanZWyniku({ code: "konto_niepowiazane" })).toEqual({ rodzaj: "brak-powiazania" });
    expect(stanZWyniku({ code: KONTO_BINDING_AWARIA })).toEqual({ rodzaj: "awaria" });
    expect(stanZWyniku({ code: "unauthenticated" })).toEqual({ rodzaj: "brak-powiazania" });
  });

  it("nagłówek twierdzi o braku połączenia dopiero po wyniku", () => {
    expect(naglowekNiepowiazania({ rodzaj: "sprawdzanie" })).toBe("Twoje konto w PsychON");
    expect(naglowekNiepowiazania({ rodzaj: "awaria" })).toBe("Twoje konto w PsychON");
    expect(naglowekNiepowiazania({ rodzaj: "brak-powiazania" })).toBe("Konto nie jest jeszcze połączone");
    expect(naglowekNiepowiazania({ rodzaj: "identyfikator", sub: "x" })).toBe("Konto nie jest jeszcze połączone");
  });
});

describe("sprawdzenie z limitem czasu", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("po limicie: awaria i przerwany sygnał; spóźniona odpowiedź niczego nie zmienia", async () => {
    let sygnal: AbortSignal | undefined;
    let odpowiedz: (w: unknown) => void = () => {};
    const sprawdz = vi.fn((s: AbortSignal) => {
      sygnal = s;
      return new Promise<never>((r) => (odpowiedz = r as (w: unknown) => void));
    });
    const wynik = sprawdzZLimitem(sprawdz, KONTO_BINDING_LIMIT_MS);
    await vi.advanceTimersByTimeAsync(KONTO_BINDING_LIMIT_MS - 1);
    expect(sygnal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(sygnal?.aborted).toBe(true);
    odpowiedz({ code: "konto_niepowiazane", sub: "spozniony" });
    await expect(wynik).resolves.toEqual({ code: KONTO_BINDING_AWARIA });
  });

  it("odpowiedź przed limitem wygrywa; odrzucenie to awaria", async () => {
    await expect(sprawdzZLimitem(async () => ({ code: "konto_niepowiazane", sub: "s" }), 100)).resolves.toEqual({
      code: "konto_niepowiazane",
      sub: "s",
    });
    await expect(sprawdzZLimitem(async () => Promise.reject(new Error("x")), 100)).resolves.toEqual({
      code: KONTO_BINDING_AWARIA,
    });
  });
});
