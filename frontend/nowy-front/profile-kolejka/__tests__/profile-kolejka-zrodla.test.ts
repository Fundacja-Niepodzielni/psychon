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
 * Pomiary tekstu plików ekranu wniosków o profil (bez `__tests__`): zero
 * surowych przycisków, odnośników i pól oraz zdarzeń na elementach DOM, zero
 * kolorów zapisanych wprost, zero importów ze starego drzewa `components/`,
 * zero `dangerouslySetInnerHTML`, zero własnego `main`; szablon i lista
 * pochodzą z `design-system`. Kontrole naruszeń dla samych pomiarów stoją
 * w pliku testów ekranu decyzji o dyżurach (te same pomocniki).
 */

const PLIKI = plikiEkranu("nowy-front/profile-kolejka", ["app/nowy-front/admin/profile/page.tsx"]);
const PLIKI_KODU = PLIKI.filter((p) => /\.(ts|tsx)$/.test(p));
const PLIKI_TSX = PLIKI.filter((p) => wzgledna(p).endsWith(".tsx"));

describe("ekran wniosków o profil — źródła", () => {
  it("pomiar nie jest pusty: moduł danych, ekran i strona istnieją", () => {
    expect(PLIKI.map(wzgledna)).toEqual(
      expect.arrayContaining([
        "nowy-front/profile-kolejka/dane.ts",
        "nowy-front/profile-kolejka/ProfileKolejka.tsx",
        "app/nowy-front/admin/profile/page.tsx",
      ]),
    );
  });

  it("zero surowych przycisków, odnośników, pól i zdarzeń na elementach DOM", () => {
    expect(PLIKI_TSX.flatMap((p) => surowePrzyciskiIZdarzenia(tresc(p)).map((t) => `${wzgledna(p)}: ${t}`))).toEqual([]);
  });

  it("zero kolorów zapisanych wprost", () => {
    expect(PLIKI.flatMap((p) => twardeKolory(tresc(p)).map((k) => `${wzgledna(p)}: ${k}`))).toEqual([]);
  });

  it("zero importów z components/, zero dangerouslySetInnerHTML, zero własnego main", () => {
    expect(PLIKI_KODU.flatMap((p) => importyZComponents(tresc(p)))).toEqual([]);
    expect(PLIKI_KODU.filter((p) => zawieraInnerHtml(tresc(p))).map(wzgledna)).toEqual([]);
    expect(PLIKI_KODU.filter((p) => znacznikiMain(tresc(p)).length > 0).map(wzgledna)).toEqual([]);
  });

  it("ListTemplate i RecordList wyłącznie z design-system", () => {
    const ekran = tresc(PLIKI.find((p) => wzgledna(p).endsWith("ProfileKolejka.tsx"))!);
    expect(ekran).toMatch(/import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/);
    expect(ekran).toMatch(/import \{ RecordList \} from "@\/design-system\/organizmy\/RecordList\/RecordList";/);
  });

  it("strona montuje ekran i nic więcej", () => {
    const strona = tresc(PLIKI.find((p) => wzgledna(p).endsWith("admin/profile/page.tsx"))!);
    expect(strona).toMatch(/return <ProfileKolejka \/>;/);
  });
});
