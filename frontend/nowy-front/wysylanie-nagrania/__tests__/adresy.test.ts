import { describe, expect, it } from "vitest";
import type { DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import { czyAdresZPaskiemWysylania } from "../adresy";

function grupa(wlaczona: boolean, panel: string, nowaTrasa: string): DefinicjaGrupy {
  return { wlaczona, ekrany: [{ panel, nowaTrasa }] } as unknown as DefinicjaGrupy;
}

const GRUPY_PROBNE = {
  kursy: grupa(true, "administracja", "/admin/kursy"),
  lekcja: grupa(true, "administracja", "/admin/kursy/[id]/lekcje/[idLekcji]"),
  ustawienia: grupa(false, "administracja", "/admin/ustawienia"),
  pulpit: grupa(true, "uczestnik", "/panel/pulpit"),
};

describe("adres ekranu z paskiem wysyłania", () => {
  it("ekran administracji z włączonej grupy ma pasek", () => {
    expect(czyAdresZPaskiemWysylania("/admin/kursy", GRUPY_PROBNE)).toBe(true);
    expect(czyAdresZPaskiemWysylania("/admin/kursy/4/lekcje/22", GRUPY_PROBNE)).toBe(true);
  });

  it("kotwica i zapytanie w adresie nie zmieniają wyniku", () => {
    expect(czyAdresZPaskiemWysylania("/admin/kursy/4/lekcje/22#nagranie", GRUPY_PROBNE)).toBe(true);
    expect(czyAdresZPaskiemWysylania("/admin/kursy?strona=2", GRUPY_PROBNE)).toBe(true);
  });

  it("ekran administracji z wyłączonej grupy nie ma paska", () => {
    expect(czyAdresZPaskiemWysylania("/admin/ustawienia", GRUPY_PROBNE)).toBe(false);
  });

  it("ekran innego panelu nie ma paska, choć jego grupa jest włączona", () => {
    expect(czyAdresZPaskiemWysylania("/panel/pulpit", GRUPY_PROBNE)).toBe(false);
  });

  it("adres spoza rejestru, adres zewnętrzny i pusty nie mają paska", () => {
    expect(czyAdresZPaskiemWysylania("/admin/nieznany-ekran", GRUPY_PROBNE)).toBe(false);
    expect(czyAdresZPaskiemWysylania("//admin/kursy", GRUPY_PROBNE)).toBe(false);
    expect(czyAdresZPaskiemWysylania("https://przyklad.test/admin/kursy", GRUPY_PROBNE)).toBe(false);
    expect(czyAdresZPaskiemWysylania("", GRUPY_PROBNE)).toBe(false);
  });

  it("rejestr aplikacji: kurs, lekcja i lista kursów administracji mają pasek", () => {
    expect(czyAdresZPaskiemWysylania("/admin/kursy")).toBe(true);
    expect(czyAdresZPaskiemWysylania("/admin/kursy/4")).toBe(true);
    expect(czyAdresZPaskiemWysylania("/admin/kursy/4/lekcje/22")).toBe(true);
    expect(czyAdresZPaskiemWysylania("/panel/pulpit")).toBe(false);
  });
});
