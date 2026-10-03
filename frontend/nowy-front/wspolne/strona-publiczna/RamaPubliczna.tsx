import type { ReactNode } from "react";
import { StronaPubliczna } from "@/design-system/szablony/StronaPubliczna/StronaPubliczna";
import { odnosnikiStopkiPublicznej } from "./odnosniki";

interface WlasciwosciRamyPublicznej {
  /** Znak Fundacji — dostarcza strona podglądu (tak jak powłoki paneli). */
  logo?: ReactNode;
  szerokosc?: "waska" | "czytelna";
  /** Ekran deklaracji dostępności nie linkuje do siebie. */
  bezDeklaracji?: boolean;
  children: ReactNode;
}

/** Szablon strony publicznej ze stopką ekranów publicznych nowego frontu. */
export function RamaPubliczna({ logo, szerokosc, bezDeklaracji = false, children }: WlasciwosciRamyPublicznej) {
  return (
    <StronaPubliczna logo={logo} szerokosc={szerokosc} odnosnikiStopki={odnosnikiStopkiPublicznej(bezDeklaracji)}>
      {children}
    </StronaPubliczna>
  );
}
