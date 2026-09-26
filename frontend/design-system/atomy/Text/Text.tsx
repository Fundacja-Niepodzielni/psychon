import type { ReactNode } from "react";
import style from "./Text.module.css";

type WariantText = "domyslny" | "lekcja" | "pusty";

interface WlasciwosciText {
  wariant?: WariantText;
  children: ReactNode;
}

const klasaWariantu: Record<WariantText, string> = {
  domyslny: "",
  lekcja: style.lekcja,
  pusty: style.pusty,
};

/**
 * Akapit `Text` (A19). Zero zdań bez danej — pusty akapit nie przechodzi.
 * Szerokość ograniczona do 68 znaków (lekcja) albo 46 (stan pusty).
 */
export function Text({ wariant = "domyslny", children }: WlasciwosciText) {
  if (typeof children === "string" && children.trim() === "") {
    throw new Error("Text: akapit bez treści nie jest dozwolony");
  }
  return (
    <p className={`${style.tekst} ${klasaWariantu[wariant]}`.trim()}>
      {children}
    </p>
  );
}
