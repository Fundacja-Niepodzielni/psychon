import type { ButtonHTMLAttributes, ReactNode } from "react";
import style from "./Button.module.css";

type PoziomButton = "primary" | "outline" | "quiet";

interface WlasciwosciButton
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  poziom: PoziomButton;
  rozmiar?: "domyslny" | "sm";
  niebezpieczny?: boolean;
  children: ReactNode;
}

/**
 * Przycisk `Button` (A1). Trzy poziomy: `primary` (jeden kolorowy na ekran),
 * `outline`, `quiet`. Nieaktywny wolno tylko `outline`/`lock` — `primary`
 * NIGDY nie jest wyszarzony, kliknięcie ma pokazywać braki, nie blokować się.
 */
export function Button({
  poziom,
  rozmiar = "domyslny",
  niebezpieczny = false,
  disabled,
  children,
  ...reszta
}: WlasciwosciButton) {
  // Primary ignoruje `disabled` — przycisk główny nigdy nie jest nieaktywny.
  const naprawdeNieaktywny = poziom === "primary" ? false : disabled;
  const klasy = [
    style.przycisk,
    style[poziom],
    rozmiar === "sm" ? style.mala : "",
    niebezpieczny ? style.niebezpieczny : "",
    naprawdeNieaktywny ? style.zablokowany : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={klasy} disabled={naprawdeNieaktywny} {...reszta}>
      {children}
    </button>
  );
}
