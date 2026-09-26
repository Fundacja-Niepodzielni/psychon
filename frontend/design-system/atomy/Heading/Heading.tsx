import type { ReactNode } from "react";
import style from "./Heading.module.css";

type Stopien = 1 | 2 | 3 | 4;

interface WlasciwosciHeading {
  stopien: Stopien;
  children: ReactNode;
  id?: string;
}

const klasaStopnia: Record<Stopien, string> = {
  1: style.stopien1,
  2: style.stopien2,
  3: style.stopien3,
  4: style.stopien4,
};

/**
 * Nagłówek `Heading` (A18). Stopień z ważności treści, nie z wyglądu.
 * Żaden nagłówek nie może być pusty — pusty nagłówek nie niesie informacji
 * (patrz 06-ATOMY-MOLEKULY-ORGANIZMY.md §2, A18).
 */
export function Heading({ stopien, children, id }: WlasciwosciHeading) {
  if (typeof children === "string" && children.trim() === "") {
    throw new Error("Heading: nagłówek bez treści nie jest dozwolony");
  }
  const Znacznik = `h${stopien}` as const;
  return (
    <Znacznik
      id={id}
      className={`${style.naglowek} ${klasaStopnia[stopien]}`}
      tabIndex={stopien === 2 ? -1 : undefined}
    >
      {children}
    </Znacznik>
  );
}
