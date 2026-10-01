import { describe, expect, it } from "vitest";
import {
  importyZComponents,
  plikiEkranu,
  surowePrzyciskiIZdarzenia,
  tresc,
  twardeKolory,
  wzgledna,
  zawieraInnerHtml,
  znacznikiMain,
} from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Pomiary tekstu plików ekranu „Kursy” (administracja), bez `__tests__`: zero
 * surowych przycisków, odnośników i pól oraz zdarzeń na elementach DOM, zero
 * kolorów zapisanych wprost, zero importów ze starego drzewa `components/`,
 * zero `dangerouslySetInnerHTML`, zero własnego znacznika `main`; szablon i
 * organizmy pochodzą wyłącznie z `design-system`.
 */

const PLIKI = plikiEkranu("nowy-front/kursy-administracji", [
  "app/nowy-front/admin/kursy/page.tsx",
  "app/(administracja)/admin/kursy/page.tsx",
]);
const PLIKI_KODU = PLIKI.filter((p) => /\.(ts|tsx)$/.test(p));
const PLIKI_TSX = PLIKI.filter((p) => wzgledna(p).endsWith(".tsx"));

function ekran(): string {
  return tresc(PLIKI.find((p) => wzgledna(p).endsWith("KursyAdministracji.tsx"))!);
}

describe("ekran „Kursy” (administracja) — źródła", () => {
  it("pomiar nie jest pusty: dane, logika, ekran, arkusz stylów i obie strony istnieją", () => {
    expect(PLIKI.map(wzgledna)).toEqual(
      expect.arrayContaining([
        "nowy-front/kursy-administracji/dane.ts",
        "nowy-front/kursy-administracji/logika.ts",
        "nowy-front/kursy-administracji/KursyAdministracji.tsx",
        "nowy-front/kursy-administracji/KursyAdministracji.module.css",
        "app/nowy-front/admin/kursy/page.tsx",
        "app/(administracja)/admin/kursy/page.tsx",
      ]),
    );
  });

  it("zero surowych przycisków, odnośników, pól i zdarzeń na elementach DOM", () => {
    const trafienia = PLIKI_TSX.flatMap((p) => surowePrzyciskiIZdarzenia(tresc(p)).map((t) => `${wzgledna(p)}: ${t}`));
    expect(trafienia).toEqual([]);
  });

  it("zero kolorów zapisanych wprost (kod i arkusz stylów)", () => {
    const trafienia = PLIKI.flatMap((p) => twardeKolory(tresc(p)).map((k) => `${wzgledna(p)}: ${k}`));
    expect(trafienia).toEqual([]);
  });

  it("zero importów z components/, zero dangerouslySetInnerHTML, zero własnego main", () => {
    expect(PLIKI_KODU.flatMap((p) => importyZComponents(tresc(p)))).toEqual([]);
    expect(PLIKI_KODU.filter((p) => zawieraInnerHtml(tresc(p))).map(wzgledna)).toEqual([]);
    expect(PLIKI_KODU.filter((p) => znacznikiMain(tresc(p)).length > 0).map(wzgledna)).toEqual([]);
  });

  it("szablon i organizmy wyłącznie z design-system", () => {
    const zrodlo = ekran();
    expect(zrodlo).toMatch(/import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/);
    expect(zrodlo).toMatch(/import \{ PageHeader \} from "@\/design-system\/organizmy\/PageHeader\/PageHeader";/);
    expect(zrodlo).toMatch(/import \{ RecordList \} from "@\/design-system\/organizmy\/RecordList\/RecordList";/);
    expect(zrodlo).toMatch(/import \{ FormSection, type PoleFormSection \} from "@\/design-system\/organizmy\/FormSection\/FormSection";/);
    expect(zrodlo).toMatch(/import \{ Dialog \} from "@\/design-system\/organizmy\/Dialog\/Dialog";/);
  });

  it("ekran woła API wyłącznie przez moduł danych", () => {
    expect(ekran()).not.toMatch(/@\/lib\/api(?!\/klient)/);
    expect(ekran()).not.toMatch(/\bapi(Paged)?\(/);
  });

  it("strona poligonu montuje ekran i nic więcej", () => {
    const strona = tresc(PLIKI.find((p) => wzgledna(p).endsWith("app/nowy-front/admin/kursy/page.tsx"))!);
    expect(strona).toMatch(/return <KursyAdministracji \/>;/);
  });
});

describe("pomiary źródeł — kontrole na tekście z naruszeniem", () => {
  it("wykrywa surowy przycisk, odnośnik i pole", () => {
    const kod = `<div><button type="button">A</button><a href="/x">B</a><input name="c" /></div>`;
    expect(surowePrzyciskiIZdarzenia(kod)).toHaveLength(3);
  });

  it("wykrywa zdarzenie na elemencie DOM, a nie na komponencie", () => {
    expect(surowePrzyciskiIZdarzenia(`<div onClick={() => zrob(1)}>A</div>`)).toHaveLength(1);
    expect(surowePrzyciskiIZdarzenia(`<Button onClick={() => zrob(1)}>A</Button>`)).toEqual([]);
  });

  it("wykrywa kolor zapisany wprost, import z components/, innerHTML i własny main", () => {
    expect(twardeKolory("a { color: #1a2b3c; background: rgb(1, 2, 3); }")).toHaveLength(2);
    expect(importyZComponents(`import X from "@/components/ui/Button";`)).toHaveLength(1);
    expect(zawieraInnerHtml("<div dangerously" + "SetInnerHTML={{ __html: x }} />")).toBe(true);
    expect(znacznikiMain("<" + "main id=\"tresc\">")).toHaveLength(1);
  });
});
