import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { ZgloszeniaLista } from "@/nowy-front/zgloszenia-lista/ZgloszeniaLista";

/** Tytuł karty = nagłówek ekranu („Zgłoszenia rekrutacyjne”). */
export const metadata: Metadata = {
  title: "Zgłoszenia rekrutacyjne — Niepodzielni",
};

/**
 * Trasa produktu `/admin/nabor` — lista zgłoszeń rekrutacyjnych (A-03), nowa
 * trasa grupy przełączenia `nabor` (`lib/przelaczenie/grupy.ts`). Dotąd lista
 * była zakładką „Zgłoszenia” pod `/admin/uczestniczki` (`?zakladka=zgloszenia`);
 * ten adres przekierowuje tu (307), gdy grupa jest włączona. Ekran sam
 * (`frontend/nowy-front/zgloszenia-lista/`) stoi na szablonie listy; odmowę
 * roli pokazuje jego stan „brak uprawnień” (401/403 z zaplecza). Dopóki grupa
 * jest wyłączona, adres odpowiada jak na bazie (404).
 */
export default function StronaNaboru() {
  if (!czyNowaTrasaDostepna(GRUPY.nabor)) notFound();

  return <ZgloszeniaLista />;
}
