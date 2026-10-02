import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TRESC_PRZYKLADOWA, TRESC_SPOZA_PODZBIORU } from "../../../poligon/edytor-przyklady";
import { parsujTresc } from "../../TrescLekcji/parsujTresc";
import { EdytorTresci } from "../EdytorTresci";
import type { Silnik } from "../silnik";
import { liczZnaki } from "../zapis";
import { KORPUS, KORPUS_SPOZA } from "./pomoc";

// Próby sięgają do silnika utworzonego przez molekułę (zaznaczenie, wklejanie),
// bez dokładania do niej właściwości tylko dla prób.
const { silniki } = vi.hoisted(() => ({ silniki: [] as Silnik[] }));
vi.mock("../silnik", async (oryginal) => {
  const modul = await oryginal<typeof import("../silnik")>();
  return {
    ...modul,
    utworzSilnik: (opcje: Parameters<typeof modul.utworzSilnik>[0]) => {
      const silnik = modul.utworzSilnik(opcje);
      silniki.push(silnik);
      return silnik;
    },
  };
});

beforeAll(() => {
  // jsdom nie liczy układu; silnik pyta o prostokąty przy przewijaniu do kursora.
  const prostokat = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => prostokat as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  document.elementFromPoint = () => null;
});

beforeEach(() => {
  silniki.length = 0;
  delete (window as unknown as { wykonano?: boolean }).wykonano;
});

function Kontrolowany({ poczatek, onZmiana }: { poczatek: string; onZmiana: (tekst: string) => void }) {
  const [wartosc, setWartosc] = useState(poczatek);
  return (
    <>
      <EdytorTresci
        wartosc={wartosc}
        onZmiana={(tekst) => {
          setWartosc(tekst);
          onZmiana(tekst);
        }}
      />
      <button type="button" onClick={() => setWartosc(TRESC_PRZYKLADOWA)}>
        Wczytaj inną lekcję
      </button>
    </>
  );
}

async function otworzEdytor(poczatek: string) {
  const onZmiana = vi.fn<(tekst: string) => void>();
  render(<Kontrolowany poczatek={poczatek} onZmiana={onZmiana} />);
  const obszar = await screen.findByRole("textbox", { name: "Treść lekcji" });
  const silnik = silniki[silniki.length - 1];
  const pasek = screen.getByRole("toolbar", { name: "Formatowanie treści" });
  return { onZmiana, obszar, silnik, edytor: silnik.edytor, pasek };
}

/** Zaznacza pierwsze wystąpienie słowa w dokumencie. */
function zaznacz(silnik: Silnik, slowo: string) {
  let od = -1;
  silnik.edytor.state.doc.descendants((wezel, pozycja) => {
    if (od === -1 && wezel.isText && (wezel.text ?? "").includes(slowo)) {
      od = pozycja + (wezel.text ?? "").indexOf(slowo);
    }
  });
  expect(od, `brak „${slowo}” w dokumencie`).toBeGreaterThan(-1);
  act(() => {
    silnik.edytor.commands.setTextSelection({ from: od, to: od + slowo.length });
  });
}

function przycisk(pasek: HTMLElement, nazwa: string) {
  return within(pasek).getByRole("button", { name: nazwa });
}

function klik(element: HTMLElement) {
  act(() => {
    fireEvent.mouseDown(element);
    fireEvent.click(element);
  });
}

function wklej(silnik: Silnik, html: string) {
  act(() => {
    // jsdom nie ma `ClipboardEvent`; silnik potrzebuje tu tylko zdarzenia do przekazania dalej.
    silnik.edytor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
  });
}

function ostatni(onZmiana: ReturnType<typeof vi.fn<(tekst: string) => void>>): string {
  expect(onZmiana).toHaveBeenCalled();
  return onZmiana.mock.calls[onZmiana.mock.calls.length - 1][0];
}

describe("EdytorTresci: otwarcie bez dotknięcia treści", () => {
  it.each([...KORPUS, ...KORPUS_SPOZA])("$nazwa: `onZmiana` nie jest wołane", async ({ tekst }) => {
    const { onZmiana, obszar, silnik } = await otworzEdytor(tekst);
    // Wejście w obszar, ruch kursora i wyjście to nie edycja.
    act(() => {
      silnik.fokus();
      silnik.edytor.commands.selectAll();
      silnik.edytor.commands.setTextSelection(1);
      obszar.blur();
    });
    expect(onZmiana).not.toHaveBeenCalled();
  });

  it("treść wczytana z zewnątrz zastępuje dokument i też niczego nie zgłasza", async () => {
    const { onZmiana, obszar } = await otworzEdytor("pierwsza lekcja  \r\n");
    klik(screen.getByRole("button", { name: "Wczytaj inną lekcję" }));
    expect(within(obszar).getByRole("heading", { level: 2, name: "Jak zacząć rozmowę" })).toBeInTheDocument();
    expect(onZmiana).not.toHaveBeenCalled();
  });

  it("do czasu wczytania silnika treść jest pokazana jak u uczestnika, a pasek jest nieaktywny", () => {
    render(<EdytorTresci wartosc="## Tytuł" onZmiana={() => {}} />);
    expect(screen.getByRole("heading", { level: 2, name: "Tytuł" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pogrubienie" })).toBeDisabled();
  });
});

describe("EdytorTresci: treść spoza podzbioru", () => {
  it("jest widoczna jako dosłowny tekst — bez znaczników, bez wykonania", async () => {
    const { obszar } = await otworzEdytor(TRESC_SPOZA_PODZBIORU);
    expect(obszar.textContent).toContain("<script>window.wykonano = true</script>");
    expect(obszar.textContent).toContain('<img src="x" onerror="window.wykonano = true">');
    expect(obszar.textContent).toContain("| Kolumna | Druga |");
    // Zapis obrazu parser treści czyta jako wykrzyknik i link — tak samo widzi go uczestnik.
    expect(obszar.textContent).toContain("!Obraz");
    expect(obszar.textContent).toContain("```");
    expect(obszar.querySelector("script, img, table, pre, blockquote")).toBeNull();
    expect((window as unknown as { wykonano?: boolean }).wykonano).toBeUndefined();
  });

  it("po edycji innego akapitu wraca znak w znak, razem z końcami wiersza", async () => {
    const { onZmiana, silnik } = await otworzEdytor(TRESC_SPOZA_PODZBIORU);
    act(() => {
      silnik.edytor.commands.insertContentAt(1, "X");
    });
    expect(ostatni(onZmiana)).toBe(`X${TRESC_SPOZA_PODZBIORU}`);
  });
});

describe("EdytorTresci: wklejanie obcego HTML", () => {
  const OBCY_HTML = [
    '<meta charset="utf-8">',
    '<h1 style="color:red" class="MsoTitle">Tytuł z edytora biurowego</h1>',
    '<p class="MsoNormal" style="margin:0cm;font-family:Calibri" onclick="window.wykonano = true">',
    '<span style="color:#ff0000;text-decoration:underline">kolorowy</span> <u>podkreślony</u> <b>gruby</b> <i>pochyły</i>',
    '<a href="javascript:window.wykonano = true">zły link</a> <a href=" JaVaScRiPt:alert(1)">drugi zły</a>',
    '<a href="data:text/html,x">trzeci zły</a> <a href="https://example.org/dobry" onclick="window.wykonano = true" target="_blank">dobry link</a></p>',
    '<img src="http://127.0.0.1:9949/zdalny.png" onerror="window.wykonano = true" alt="obraz">',
    "<table><tr><td>komórka</td><td>druga</td></tr></table>",
    "<script>window.wykonano = true</script><style>p{color:red}</style>",
    "<blockquote>cytat</blockquote><pre><code>blok kodu</code></pre>",
    '<ul><li>punkt<ul><li>wcięty</li></ul></li></ul><ol type="a" start="3"><li>numer</li></ol>',
    '<iframe src="http://127.0.0.1:9949/ramka"></iframe><h2>Nagłówek</h2><h3>Mniejszy</h3><h4>Czwarty</h4>',
  ].join("");

  it("w dokumencie zostają wyłącznie węzły i wyróżnienia podzbioru", async () => {
    const { silnik, obszar, onZmiana } = await otworzEdytor("");
    wklej(silnik, OBCY_HTML);

    const wezly = new Set<string>();
    const znaki = new Set<string>();
    silnik.edytor.state.doc.descendants((wezel) => {
      wezly.add(wezel.type.name);
      wezel.marks.forEach((znak) => znaki.add(znak.type.name));
    });
    const dozwoloneWezly = ["paragraph", "heading", "bulletList", "orderedList", "listItem", "text", "hardBreak", "miekkieLamanie"];
    expect([...wezly].filter((nazwa) => !dozwoloneWezly.includes(nazwa))).toEqual([]);
    expect([...znaki].filter((nazwa) => !["bold", "italic", "code", "link"].includes(nazwa))).toEqual([]);

    expect(obszar.querySelector("img, table, script, style, iframe, blockquote, pre, u, span[style], h1, h4, [onclick], [onerror], [target]")).toBeNull();
    expect(obszar.querySelector("li li, li ul, li ol")).toBeNull();
    expect(obszar.querySelector("ol[type]")).toBeNull();
    expect((window as unknown as { wykonano?: boolean }).wykonano).toBeUndefined();

    // Tekst został, wyróżnienia podzbioru też.
    for (const slowo of ["Tytuł z edytora biurowego", "kolorowy", "podkreślony", "komórka", "cytat", "blok kodu", "wcięty"]) {
      expect(obszar.textContent).toContain(slowo);
    }
    expect(obszar.querySelector("strong")?.textContent).toBe("gruby");
    expect(obszar.querySelector("em")?.textContent).toBe("pochyły");

    // Tekst wysyłany czyta się parserem treści i nie niesie żadnego znacznika.
    const wysylany = ostatni(onZmiana);
    expect(wysylany).not.toMatch(/<|javascript:|data:|onerror|onclick/i);
    expect(parsujTresc(wysylany).length).toBeGreaterThan(5);
  });

  it("link z niedozwolonym schematem zostaje samym tekstem, dozwolony — linkiem", async () => {
    const { silnik, obszar, onZmiana } = await otworzEdytor("");
    wklej(silnik, OBCY_HTML);
    const odnosniki = Array.from(obszar.querySelectorAll("a"));
    expect(odnosniki.map((a) => a.getAttribute("href"))).toEqual(["https://example.org/dobry"]);
    expect(odnosniki[0].getAttribute("rel")).toBe("noopener noreferrer");
    for (const tekst of ["zły link", "drugi zły", "trzeci zły"]) {
      expect(obszar.textContent).toContain(tekst);
    }
    expect(ostatni(onZmiana)).toContain("[dobry link](https://example.org/dobry)");
  });
});

describe("EdytorTresci: link z paska", () => {
  async function zOknemLinku(adres: string) {
    const wynik = await otworzEdytor("Pierwsze słowo akapitu.");
    zaznacz(wynik.silnik, "słowo");
    klik(przycisk(wynik.pasek, "Link"));
    const pole = screen.getByRole("textbox", { name: "Adres linku" });
    fireEvent.change(pole, { target: { value: adres } });
    klik(screen.getByRole("button", { name: "Wstaw link" }));
    return wynik;
  }

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "jav\nascript:alert(1)",
    "data:text/html,<b>x</b>",
    "DATA:text/html;base64,eA==",
    "vbscript:msgbox(1)",
    " VbScRiPt:x",
    "//example.org/obcy-host",
    "/\\example.org",
    "ftp://example.org/plik",
    "example.org",
    "",
  ])("adres %j: odmowa ze zdaniem, link nie powstaje", async (adres) => {
    const { obszar, onZmiana } = await zOknemLinku(adres);
    expect(screen.getByRole("alert")).toHaveTextContent("Ten adres nie może być linkiem.");
    expect(screen.getByRole("textbox", { name: "Adres linku" })).toHaveAttribute("aria-invalid", "true");
    expect(obszar.querySelector("a")).toBeNull();
    expect(onZmiana).not.toHaveBeenCalled();
  });

  it.each(["https://example.org/a?b=1", "http://example.org/", "mailto:kontakt@example.org", "/panel/kursy", "HTTPS://example.org/"])(
    "adres %j: link powstaje i trafia do tekstu wysyłanego",
    async (adres) => {
      const { obszar, onZmiana } = await zOknemLinku(adres);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(obszar.querySelector("a")?.getAttribute("href")).toBe(adres);
      expect(obszar.querySelector("a")?.textContent).toBe("słowo");
      expect(ostatni(onZmiana)).toBe(`Pierwsze [słowo](${adres}) akapitu.`);
      expect(screen.queryByRole("textbox", { name: "Adres linku" })).toBeNull();
    },
  );

  it("istniejący link: okno pokazuje adres, pozwala go zmienić i usunąć", async () => {
    const { silnik, pasek, obszar, onZmiana } = await otworzEdytor("Zobacz [stronę](https://example.org/stara) teraz.");
    zaznacz(silnik, "stronę");
    klik(przycisk(pasek, "Link"));
    const pole = screen.getByRole("textbox", { name: "Adres linku" });
    expect(pole).toHaveValue("https://example.org/stara");
    fireEvent.change(pole, { target: { value: "/panel/nowa" } });
    klik(screen.getByRole("button", { name: "Zmień link" }));
    expect(ostatni(onZmiana)).toBe("Zobacz [stronę](/panel/nowa) teraz.");

    act(() => {
      silnik.edytor.commands.setTextSelection(10);
    });
    klik(przycisk(pasek, "Link"));
    klik(screen.getByRole("button", { name: "Usuń link" }));
    expect(obszar.querySelector("a")).toBeNull();
    expect(ostatni(onZmiana)).toBe("Zobacz stronę teraz.");
  });

  it("Enter w polu adresu zakłada link, Escape zamyka okno bez zmiany", async () => {
    const { silnik, pasek, obszar, onZmiana } = await otworzEdytor("Pierwsze słowo akapitu.");
    zaznacz(silnik, "słowo");
    klik(przycisk(pasek, "Link"));
    expect(przycisk(pasek, "Link")).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Adres linku" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Adres linku" })).toBeNull();
    expect(onZmiana).not.toHaveBeenCalled();

    klik(przycisk(pasek, "Link"));
    const pole = screen.getByRole("textbox", { name: "Adres linku" });
    fireEvent.change(pole, { target: { value: "/a" } });
    act(() => {
      fireEvent.keyDown(pole, { key: "Enter" });
    });
    expect(obszar.querySelector("a")?.getAttribute("href")).toBe("/a");
  });
});

describe("EdytorTresci: licznik znaków", () => {
  it.each([
    ["", "0 z 20 000 znaków"],
    ["**ważne**", "9 z 20 000 znaków"],
    ["🙂ż𝄞", "3 z 20 000 znaków"],
    ["a".repeat(1240), "1 240 z 20 000 znaków"],
    ["ż".repeat(20000), "20 000 z 20 000 znaków"],
  ])("liczy tekst wysyłany, nie widoczny: %#", async (tekst, opis) => {
    await otworzEdytor(tekst);
    expect(screen.getByText(opis)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([...KORPUS, ...KORPUS_SPOZA])("$nazwa: licznik równy długości tekstu wysyłanego", async ({ tekst }) => {
    await otworzEdytor(tekst);
    const liczba = String(liczZnaki(tekst)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    expect(screen.getByText(`${liczba} z 20 000 znaków`)).toBeInTheDocument();
  });

  it("po edycji licznik idzie za tekstem wysyłanym (ze znakami zapisu)", async () => {
    const { silnik, pasek, onZmiana } = await otworzEdytor("Pierwsze słowo akapitu.");
    zaznacz(silnik, "słowo");
    klik(przycisk(pasek, "Pogrubienie"));
    const wysylany = ostatni(onZmiana);
    expect(wysylany).toBe("Pierwsze **słowo** akapitu.");
    expect(screen.getByText(`${liczZnaki(wysylany)} z 20 000 znaków`)).toBeInTheDocument();
  });

  it("ponad limit: stan błędu ze zdaniem, treść nieucięta", async () => {
    const tekst = "ż".repeat(20010);
    const { obszar, onZmiana } = await otworzEdytor(tekst);
    expect(screen.getByRole("alert")).toHaveTextContent("Przekroczono limit o 10 znaków (limit: 20 000). Skróć treść, żeby ją zapisać.");
    expect(screen.getByText("20 010 z 20 000 znaków")).toBeInTheDocument();
    expect(obszar).toHaveAttribute("aria-invalid", "true");
    expect(obszar.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    expect(obszar.textContent).toHaveLength(20010);
    expect(onZmiana).not.toHaveBeenCalled();
  });
});

describe("EdytorTresci: pasek", () => {
  it("ma rolę paska narzędzi, nazwę i komplet kontrolek z nazwami i podpowiedziami", async () => {
    const { pasek, obszar } = await otworzEdytor(TRESC_PRZYKLADOWA);
    expect(pasek).toHaveAttribute("aria-controls", obszar.id);
    expect(within(pasek).getByRole("combobox", { name: "Styl tekstu" })).toBeInTheDocument();
    for (const nazwa of ["Pogrubienie", "Kursywa", "Lista punktowana", "Lista numerowana", "Link", "Cofnij", "Ponów"]) {
      expect(przycisk(pasek, nazwa)).toHaveAttribute("title", nazwa);
    }
  });

  it("przełączniki niosą `aria-pressed` zgodne z zaznaczeniem", async () => {
    const { pasek, silnik } = await otworzEdytor(TRESC_PRZYKLADOWA);
    for (const nazwa of ["Pogrubienie", "Kursywa", "Lista punktowana", "Lista numerowana"]) {
      expect(przycisk(pasek, nazwa)).toHaveAttribute("aria-pressed", "false");
    }
    zaznacz(silnik, "Zacznij od przedstawienia");
    expect(przycisk(pasek, "Pogrubienie")).toHaveAttribute("aria-pressed", "true");
    expect(przycisk(pasek, "Kursywa")).toHaveAttribute("aria-pressed", "false");
    zaznacz(silnik, "ile czasu");
    expect(przycisk(pasek, "Kursywa")).toHaveAttribute("aria-pressed", "true");
    zaznacz(silnik, "kim jesteś");
    expect(przycisk(pasek, "Lista punktowana")).toHaveAttribute("aria-pressed", "true");
    zaznacz(silnik, "Przywitaj");
    expect(przycisk(pasek, "Lista numerowana")).toHaveAttribute("aria-pressed", "true");
    expect(przycisk(pasek, "Lista punktowana")).toHaveAttribute("aria-pressed", "false");
  });

  it("lista stylu pokazuje styl bloku pod kursorem i go zmienia", async () => {
    const { pasek, silnik, onZmiana } = await otworzEdytor(TRESC_PRZYKLADOWA);
    const styl = within(pasek).getByRole("combobox", { name: "Styl tekstu" });
    zaznacz(silnik, "Jak zacząć");
    expect(styl).toHaveTextContent("Nagłówek");
    zaznacz(silnik, "Na początek");
    expect(styl).toHaveTextContent("Mniejszy nagłówek");
    zaznacz(silnik, "Pierwsze minuty");
    expect(styl).toHaveTextContent("Zwykły tekst");

    klik(styl);
    expect(within(pasek).getAllByRole("option").map((o) => o.textContent)).toEqual(["Zwykły tekst", "Nagłówek", "Mniejszy nagłówek"]);
    klik(within(pasek).getByRole("option", { name: "Mniejszy nagłówek" }));
    expect(ostatni(onZmiana)).toContain("\n\n### Pierwsze minuty decydują");
  });

  it("pogrubienie, kursywa i listy zmieniają tekst wysyłany", async () => {
    const { pasek, silnik, onZmiana } = await otworzEdytor("Pierwsze słowo akapitu.\n\nDrugi akapit.");
    zaznacz(silnik, "słowo");
    klik(przycisk(pasek, "Kursywa"));
    expect(ostatni(onZmiana)).toBe("Pierwsze *słowo* akapitu.\n\nDrugi akapit.");
    zaznacz(silnik, "Drugi");
    klik(przycisk(pasek, "Lista punktowana"));
    expect(ostatni(onZmiana)).toBe("Pierwsze *słowo* akapitu.\n\n- Drugi akapit.");
    klik(przycisk(pasek, "Lista numerowana"));
    expect(ostatni(onZmiana)).toBe("Pierwsze *słowo* akapitu.\n\n1. Drugi akapit.");
  });

  it("cofnij i ponów są nieaktywne, dopóki nie ma czego cofać albo ponawiać", async () => {
    const { pasek, silnik, onZmiana } = await otworzEdytor("Pierwsze słowo akapitu.");
    expect(przycisk(pasek, "Cofnij")).toBeDisabled();
    expect(przycisk(pasek, "Ponów")).toBeDisabled();
    zaznacz(silnik, "słowo");
    klik(przycisk(pasek, "Pogrubienie"));
    expect(przycisk(pasek, "Cofnij")).toBeEnabled();
    klik(przycisk(pasek, "Cofnij"));
    expect(ostatni(onZmiana)).toBe("Pierwsze słowo akapitu.");
    expect(przycisk(pasek, "Ponów")).toBeEnabled();
    klik(przycisk(pasek, "Ponów"));
    expect(ostatni(onZmiana)).toBe("Pierwsze **słowo** akapitu.");
  });

  it("skróty klawiszowe w obszarze edycji: Ctrl+B, Ctrl+I, Ctrl+Z, Ctrl+Shift+Z", async () => {
    const { obszar, silnik, onZmiana } = await otworzEdytor("Pierwsze słowo akapitu.");
    const skrot = (key: string, shiftKey = false) =>
      act(() => {
        fireEvent.keyDown(obszar, { key, code: `Key${key.toUpperCase()}`, ctrlKey: true, shiftKey });
      });
    zaznacz(silnik, "słowo");
    skrot("b");
    expect(ostatni(onZmiana)).toBe("Pierwsze **słowo** akapitu.");
    skrot("z");
    expect(ostatni(onZmiana)).toBe("Pierwsze słowo akapitu.");
    skrot("z", true);
    expect(ostatni(onZmiana)).toBe("Pierwsze **słowo** akapitu.");
    skrot("z");
    skrot("i");
    expect(ostatni(onZmiana)).toBe("Pierwsze *słowo* akapitu.");
  });

  it("jeden przystanek Tab; strzałki, Home i End chodzą po kontrolkach, pomijając nieaktywne", async () => {
    const { pasek } = await otworzEdytor("Pierwsze słowo akapitu.");
    const przystanki = () => Array.from(pasek.querySelectorAll("button")).filter((b) => b.getAttribute("tabindex") === "0");
    expect(przystanki()).toHaveLength(1);
    const styl = within(pasek).getByRole("combobox", { name: "Styl tekstu" });
    expect(przystanki()[0]).toBe(styl);

    act(() => styl.focus());
    fireEvent.keyDown(styl, { key: "ArrowRight" });
    expect(document.activeElement).toBe(przycisk(pasek, "Pogrubienie"));
    expect(przystanki()).toEqual([przycisk(pasek, "Pogrubienie")]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    // Cofnij i Ponów są nieaktywne — ostatnią aktywną kontrolką jest Link.
    expect(document.activeElement).toBe(przycisk(pasek, "Link"));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(styl);
    fireEvent.keyDown(styl, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(przycisk(pasek, "Link"));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(styl);
    expect(przystanki()).toHaveLength(1);
  });

  it("pogrubiona kursywa nie zostaje na ekranie, skoro nie da się jej zapisać", async () => {
    const { pasek, silnik, obszar, onZmiana } = await otworzEdytor("Pierwsze słowo akapitu.");
    zaznacz(silnik, "słowo");
    klik(przycisk(pasek, "Pogrubienie"));
    klik(przycisk(pasek, "Kursywa"));
    expect(ostatni(onZmiana)).toBe("Pierwsze **słowo** akapitu.");
    expect(obszar.querySelector("em")).toBeNull();
    expect(przycisk(pasek, "Kursywa")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("EdytorTresci: Tab w liście jest klawiszem przejścia, nie edycji", () => {
  it.each([
    ["lista punktowana", "- pierwszy punkt\n- drugi punkt\n- trzeci punkt"],
    ["lista numerowana", "1. pierwszy punkt\n2. drugi punkt\n3. trzeci punkt"],
  ])("%s: Tab i Shift+Tab w pozycji listy nie zmieniają treści i zostają dla przeglądarki", async (_nazwa, tekst) => {
    const { obszar, silnik, onZmiana } = await otworzEdytor(tekst);
    zaznacz(silnik, "drugi");
    const przed = silnik.edytor.state.doc;
    for (const shiftKey of [true, false]) {
      let nieprzejety = false;
      act(() => {
        nieprzejety = fireEvent.keyDown(obszar, { key: "Tab", code: "Tab", shiftKey });
      });
      expect(nieprzejety, shiftKey ? "Shift+Tab" : "Tab").toBe(true);
    }
    expect(silnik.edytor.state.doc.eq(przed)).toBe(true);
    expect(onZmiana).not.toHaveBeenCalled();
    expect(within(obszar).getAllByRole("listitem")).toHaveLength(3);
  });

  it("Enter w pozycji listy nadal zakłada kolejną pozycję", async () => {
    const { obszar, silnik, onZmiana } = await otworzEdytor("- pierwszy punkt\n- drugi punkt");
    zaznacz(silnik, "drugi");
    act(() => {
      silnik.edytor.commands.setTextSelection(silnik.edytor.state.selection.to);
      fireEvent.keyDown(obszar, { key: "Enter", code: "Enter" });
    });
    expect(ostatni(onZmiana)).toBe("- pierwszy punkt\n- drugi\n- punkt");
  });
});
