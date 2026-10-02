"use client";

import { BlokadaKonta } from "./BlokadaKonta";
import { PrzypisanieSuperwizora } from "./PrzypisanieSuperwizora";
import { ResetLimituPodejsc } from "./ResetLimituPodejsc";
import { ZmianaRoli } from "./ZmianaRoli";
import style from "./KartaOsoby.module.css";

interface WlasciwosciCzynnosciAdministracji {
  userId: number;
  imieNazwisko: string;
  rolaOsoby: string;
  onOdswiez: () => void;
}

/**
 * Czynności administracji na karcie osoby, które miała stara strona karty:
 * każda w osobnej sekcji z własnym potwierdzeniem i własnym zdaniem błędu.
 * Karta renderuje ten blok wyłącznie dla opiekuna projektu i administratora.
 */
export function CzynnosciAdministracji({ userId, imieNazwisko, rolaOsoby, onOdswiez }: WlasciwosciCzynnosciAdministracji) {
  return (
    <div className={style.czynnosci} data-obszar="czynnosci-administracji">
      <PrzypisanieSuperwizora userId={userId} />
      <ZmianaRoli userId={userId} rolaOsoby={rolaOsoby} onOdswiez={onOdswiez} />
      <ResetLimituPodejsc userId={userId} imieNazwisko={imieNazwisko} />
      <BlokadaKonta userId={userId} imieNazwisko={imieNazwisko} rolaOsoby={rolaOsoby} onOdswiez={onOdswiez} />
    </div>
  );
}
