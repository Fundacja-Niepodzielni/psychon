import type { AnchorHTMLAttributes, ReactNode } from "react";
import style from "./Link.module.css";

interface WlasciwosciLink
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> {
  wariant?: "tresc" | "okruszek" | "tlo-odwrocone";
  children: ReactNode;
}

/**
 * Odnośnik `Link` (A2). Nigdy WŁASNEGO tła ani ramki — inaczej to `Button`.
 * Wariant `tlo-odwrocone` nie nadaje odnośnikowi tła: zmienia tylko barwę
 * tekstu na `--invert-link`, dla miejsc, gdzie odnośnik siedzi na już
 * odwróconym tle otoczenia (zakładka wybrana, powiadomienie — `--invert-bg`),
 * żeby był czytelny na nim. Pole klikalne rozszerzone ujemnym marginesem do
 * co najmniej 44 px w pionie.
 */
export function Link({ wariant = "tresc", children, ...reszta }: WlasciwosciLink) {
  const klasy = `${style.odnosnik} ${wariant === "okruszek" ? style.okruszek : ""} ${wariant === "tlo-odwrocone" ? style.tloOdwrocone : ""}`.trim();
  return (
    <a className={klasy} {...reszta}>
      {children}
    </a>
  );
}
