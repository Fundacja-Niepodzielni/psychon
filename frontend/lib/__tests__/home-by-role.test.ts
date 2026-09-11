import { describe, expect, it } from "vitest";
import { HOME_BY_ROLE, homeForRole, isRole } from "@/lib/home-by-role";

/**
 * Słownik lądowania wg roli (kontrakt §3.4) — wspólny dla `/logowanie`
 * (sesja już żywa) i `/aktywacja` (świeże powiązanie konta). Świadek mierzy
 * dokładnie tę tabelę, nie jej kopię przepisaną w teście.
 */
describe("homeForRole", () => {
  it.each(Object.entries(HOME_BY_ROLE))("ląduje rolę %s pod %s", (role, home) => {
    expect(homeForRole(role)).toBe(home);
  });

  it("rola spoza słownika ląduje na starcie panelu uczestnika", () => {
    expect(homeForRole("nieznana-rola")).toBe("/panel/start");
  });

  it("brak roli (undefined) też ląduje na starcie panelu uczestnika", () => {
    expect(homeForRole(undefined)).toBe("/panel/start");
  });

  it("isRole odrzuca cokolwiek spoza słownika", () => {
    expect(isRole("student")).toBe(true);
    expect(isRole("ktos-inny")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
