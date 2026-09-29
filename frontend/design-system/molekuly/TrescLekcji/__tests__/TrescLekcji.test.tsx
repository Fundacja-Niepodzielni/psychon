import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TrescLekcji } from "../TrescLekcji";
import { bezpiecznyAdres } from "../parsujTresc";

/** Ta sama treść co w świadku zaplecza (`LessonContentTest::XSS`) plus wariant schematu z wielkimi literami. */
const XSS = [
  "<script>alert(1)</script>",
  "",
  "<img src=x onerror=alert(1)>",
  "",
  "[x](javascript:alert(1))",
  "",
  "[y]( JaVaScRiPt:alert(1))",
  "",
  "[z](java\tscript:alert(1)) [d](data:text/html;base64,PHNjcmlwdD4=) [v](VBScript:msgbox(1))",
].join("\n");

function renderuj(tresc: string | null) {
  return render(<TrescLekcji tresc={tresc} />);
}

describe("TrescLekcji — HTML w treści jest tekstem", () => {
  it("nie tworzy elementów script ani img i nie daje linku javascript:", () => {
    const { container } = renderuj(XSS);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const adresy = Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "");
    for (const adres of adresy) {
      expect(adres.replace(/[\u0000- ]/g, "").toLowerCase()).not.toMatch(/^(javascript|data|vbscript):/);
    }
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("pokazuje znaczniki dosłownie w textContent", () => {
    const { container } = renderuj(XSS);

    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("link z niedozwolonym schematem zostaje samym tekstem linku", () => {
    const { container } = renderuj("[kliknij](javascript:alert(1))");

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("kliknij");
  });

  it("nie renderuje niczego dla null i pustej treści", () => {
    expect(renderuj(null).container).toBeEmptyDOMElement();
    expect(renderuj("  \n\n ").container).toBeEmptyDOMElement();
  });
});

describe("TrescLekcji — elementy podzbioru", () => {
  it("akapity rozdzielone pustym wierszem", () => {
    const { container } = renderuj("Pierwszy akapit.\n\nDrugi akapit.");

    const akapity = container.querySelectorAll("p");
    expect(akapity).toHaveLength(2);
    expect(akapity[0].textContent).toBe("Pierwszy akapit.");
    expect(akapity[1].textContent).toBe("Drugi akapit.");
  });

  it("nagłówki ## i ###, a # i #### zostają tekstem", () => {
    const { container } = renderuj("## Wprowadzenie\n\n### Szczegóły\n\n# Nie nagłówek\n\n#### Też nie");

    expect(container.querySelector("h2")?.textContent).toBe("Wprowadzenie");
    expect(container.querySelector("h3")?.textContent).toBe("Szczegóły");
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h4")).toBeNull();
    expect(container.textContent).toContain("# Nie nagłówek");
    expect(container.textContent).toContain("#### Też nie");
  });

  it("pogrubienie i kursywa", () => {
    const { container } = renderuj("To jest **ważne** i *podkreślone*, a **bardzo *ważne* rzeczy**.");

    const mocne = container.querySelectorAll("strong");
    expect(mocne[0].textContent).toBe("ważne");
    expect(container.querySelector("p > em")?.textContent).toBe("podkreślone");
    expect(mocne[1].querySelector("em")?.textContent).toBe("ważne");
  });

  it("lista punktowana", () => {
    const { container } = renderuj("- pierwszy\n- drugi **mocny**\n- trzeci");

    const lista = container.querySelector("ul");
    expect(lista).not.toBeNull();
    const punkty = lista!.querySelectorAll("li");
    expect(punkty).toHaveLength(3);
    expect(punkty[1].querySelector("strong")?.textContent).toBe("mocny");
  });

  it("lista numerowana, z numerem startowym innym niż 1", () => {
    const { container } = renderuj("1. raz\n2. dwa\n\n3. trzy\n4. cztery");

    const listy = container.querySelectorAll("ol");
    expect(listy).toHaveLength(2);
    expect(listy[0].querySelectorAll("li")).toHaveLength(2);
    expect(listy[0].hasAttribute("start")).toBe(false);
    expect(listy[1].getAttribute("start")).toBe("3");
  });

  it("kod w linii bez interpretacji wnętrza", () => {
    const { container } = renderuj("Uruchom `**nie pogrubiaj** <b>`.");

    const kod = container.querySelector("code");
    expect(kod?.textContent).toBe("**nie pogrubiaj** <b>");
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("twarde łamanie wiersza (dwie spacje albo ukośnik), miękkie bez <br>", () => {
    const { container } = renderuj("wiersz pierwszy  \nwiersz drugi\\\nwiersz trzeci\nwiersz czwarty");

    const akapit = container.querySelector("p");
    expect(akapit?.querySelectorAll("br")).toHaveLength(2);
    expect(akapit?.textContent).toBe("wiersz pierwszywiersz drugiwiersz trzeci\nwiersz czwarty");
  });

  it("linki https, http, mailto i ścieżki od /; zewnętrzne z rel", () => {
    const { container } = renderuj(
      "[a](https://example.org/x) [b](http://example.org) [c](mailto:?subject=Pytanie) [d](/panel/lekcje/2) [e](//obcy.example) [f](ftp://example.org)",
    );

    const linki = Array.from(container.querySelectorAll("a"));
    expect(linki.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("rel")])).toEqual([
      ["a", "https://example.org/x", "noopener noreferrer"],
      ["b", "http://example.org", "noopener noreferrer"],
      ["c", "mailto:?subject=Pytanie", null],
      ["d", "/panel/lekcje/2", null],
    ]);
    expect(container.textContent).toContain("e");
    expect(container.textContent).toContain("f");
  });

  it("znak ucieczki daje dosłowny znak", () => {
    const { container } = renderuj("\\*nie kursywa\\* i \\[nie link\\](https://example.org)");

    expect(container.querySelector("em")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("*nie kursywa* i [nie link](https://example.org)");
  });
});

describe("bezpiecznyAdres", () => {
  it.each([
    ["javascript:alert(1)"],
    [" JaVaScRiPt:alert(1)"],
    ["java\tscript:alert(1)"],
    ["java\nscript:alert(1)"],
    ["\u0000javascript:alert(1)"],
    ["data:text/html,x"],
    ["DATA:text/html,x"],
    ["vbscript:msgbox(1)"],
    ["//obcy.example"],
    ["/\\obcy.example"],
    ["lekcje/2"],
    [""],
  ])("odrzuca %j", (adres) => {
    expect(bezpiecznyAdres(adres)).toBeNull();
  });

  it.each([
    ["https://example.org", true],
    ["HTTP://example.org", true],
    ["mailto:?subject=Pytanie", false],
    ["/panel", false],
  ])("przyjmuje %j (zewnętrzny: %s)", (adres, zewnetrzny) => {
    expect(bezpiecznyAdres(adres)).toEqual({ adres, zewnetrzny });
  });
});
