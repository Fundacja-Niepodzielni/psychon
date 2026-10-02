import { Transform } from "@tiptap/pm/transform";
import { describe, expect, it } from "vitest";
import { parsujTresc } from "../../TrescLekcji/parsujTresc";
import { liczZnaki, odciskTresci, podziel, zapiszBlok, zapiszDokument } from "../zapis";
import { KORPUS, KORPUS_SPOZA, otworz, samTekst, schemat } from "./pomoc";

const CALY_KORPUS = [...KORPUS, ...KORPUS_SPOZA];

/** Dokument z literą „X” dopisaną na początku pierwszego tekstu. */
function dopiszNaPoczatku(dokument: ReturnType<typeof otworz>["dokument"]) {
  let pozycja = -1;
  dokument.descendants((wezel, gdzie) => {
    if (pozycja === -1 && wezel.isText) {
      pozycja = gdzie;
    }
    return pozycja === -1;
  });
  return new Transform(dokument).insert(pozycja, schemat.text("X")).doc;
}

/** Tekst wysyłany po zapisaniu KAŻDEGO bloku od nowa (bez sięgania do źródła). */
function odNowa(tekst: string): string {
  const { dokument, pamiec } = otworz(tekst);
  return zapiszDokument(dokument, pamiec, { wymus: true });
}

describe("schemat edytora: wyłącznie podzbiór z kontraktu", () => {
  it("zna dokładnie te węzły i wyróżnienia — żadnego obrazu, tabeli, bloku kodu, cytatu ani podkreślenia", () => {
    expect(Object.keys(schemat.nodes).sort()).toEqual(
      ["bulletList", "doc", "hardBreak", "heading", "listItem", "miekkieLamanie", "orderedList", "paragraph", "text"].sort(),
    );
    expect(Object.keys(schemat.marks).sort()).toEqual(["bold", "code", "italic", "link"]);
  });

  it("pozycja listy mieści jeden akapit — listy w liście nie ma", () => {
    expect(schemat.nodes.listItem.spec.content).toBe("paragraph");
  });
});

describe("podział na bloki źródła", () => {
  it.each(CALY_KORPUS)("$nazwa: suma kawałków jest tekstem wejściowym znak w znak", ({ tekst }) => {
    const podzial = podziel(tekst);
    expect(podzial.przed + podzial.segmenty.map((s) => s.zrodlo + s.odstep).join("")).toBe(tekst);
    expect(podzial.segmenty.map((s) => s.blok)).toEqual(parsujTresc(tekst));
  });
});

describe("obieg bez strat: tekst → edytor → tekst", () => {
  it.each(KORPUS)("$nazwa: każdy blok zapisany od nowa daje to samo drzewo parsera", ({ tekst }) => {
    const wynik = odNowa(tekst);
    expect(odciskTresci(parsujTresc(wynik))).toBe(odciskTresci(parsujTresc(tekst)));
  });

  it.each(KORPUS.filter((p) => p.nazwa !== "link z niedozwolonym adresem"))(
    "$nazwa: drzewo jest identyczne także bez scalania sąsiednich tekstów",
    ({ tekst }) => {
      expect(parsujTresc(odNowa(tekst))).toEqual(parsujTresc(tekst));
    },
  );

  it.each(CALY_KORPUS)("$nazwa: żaden blok nie wymaga ustępstwa i każdy zapis czyta się z powrotem", ({ tekst }) => {
    const { dokument } = otworz(tekst);
    dokument.forEach((blok) => {
      const zapis = zapiszBlok(blok);
      expect(zapis.sprawdzony, zapis.tekst).toBe(true);
      expect(zapis.ustepstwo).toEqual({ kursywaWPogrubieniu: false, wyroznienia: false, link: false, kod: false });
    });
  });

  it.each(CALY_KORPUS)("$nazwa: zapis od nowa jest stały — drugi obieg nie zmienia ani znaku", ({ tekst }) => {
    const pierwszy = odNowa(tekst);
    expect(odNowa(pierwszy)).toBe(pierwszy);
  });

  it("twarde łamanie obu postaci zostaje twardym łamaniem", () => {
    for (const tekst of ["pierwszy wiersz  \ndrugi wiersz", "pierwszy wiersz\\\ndrugi wiersz"]) {
      const drzewo = parsujTresc(odNowa(tekst));
      expect(drzewo).toHaveLength(1);
      expect(drzewo[0].rodzaj === "akapit" && drzewo[0].dzieci.map((d) => d.rodzaj)).toEqual(["tekst", "lamanie", "tekst"]);
    }
  });
});

describe("otwarcie bez edycji: tekst wraca bajt w bajt", () => {
  it.each(CALY_KORPUS)("$nazwa", ({ tekst }) => {
    const { dokument, pamiec } = otworz(tekst);
    expect(zapiszDokument(dokument, pamiec)).toBe(tekst);
  });
});

describe("treść spoza podzbioru", () => {
  it.each(KORPUS_SPOZA)("$nazwa: w dokumencie jest dosłownym tekstem, znak w znak", ({ tekst }) => {
    const { dokument } = otworz(tekst);
    const dozwolone = new Set(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "text", "miekkieLamanie", "hardBreak"]);
    dokument.descendants((wezel) => {
      expect(dozwolone.has(wezel.type.name), wezel.type.name).toBe(true);
    });
    // Każdy znak źródła poza białymi jest w tekście dokumentu albo jest zapisem podzbioru.
    expect(samTekst(parsujTresc(odNowa(tekst)))).toBe(samTekst(parsujTresc(tekst)));
  });

  it("po edycji innego akapitu fragment spoza podzbioru zostaje znak w znak", () => {
    for (const { tekst } of KORPUS_SPOZA) {
      const zrodlo = `Akapit do edycji.\r\n\r\n${tekst}\r\n\r\n   \r\nOstatni akapit.  \r\n`;
      const { dokument, pamiec } = otworz(zrodlo);
      // Dopisanie litery na początku pierwszego akapitu (miejsce tuż za początkiem pierwszego bloku).
      const zmieniony = dopiszNaPoczatku(dokument);
      const wynik = zapiszDokument(zmieniony, pamiec);
      expect(wynik).toBe(`X${zrodlo}`);
    }
  });

  it("po edycji samego fragmentu jego znaki zostają, a zapis czyta się jako ten sam tekst", () => {
    for (const { tekst } of KORPUS_SPOZA) {
      const { dokument, pamiec } = otworz(tekst);
      const zmieniony = dopiszNaPoczatku(dokument);
      const wynik = zapiszDokument(zmieniony, pamiec);
      expect(samTekst(parsujTresc(wynik))).toBe(`X${samTekst(parsujTresc(tekst))}`);
    }
  });
});

describe("zapis po edycji", () => {
  it("nowy akapit między blokami nietkniętymi dostaje pusty wiersz, sąsiedzi wracają ze źródła", () => {
    const zrodlo = "## Nagłówek\nakapit zaraz po nagłówku\n- punkt";
    const { dokument, pamiec } = otworz(zrodlo);
    const naglowek = dokument.child(0);
    const akapit = schemat.nodes.paragraph.create(null, schemat.text("wstawiony"));
    const zmieniony = new Transform(dokument).insert(naglowek.nodeSize, akapit).doc;
    const wynik = zapiszDokument(zmieniony, pamiec);
    expect(wynik).toBe("## Nagłówek\n\nwstawiony\n\nakapit zaraz po nagłówku\n- punkt");
    expect(parsujTresc(wynik).map((b) => b.rodzaj)).toEqual(["naglowek", "akapit", "akapit", "lista"]);
  });

  it("pusty akapit i pusta pozycja listy nie trafiają do tekstu", () => {
    const { dokument, pamiec } = otworz("- a\n- b");
    const pusty = schemat.nodes.paragraph.create();
    const pustaPozycja = schemat.nodes.listItem.create(null, schemat.nodes.paragraph.create());
    const lista = dokument.child(0);
    const zmieniony = new Transform(dokument).insert(lista.nodeSize - 1, pustaPozycja).insert(0, pusty).doc;
    expect(zapiszDokument(zmieniony, pamiec)).toBe("- a\n- b");
  });

  it("pogrubiona kursywa, której podzbiór nie zna, traci kursywę zamiast zostawić gwiazdki w treści", () => {
    const tekst = schemat.text("słowo", [schemat.marks.bold.create(), schemat.marks.italic.create()]);
    const zapis = zapiszBlok(schemat.nodes.paragraph.create(null, tekst));
    expect(zapis.tekst).toBe("**słowo**");
    expect(zapis.ustepstwo.kursywaWPogrubieniu).toBe(true);
    expect(zapis.sprawdzony).toBe(true);
  });

  it("znaki zapisu wpisane jako tekst dostają lewy ukośnik i wracają jako ten sam tekst", () => {
    for (const wpisany of ["2 * 3 * 4", "`grawis` i [nawias](x)", "## kratki", "- myślnik", "12. kropka", "lewy \\ ukośnik", "a\\"]) {
      const zapis = zapiszBlok(schemat.nodes.paragraph.create(null, schemat.text(wpisany)));
      expect(zapis.sprawdzony, zapis.tekst).toBe(true);
      expect(parsujTresc(zapis.tekst)).toEqual([{ rodzaj: "akapit", dzieci: [{ rodzaj: "tekst", tekst: wpisany }] }]);
    }
  });

  it("twarde łamanie na końcu akapitu nie zostawia wiszącego ukośnika", () => {
    const akapit = schemat.nodes.paragraph.create(null, [schemat.text("wiersz"), schemat.nodes.hardBreak.create()]);
    expect(zapiszBlok(akapit).tekst).toBe("wiersz");
  });

  it("link z adresem spoza listy dozwolonych nie trafia do tekstu jako link", () => {
    const zly = schemat.text("kliknij", [schemat.marks.link.create({ href: "javascript:alert(1)" })]);
    expect(zapiszBlok(schemat.nodes.paragraph.create(null, zly)).tekst).toBe("kliknij");
  });
});

describe("zapis losowych tekstów", () => {
  const KAWALKI = ["a", "ż", " ", "  ", "*", "**", "`", "[", "]", "(", ")", "](/x)", "\\", "#", "## ", "- ", "1. ", "\n", "\n\n", "\r\n", "<b>", "|", "!", "słowo", "🙂"];

  it("300 tekstów: podział zgodny z parserem, otwarcie bez zmian, zapis od nowa stały i bez zgubionego tekstu", () => {
    let ziarno = 20261001;
    const los = () => {
      ziarno = (ziarno * 1103515245 + 12345) % 2147483648;
      return ziarno / 2147483648;
    };
    for (let proba = 0; proba < 300; proba += 1) {
      let tekst = "";
      const dlugosc = 1 + Math.floor(los() * 24);
      for (let i = 0; i < dlugosc; i += 1) {
        tekst += KAWALKI[Math.floor(los() * KAWALKI.length)];
      }
      const opis = JSON.stringify(tekst);
      const podzial = podziel(tekst);
      expect(podzial.przed + podzial.segmenty.map((s) => s.zrodlo + s.odstep).join(""), opis).toBe(tekst);
      const { dokument, pamiec } = otworz(tekst);
      expect(zapiszDokument(dokument, pamiec), opis).toBe(tekst);
      dokument.forEach((blok) => expect(zapiszBlok(blok).sprawdzony, opis).toBe(true));
      const pierwszy = zapiszDokument(dokument, pamiec, { wymus: true });
      expect(samTekst(parsujTresc(pierwszy)), opis).toBe(samTekst(parsujTresc(tekst)));
      expect(odNowa(pierwszy), opis).toBe(pierwszy);
    }
  });
});

describe("licznik znaków liczy tekst wysyłany", () => {
  it.each(CALY_KORPUS)("$nazwa: liczba znaków to liczba punktów kodowych tekstu wysyłanego", ({ tekst }) => {
    const { dokument, pamiec } = otworz(tekst);
    const wysylany = zapiszDokument(dokument, pamiec);
    expect(liczZnaki(wysylany)).toBe(Array.from(tekst).length);
  });

  it("znak wielobajtowy liczy się jako jeden", () => {
    expect(liczZnaki("ż")).toBe(1);
    expect(liczZnaki("🙂")).toBe(1);
    expect(liczZnaki("𝄞ż🙂")).toBe(3);
    expect(liczZnaki("ż".repeat(20000))).toBe(20000);
  });
});
