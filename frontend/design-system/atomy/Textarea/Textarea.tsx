import type { TextareaHTMLAttributes } from "react";
import style from "./Textarea.module.css";

interface WlasciwosciTextarea
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  niepoprawny?: boolean;
}

/**
 * Pole wielowierszowe `Textarea` (A4). ≤720px, wysokość początkowa ≥96px,
 * rozciąganie tylko w pionie.
 */
export function Textarea({ niepoprawny = false, ...reszta }: WlasciwosciTextarea) {
  return (
    <textarea
      aria-invalid={niepoprawny || undefined}
      className={style.pole}
      {...reszta}
    />
  );
}
