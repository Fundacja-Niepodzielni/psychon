"use client";

import type { CurrentSupervisor } from "@/lib/api/przypisanie-prowadzacego";
import { BlokadaKonta } from "./BlokadaKonta";
import { PrzypisanieSuperwizora } from "./PrzypisanieSuperwizora";
import { ResetLimituPodejsc } from "./ResetLimituPodejsc";
import { RolaKonta } from "./RolaKonta";
import style from "./KartaOsoby.module.css";

interface WlasciwosciCzynnosciAdministracji {
  userId: number;
  imieNazwisko: string;
  rolaOsoby: string;
  /** Bieżący prowadzący z karty (`supervisor`) albo `null`. */
  prowadzacy?: CurrentSupervisor | null;
  onOdswiez: () => void;
}

/**
 * Czynności administracji na karcie osoby, które miała stara strona karty:
 * każda w osobnej sekcji z własnym potwierdzeniem i własnym zdaniem błędu.
 * Rola konta jest tu tylko do odczytu (`RolaKonta`) — zmienia się ją w Kontach
 * Niepodzielni; dawny komponent wyboru roli nie jest już dołączany.
 * Karta renderuje ten blok wyłącznie dla opiekuna projektu i administratora.
 */
export function CzynnosciAdministracji({ userId, imieNazwisko, rolaOsoby, prowadzacy = null, onOdswiez }: WlasciwosciCzynnosciAdministracji) {
  return (
    <div className={style.czynnosci} data-obszar="czynnosci-administracji">
      <PrzypisanieSuperwizora userId={userId} obecny={prowadzacy} />
      <RolaKonta rolaOsoby={rolaOsoby} />
      <ResetLimituPodejsc userId={userId} imieNazwisko={imieNazwisko} />
      <BlokadaKonta userId={userId} imieNazwisko={imieNazwisko} rolaOsoby={rolaOsoby} onOdswiez={onOdswiez} />
    </div>
  );
}
