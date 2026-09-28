"use client";

import { useRef } from "react";
import { Button } from "../../atomy/Button/Button";
import style from "./RichTextEditor.module.css";

/** Siedem przycisków paska, w kolejności z 06-ATOMY-MOLEKULY-ORGANIZMY.md §3 M18. */
export type AkcjaRichTextEditor =
  | "naglowek"
  | "mniejszy-naglowek"
  | "pogrubienie"
  | "kursywa"
  | "lista-punktowana"
  | "lista-numerowana"
  | "link";

const ETYKIETY_PRZYCISKOW: { akcja: AkcjaRichTextEditor; etykieta: string }[] = [
  { akcja: "naglowek", etykieta: "Nagłówek" },
  { akcja: "mniejszy-naglowek", etykieta: "Mniejszy nagłówek" },
  { akcja: "pogrubienie", etykieta: "Pogrubienie" },
  { akcja: "kursywa", etykieta: "Kursywa" },
  { akcja: "lista-punktowana", etykieta: "• Lista" },
  { akcja: "lista-numerowana", etykieta: "1. Lista" },
  { akcja: "link", etykieta: "Link" },
];

interface WlasciwosciRichTextEditor {
  etykieta: string;
  wartoscHtml: string;
  onZmiana: (html: string) => void;
  onAkcja: (akcja: AkcjaRichTextEditor) => void;
}

/**
 * Edytor treści `RichTextEditor` (M18). Pasek 7 przycisków + 2 rozdzielacze
 * + obszar edytowalny. Przyciski mają nazwy PO POLSKU (04-SLOWNIK §7) — nie
 * ikony: `Icon` (A12) ma zamkniętą mapę 13 glifów bez pogrubienia, kursywy,
 * list ani linku, więc dorabianie tych glifów byłoby cichym rozszerzeniem
 * atomu; zamiast tego pasek używa wyłącznie tekstowych `Button quiet`, tak
 * jak dopuszcza wiersz odbioru M18.
 *
 * Formatowanie jest DECYZJĄ RODZICA (`onAkcja`) — ta molekuła zostaje
 * prezentacyjna: składa atomy i zgłasza zamiar, nie wykonuje `execCommand`
 * ani innej logiki edycji, której warstwa molekuł (06 §0) nie przewiduje.
 */
export function RichTextEditor({ etykieta, wartoscHtml, onZmiana, onAkcja }: WlasciwosciRichTextEditor) {
  const obszarRef = useRef<HTMLDivElement>(null);

  return (
    <div className={style.pojemnik}>
      <div className={style.pasek} role="toolbar" aria-label={`Formatowanie — ${etykieta}`}>
        {ETYKIETY_PRZYCISKOW.map(({ akcja, etykieta: etykietaPrzycisku }, indeks) => (
          <span key={akcja} className={style.grupa}>
            {(indeks === 2 || indeks === 4) && <span aria-hidden="true" className={style.rozdzielacz} />}
            <Button poziom="quiet" rozmiar="sm" onClick={() => onAkcja(akcja)}>
              {etykietaPrzycisku}
            </Button>
          </span>
        ))}
      </div>
      <div
        ref={obszarRef}
        className={style.obszar}
        role="textbox"
        aria-multiline="true"
        aria-label={etykieta}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onZmiana(obszarRef.current?.innerHTML ?? "")}
        dangerouslySetInnerHTML={{ __html: wartoscHtml }}
      />
    </div>
  );
}
