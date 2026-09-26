import type { AnchorHTMLAttributes, ReactNode } from "react";
import style from "./Link.module.css";

interface WlasciwosciLink
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> {
  wariant?: "tresc" | "okruszek";
  children: ReactNode;
}

/**
 * Odnośnik `Link` (A2). Nigdy tła ani ramki — inaczej to `Button`. Pole
 * klikalne rozszerzone ujemnym marginesem do co najmniej 44 px w pionie.
 */
export function Link({ wariant = "tresc", children, ...reszta }: WlasciwosciLink) {
  const klasy = `${style.odnosnik} ${wariant === "okruszek" ? style.okruszek : ""}`.trim();
  return (
    <a className={klasy} {...reszta}>
      {children}
    </a>
  );
}
