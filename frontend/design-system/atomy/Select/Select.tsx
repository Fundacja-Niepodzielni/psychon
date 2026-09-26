import type { SelectHTMLAttributes } from "react";
import style from "./Select.module.css";

interface OpcjaSelect {
  wartosc: string;
  etykieta: string;
}

interface WlasciwosciSelect
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  opcje: OpcjaSelect[];
  niepoprawny?: boolean;
}

/**
 * Wybór `Select` (A5). Jedna implementacja, natywny `<select>` — klawiatura
 * i czytnik ekranu dostają zachowanie przeglądarki za darmo, styl dociąga
 * tylko wygląd do reszty pól (`Input`, `Textarea`), nie zastępuje go
 * własnym listboxem.
 */
export function Select({ opcje, niepoprawny = false, ...reszta }: WlasciwosciSelect) {
  return (
    <select
      aria-invalid={niepoprawny || undefined}
      className={style.pole}
      {...reszta}
    >
      {opcje.map((opcja) => (
        <option key={opcja.wartosc} value={opcja.wartosc}>
          {opcja.etykieta}
        </option>
      ))}
    </select>
  );
}
