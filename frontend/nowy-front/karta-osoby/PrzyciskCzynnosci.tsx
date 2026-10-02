"use client";

import type { ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import style from "./KartaOsoby.module.css";

/** Zdanie pod przyciskiem, który czeka na zakończenie zapisu — to samo w każdej czynności. */
export const POWOD_TRWA_ZAPIS = "Trwa zapisywanie.";

interface WlasciwosciPrzyciskuCzynnosci {
  /** `id` zdania z powodem; przycisk wskazuje je przez `aria-describedby`. */
  idPowodu: string;
  /** Dlaczego przycisk jest nieaktywny. `null` — przycisk działa i zdania nie ma. */
  powodBraku: string | null;
  niebezpieczny?: boolean;
  onKliknij: () => void;
  children: ReactNode;
}

/**
 * Przycisk czynności administracji z obrysem. Nieaktywny przycisk zawsze mówi,
 * dlaczego: zdanie stoi pod nim i jest jego opisem dostępnym (`aria-describedby`),
 * tak samo jak pod przyciskami innych ekranów. Gdy przycisk działa, zdania nie ma.
 */
export function PrzyciskCzynnosci({
  idPowodu,
  powodBraku,
  niebezpieczny = false,
  onKliknij,
  children,
}: WlasciwosciPrzyciskuCzynnosci) {
  return (
    <div className={style.przyciskCzynnosci}>
      <Button
        poziom="outline"
        niebezpieczny={niebezpieczny}
        disabled={powodBraku !== null}
        aria-describedby={powodBraku !== null ? idPowodu : undefined}
        onClick={onKliknij}
      >
        {children}
      </Button>
      {powodBraku !== null && <Hint id={idPowodu}>{powodBraku}</Hint>}
    </div>
  );
}
