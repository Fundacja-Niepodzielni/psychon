import type { ReactNode } from "react";
import style from "./publiczne.module.css";

/**
 * Biała karta na treść ekranu publicznego (promień, obramowanie i cień z
 * tokenów). `ciepla` — jedyny wyróżniony blok ekranu.
 */
export function Karta({ children, ciepla = false }: { children: ReactNode; ciepla?: boolean }) {
  return <div className={`${style.karta} ${ciepla ? style.kartaCiepla : ""}`.trim()}>{children}</div>;
}
