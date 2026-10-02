import { act, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

/**
 * Pomoc prób strony lekcji: dostęp do edytora treści tak, jak ma go osoba —
 * przez obszar edycji o nazwie „Treść lekcji”. Silnik edycji zapisuje siebie na
 * elemencie obszaru, więc próby strony działają na prawdziwej molekule.
 */

/** jsdom nie liczy układu; silnik pyta o prostokąty przy przewijaniu do kursora. */
export function przygotujUkladDlaEdytora(): void {
  const prostokat = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => prostokat as DOMRect;
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  document.elementFromPoint = () => null;
}

export async function edytorTresci(): Promise<{ obszar: HTMLElement; edytor: Editor }> {
  const obszar = await screen.findByRole("textbox", { name: "Treść lekcji" });
  const edytor = (obszar as HTMLElement & { editor?: Editor }).editor;
  if (edytor === undefined) {
    throw new Error("Obszar edycji nie ma silnika.");
  }
  return { obszar, edytor };
}

/** Zastępuje całą treść jednym akapitem — jak zaznaczenie wszystkiego i wpisanie tekstu. */
export async function wpiszTresc(tekst: string): Promise<void> {
  const { edytor } = await edytorTresci();
  const akapit = tekst === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text: tekst }] };
  act(() => {
    edytor.commands.setContent({ type: "doc", content: [akapit] }, { emitUpdate: true });
  });
}

/** Pozycja początku pierwszego tekstu w bloku o podanym numerze. */
function poczatekBloku(edytor: Editor, numer: number): number {
  let pozycja = -1;
  edytor.state.doc.forEach((blok, przesuniecie, indeks) => {
    if (indeks !== numer) {
      return;
    }
    blok.descendants((wezel, gdzie) => {
      if (pozycja === -1 && wezel.isText) {
        pozycja = przesuniecie + 1 + gdzie;
      }
      return pozycja === -1;
    });
  });
  if (pozycja === -1) {
    throw new Error(`Blok ${numer} nie ma tekstu.`);
  }
  return pozycja;
}

/** Dopisuje tekst na początku bloku o podanym numerze — jedna zmiana w jednym miejscu treści. */
export async function dopiszWBloku(numer: number, tekst = "X"): Promise<void> {
  const { edytor } = await edytorTresci();
  act(() => {
    edytor.commands.insertContentAt(poczatekBloku(edytor, numer), tekst);
  });
}

/** Usuwa z początku bloku tyle znaków, ile dopisało `dopiszWBloku`. */
export async function usunZPoczatkuBloku(numer: number, ile = 1): Promise<void> {
  const { edytor } = await edytorTresci();
  act(() => {
    const od = poczatekBloku(edytor, numer);
    edytor.commands.deleteRange({ from: od, to: od + ile });
  });
}
