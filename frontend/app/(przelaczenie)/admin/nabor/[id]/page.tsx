import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { ZgloszenieDecyzja } from "@/nowy-front/zgloszenie-decyzja/ZgloszenieDecyzja";

/** Tytuł karty: nagłówek ekranu niesie imię i nazwisko kandydata, więc karta nazwę ekranu. */
export const metadata: Metadata = {
  title: "Zgłoszenie rekrutacyjne — Niepodzielni",
};

/**
 * Trasa produktu `/admin/nabor/[id]` — decyzja o zgłoszeniu rekrutacyjnym
 * (A-04), druga trasa grupy przełączenia `nabor`. W starym froncie szczegół
 * zgłoszenia był oknem na liście, bez własnego adresu. Odczyt i zapis biegną
 * z przeglądarki tokenem osoby (`ZgloszenieDecyzja.tsx`). Dopóki grupa jest
 * wyłączona, adres odpowiada jak na bazie (404).
 */
export default async function StronaZgloszenia({ params }: { params: Promise<{ id: string }> }) {
  if (!czyNowaTrasaDostepna(GRUPY.nabor)) notFound();

  const { id } = await params;
  return <ZgloszenieDecyzja id={id} />;
}
