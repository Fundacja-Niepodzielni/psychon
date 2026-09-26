import type { ReactNode } from "react";
import style from "./Badge.module.css";

type WariantBadge = "neutral" | "ok" | "warn" | "error" | "pending";

interface WlasciwosciBadge {
  wariant: WariantBadge;
  children: ReactNode;
}

// "ok" to ten sam wygląd co "neutral" — stan dobry nigdy nie dostaje barwy.
const klasaWariantu: Record<WariantBadge, string> = {
  neutral: style.neutral,
  ok: style.neutral,
  warn: style.warn,
  error: style.error,
  pending: style.pending,
};

/**
 * Plakietka `Badge` (A8). Jedna implementacja na cztery dawne nazwy klas
 * (chip, chip.ok, chip.info, chip.brand). Stan zawsze słowem, nie samą barwą
 * ani samą kropką.
 */
export function Badge({ wariant, children }: WlasciwosciBadge) {
  return (
    <span className={`${style.plakietka} ${klasaWariantu[wariant]}`}>
      {wariant === "pending" && <span className={style.kropka} aria-hidden="true" />}
      {children}
    </span>
  );
}
