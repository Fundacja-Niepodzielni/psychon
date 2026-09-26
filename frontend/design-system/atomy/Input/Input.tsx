import type { InputHTMLAttributes } from "react";
import style from "./Input.module.css";

type RodzajInput = "tekst" | "liczba" | "data";

interface WlasciwosciInput
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  rodzaj: RodzajInput;
  niepoprawny?: boolean;
}

const typHtml: Record<RodzajInput, string> = {
  tekst: "text",
  liczba: "number",
  data: "date",
};

/**
 * Pole `Input` (A3). Zero pól bez ograniczenia szerokości (KO-2): tekst
 * ≤480px, liczba ≤160px, data ≤180px.
 */
export function Input({ rodzaj, niepoprawny = false, ...reszta }: WlasciwosciInput) {
  return (
    <input
      type={typHtml[rodzaj]}
      aria-invalid={niepoprawny || undefined}
      className={`${style.pole} ${style[rodzaj]}`}
      {...reszta}
    />
  );
}
