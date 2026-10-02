/**
 * Schemat edytora treści lekcji: wyłącznie konstrukcje podzbioru z kontraktu.
 * Akapit, nagłówek 2 i 3, pogrubienie, kursywa, kod w linii, twarde łamanie,
 * lista punktowana i numerowana (jeden poziom), link, cofnij/ponów. Schemat
 * nie zna podkreślenia, kolorów, wyrównania, obrazów, tabel, bloków kodu,
 * cytatów ani surowego HTML — wklejony obcy zapis traci wszystko poza tym.
 */

import { Extension, Mark, Node, mergeAttributes, type Extensions } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Code } from "@tiptap/extension-code";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { Italic } from "@tiptap/extension-italic";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import stylNaglowka from "../../atomy/Heading/Heading.module.css";
import stylTekstu from "../../atomy/Text/Text.module.css";
import stylTresci from "../TrescLekcji/TrescLekcji.module.css";
import { bezpiecznyAdres } from "../TrescLekcji/parsujTresc";
import stylEdytora from "./EdytorTresci.module.css";
import { jestUstepstwem, zapiszBlok } from "./zapis";

/**
 * Link. Adres przechodzi przez `bezpiecznyAdres` w każdym miejscu, w którym
 * może wejść do dokumentu albo z niego wyjść: przy wklejaniu (odnośnik
 * z niedozwolonym schematem zostaje samym tekstem) i przy rysowaniu.
 */
export const Odnosnik = Mark.create({
  name: "link",
  priority: 1000,
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element: HTMLElement) => bezpiecznyAdres(element.getAttribute("href") ?? "")?.adres ?? null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (element: HTMLElement) => (bezpiecznyAdres(element.getAttribute("href") ?? "") === null ? false : null),
      },
    ];
  },

  renderHTML({ mark }) {
    const surowy: unknown = mark.attrs.href;
    const sprawdzony = typeof surowy === "string" ? bezpiecznyAdres(surowy) : null;
    if (sprawdzony === null) {
      return ["span", {}, 0];
    }
    return [
      "a",
      {
        href: sprawdzony.adres,
        rel: sprawdzony.zewnetrzny ? "noopener noreferrer" : null,
        class: stylEdytora.odnosnik,
      },
      0,
    ];
  },
});

/**
 * Zwykły koniec wiersza w środku akapitu źródła. Uczestnik widzi w tym miejscu
 * odstęp, więc edytor też rysuje odstęp; w tekście wysyłanym wraca koniec
 * wiersza, dzięki czemu akapit pisany w kilku wierszach nie zmienia zapisu.
 */
export const MiekkieLamanie = Node.create({
  name: "miekkieLamanie",
  group: "inline",
  inline: true,
  selectable: false,

  parseHTML() {
    return [{ tag: "span[data-miekkie-lamanie]" }];
  },

  renderHTML() {
    return ["span", { "data-miekkie-lamanie": "" }, " "];
  },

  renderText() {
    return "\n";
  },
});

/** Numer bloku źródła: po nim blok nietknięty odnajduje swój dokładny zapis. */
const Zrodlo = Extension.create({
  name: "zrodlo",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "bulletList", "orderedList"],
        attributes: {
          idZrodla: { default: null, rendered: false, keepOnSplit: false, parseHTML: () => null },
        },
      },
    ];
  },
});

const kluczWyrazalnosci = new PluginKey("wyrazalnosc");

/**
 * Edytor nie pokazuje tego, czego nie da się zapisać. Gdy blok po zmianie
 * wymaga ustępstwa (np. pogrubiona kursywa, której podzbiór nie zna), to samo
 * ustępstwo jest od razu nanoszone na dokument — osoba widzi dokładnie to,
 * co zostanie wysłane, zamiast dowiedzieć się o różnicy u uczestnika.
 */
const Wyrazalnosc = Extension.create({
  name: "wyrazalnosc",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: kluczWyrazalnosci,
        appendTransaction(transakcje, stary, nowy) {
          if (!transakcje.some((transakcja) => transakcja.docChanged)) {
            return null;
          }
          const stare = new Set<unknown>();
          stary.doc.forEach((wezel) => stare.add(wezel));
          const transakcja = nowy.tr;
          let zmieniono = false;
          const { bold, italic, code, link } = nowy.schema.marks;
          nowy.doc.forEach((wezel, przesuniecie) => {
            if (stare.has(wezel)) {
              return;
            }
            const zapis = zapiszBlok(wezel);
            if (!zapis.sprawdzony || !jestUstepstwem(zapis.ustepstwo)) {
              return;
            }
            const u = zapis.ustepstwo;
            nowy.doc.nodesBetween(przesuniecie, przesuniecie + wezel.nodeSize, (dziecko, pozycja) => {
              if (!dziecko.isText) {
                return true;
              }
              const koniec = pozycja + dziecko.nodeSize;
              const ma = (nazwa: string) => dziecko.marks.some((znak) => znak.type.name === nazwa);
              if (u.kod && ma("code")) {
                transakcja.removeMark(pozycja, koniec, code);
                zmieniono = true;
              }
              if (u.link && ma("link")) {
                transakcja.removeMark(pozycja, koniec, link);
                zmieniono = true;
              }
              if (u.wyroznienia && (ma("bold") || ma("italic"))) {
                transakcja.removeMark(pozycja, koniec, bold).removeMark(pozycja, koniec, italic);
                zmieniono = true;
              } else if (u.kursywaWPogrubieniu && ma("bold") && ma("italic")) {
                transakcja.removeMark(pozycja, koniec, italic);
                zmieniono = true;
              }
              return false;
            });
          });
          return zmieniono ? transakcja : null;
        },
      }),
    ];
  },
});

/**
 * Nagłówek i pozycja listy to w podzbiorze jeden wiersz — twardego łamania
 * nie da się w nich zapisać, więc klawisz łamania nic tam nie robi.
 */
const BezLamaniaWJednymWierszu = Extension.create({
  name: "bezLamaniaWJednymWierszu",
  priority: 200,

  addKeyboardShortcuts() {
    const zablokuj = () => {
      const { $from } = this.editor.state.selection;
      if ($from.parent.type.name === "heading") {
        return true;
      }
      return $from.depth > 1 && $from.node($from.depth - 1).type.name === "listItem";
    };
    return { "Shift-Enter": zablokuj, "Mod-Enter": zablokuj };
  },
});

const klasaAkapitu = `${stylTekstu.tekst} ${stylTekstu.lekcja}`;

/** Rozszerzenia edytora; wygląd bloków to klasy tych samych arkuszy, co u uczestnika. */
export function rozszerzeniaEdytora(): Extensions {
  return [
    Document,
    Paragraph.configure({ HTMLAttributes: { class: klasaAkapitu } }),
    Text,
    Heading.configure({ levels: [2, 3] }).extend({
      renderHTML({ node, HTMLAttributes }) {
        const stopien = node.attrs.level === 2 ? 2 : 3;
        const klasa = `${stylNaglowka.naglowek} ${stopien === 2 ? stylNaglowka.stopien2 : stylNaglowka.stopien3}`;
        return [`h${stopien}`, mergeAttributes(HTMLAttributes, { class: klasa }), 0];
      },
    }),
    Bold,
    Italic,
    // Kod w linii może stać w pogrubieniu, kursywie i linku — tak czyta go parser treści.
    Code.extend({ excludes: "" }).configure({ HTMLAttributes: { class: stylTresci.kod } }),
    HardBreak,
    MiekkieLamanie,
    BulletList.configure({ HTMLAttributes: { class: stylTresci.lista } }),
    // Lista numerowana zna wyłącznie numer początkowy (cyfry). Rodzaj numeracji
    // (litery, liczby rzymskie) i gotowe wklejanie list z samego tekstu są
    // wyłączone: pierwsze nie istnieje w podzbiorze, drugie potrafi zbudować
    // listę w liście z pominięciem schematu.
    OrderedList.extend({
      addAttributes() {
        return {
          start: {
            default: 1,
            parseHTML: (element: HTMLElement) => {
              const numer = Number.parseInt(element.getAttribute("start") ?? "", 10);
              return Number.isInteger(numer) && numer >= 0 ? numer : 1;
            },
          },
        };
      },
      addProseMirrorPlugins() {
        return [];
      },
    }).configure({ HTMLAttributes: { class: stylTresci.lista } }),
    // Pozycja listy to jeden akapit: lista w liście nie należy do podzbioru.
    ListItem.extend({ content: "paragraph" }),
    Odnosnik,
    UndoRedo,
    Zrodlo,
    Wyrazalnosc,
    BezLamaniaWJednymWierszu,
  ];
}
