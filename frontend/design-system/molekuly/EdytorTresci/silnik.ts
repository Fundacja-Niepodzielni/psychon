/**
 * Silnik edycji treści lekcji — jedyny plik molekuły, który wciąga gotowy
 * silnik edytora. `EdytorTresci` ładuje go importem dynamicznym po stronie
 * klienta, więc kod silnika trafia tylko tam, gdzie molekuła jest użyta.
 */

import { Editor } from "@tiptap/core";
import { bezpiecznyAdres, parsujWtracenia } from "../TrescLekcji/parsujTresc";
import { rozszerzeniaEdytora } from "./rozszerzenia";
import { dokumentZTresci, przypnijWezly, zapiszDokument, type PamiecZrodla } from "./zapis";

export type StylTekstu = "akapit" | "naglowek" | "mniejszy-naglowek";

export type AkcjaPaska = "pogrubienie" | "kursywa" | "lista-punktowana" | "lista-numerowana" | "cofnij" | "ponow";

/** Stan paska wyliczony z dokumentu i zaznaczenia. */
export interface StanPaska {
  styl: StylTekstu;
  pogrubienie: boolean;
  kursywa: boolean;
  listaPunktowana: boolean;
  listaNumerowana: boolean;
  /** Adres linku pod kursorem albo `null`. */
  link: string | null;
  moznaCofnac: boolean;
  moznaPonowic: boolean;
}

export const STAN_POCZATKOWY: StanPaska = {
  styl: "akapit",
  pogrubienie: false,
  kursywa: false,
  listaPunktowana: false,
  listaNumerowana: false,
  link: null,
  moznaCofnac: false,
  moznaPonowic: false,
};

export interface Silnik {
  /** Sam edytor — dla prób; molekuła steruje nim wyłącznie przez metody niżej. */
  edytor: Editor;
  stan(): StanPaska;
  /** Zgłasza każdą zmianę stanu paska; zwraca funkcję wypisującą. */
  subskrybuj(sluchacz: () => void): () => void;
  wykonaj(akcja: AkcjaPaska): void;
  ustawStyl(styl: StylTekstu): void;
  /** Zakłada albo zmienia link; `false`, gdy adres nie jest dozwolony. */
  ustawLink(adres: string): boolean;
  usunLink(): void;
  /** Podmienia całą treść (zmiana z zewnątrz); nie zgłasza `onZmiana`. */
  ustawTresc(tresc: string): void;
  /** Podmienia atrybuty obszaru edycji (np. stan błędu i jego opis). */
  ustawAtrybuty(atrybuty: Record<string, string>): void;
  fokus(): void;
  zniszcz(): void;
}

interface OpcjeSilnika {
  element: HTMLElement;
  wartosc: string;
  onZmiana: (tekst: string) => void;
  /** Atrybuty obszaru edycji (nazwa dla czytnika, powiązania opisów). */
  atrybuty: Record<string, string>;
}

/**
 * Adres, z którego powstanie link, albo `null`. Poza listą dozwolonych
 * schematów sprawdzamy też, czy parser treści odczyta zapis `[tekst](adres)`
 * z powrotem jako ten sam link — adres, którego nie da się zapisać, nie
 * tworzy linku zamiast zniknąć przy zapisie.
 */
export function adresLinku(surowy: string): string | null {
  const sprawdzony = bezpiecznyAdres(surowy);
  if (sprawdzony === null) {
    return null;
  }
  const odczyt = parsujWtracenia(`[x](${sprawdzony.adres})`);
  if (odczyt.length !== 1 || odczyt[0].rodzaj !== "link" || odczyt[0].adres !== sprawdzony.adres) {
    return null;
  }
  return sprawdzony.adres;
}

export function utworzSilnik({ element, wartosc, onZmiana, atrybuty }: OpcjeSilnika): Silnik {
  let otwarcie = dokumentZTresci(wartosc);
  let pamiec: PamiecZrodla = otwarcie.pamiec;
  const sluchacze = new Set<() => void>();

  const edytor = new Editor({
    element,
    extensions: rozszerzeniaEdytora(),
    content: otwarcie.json,
    // Arkusz silnika wchodzi z modułu stylów molekuły, nie wstrzykniętym znacznikiem.
    injectCSS: false,
    editorProps: { attributes: atrybuty },
    onUpdate: ({ editor }) => {
      onZmiana(zapiszDokument(editor.state.doc, pamiec));
    },
    onTransaction: () => {
      sluchacze.forEach((sluchacz) => sluchacz());
    },
  });
  przypnijWezly(pamiec, edytor.state.doc);

  let ostatniStan: StanPaska = STAN_POCZATKOWY;
  const policzStan = (): StanPaska => {
    const surowyAdres: unknown = edytor.getAttributes("link").href;
    const stan: StanPaska = {
      styl: edytor.isActive("heading", { level: 2 })
        ? "naglowek"
        : edytor.isActive("heading", { level: 3 })
          ? "mniejszy-naglowek"
          : "akapit",
      pogrubienie: edytor.isActive("bold"),
      kursywa: edytor.isActive("italic"),
      listaPunktowana: edytor.isActive("bulletList"),
      listaNumerowana: edytor.isActive("orderedList"),
      link: edytor.isActive("link") && typeof surowyAdres === "string" ? surowyAdres : null,
      moznaCofnac: edytor.can().undo(),
      moznaPonowic: edytor.can().redo(),
    };
    // Ten sam obiekt przy tym samym stanie: pasek nie rysuje się od nowa bez potrzeby.
    const klucze = Object.keys(stan) as (keyof StanPaska)[];
    if (klucze.every((klucz) => stan[klucz] === ostatniStan[klucz])) {
      return ostatniStan;
    }
    ostatniStan = stan;
    return stan;
  };

  const naAkapit = () => {
    if (edytor.isActive("heading")) {
      edytor.chain().setParagraph().run();
    }
  };

  return {
    edytor,
    stan: policzStan,
    subskrybuj(sluchacz) {
      sluchacze.add(sluchacz);
      return () => {
        sluchacze.delete(sluchacz);
      };
    },
    wykonaj(akcja) {
      switch (akcja) {
        case "pogrubienie":
          edytor.chain().toggleBold().run();
          break;
        case "kursywa":
          edytor.chain().toggleItalic().run();
          break;
        case "lista-punktowana":
          naAkapit();
          edytor.chain().toggleBulletList().run();
          break;
        case "lista-numerowana":
          naAkapit();
          edytor.chain().toggleOrderedList().run();
          break;
        case "cofnij":
          edytor.chain().undo().run();
          break;
        case "ponow":
          edytor.chain().redo().run();
          break;
      }
    },
    ustawStyl(styl) {
      if (styl === "akapit") {
        edytor.chain().focus().setParagraph().run();
        return;
      }
      // Nagłówek nie stoi w liście: najpierw wyjście z listy, potem zmiana stylu.
      const polecenia = edytor.chain().focus();
      if (edytor.isActive("bulletList") || edytor.isActive("orderedList")) {
        polecenia.clearNodes();
      }
      polecenia.setHeading({ level: styl === "naglowek" ? 2 : 3 }).run();
    },
    ustawLink(surowy) {
      const adres = adresLinku(surowy);
      if (adres === null) {
        return false;
      }
      const { empty } = edytor.state.selection;
      if (edytor.isActive("link")) {
        edytor.chain().focus().extendMarkRange("link").setMark("link", { href: adres }).run();
      } else if (empty) {
        edytor
          .chain()
          .focus()
          .insertContent({ type: "text", text: adres, marks: [{ type: "link", attrs: { href: adres } }] })
          .run();
      } else {
        edytor.chain().focus().setMark("link", { href: adres }).run();
      }
      return true;
    },
    usunLink() {
      edytor.chain().focus().extendMarkRange("link").unsetMark("link").run();
    },
    ustawTresc(tresc) {
      otwarcie = dokumentZTresci(tresc);
      pamiec = otwarcie.pamiec;
      edytor.commands.setContent(otwarcie.json, { emitUpdate: false });
      przypnijWezly(pamiec, edytor.state.doc);
    },
    ustawAtrybuty(atrybuty) {
      edytor.setOptions({ editorProps: { attributes: atrybuty } });
    },
    fokus() {
      edytor.commands.focus();
    },
    zniszcz() {
      sluchacze.clear();
      edytor.destroy();
    },
  };
}
