"use client";

import { PrzypisanieSuperwizora } from "./PrzypisanieSuperwizora";
import style from "./KartaOsoby.module.css";

interface WlasciwosciCzynnosciAdministracji {
  userId: number;
}

/**
 * Czynności administracji na karcie osoby, które miała stara strona karty:
 * każda w osobnej sekcji z własnym potwierdzeniem i własnym zdaniem błędu.
 * Karta renderuje ten blok wyłącznie dla opiekuna projektu i administratora.
 */
export function CzynnosciAdministracji({ userId }: WlasciwosciCzynnosciAdministracji) {
  return (
    <div className={style.czynnosci} data-obszar="czynnosci-administracji">
      <PrzypisanieSuperwizora userId={userId} />
    </div>
  );
}
