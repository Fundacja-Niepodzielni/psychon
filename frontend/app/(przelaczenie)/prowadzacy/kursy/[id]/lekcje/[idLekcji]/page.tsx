import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { LekcjaEdycja } from "@/nowy-front/lekcja-edycja/LekcjaEdycja";

export const metadata: Metadata = {
  title: "Lekcja — Niepodzielni",
};

/** Liczba całkowita z adresu albo `null` — ekran pokazuje wtedy stan „nie znaleziono”. */
function liczbaZAdresu(wartosc: string): number | null {
  return /^\d+$/.test(wartosc) ? Number(wartosc) : null;
}

/**
 * Trasa produktu `/prowadzacy/kursy/{idKursu}/lekcje/{idLekcji}` — strona
 * lekcji w roli prowadzącego: ta sama strona co w administracji
 * (`nowy-front/lekcja-edycja/`), z trasami `/instructor/…`. Należy do grupy
 * przełączenia `kurs` (`lib/przelaczenie/grupy.ts`) razem z ekranem kursu:
 * dopóki grupa jest wyłączona, adres odpowiada 404. Lekcję czyta lista lekcji
 * kursu z adresu — lekcja spoza kursu daje „Nie znaleziono lekcji”. Jedyny
 * `main#tresc` i strażnika ról daje układ `prowadzacy/layout.tsx` tej grupy tras.
 */
export default async function StronaLekcjiKursuProwadzacego({
  params,
}: {
  params: Promise<{ id: string; idLekcji: string }>;
}) {
  if (!czyNowaTrasaDostepna(GRUPY.kurs)) notFound();

  const { id, idLekcji } = await params;

  return <LekcjaEdycja rola="instructor" idLekcji={liczbaZAdresu(idLekcji)} idKursu={liczbaZAdresu(id)} zNazwaKursu />;
}
