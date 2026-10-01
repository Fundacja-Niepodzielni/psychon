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
 * Trasa produktu `/admin/kursy/{idKursu}/lekcje/{idLekcji}` — nowa trasa grupy
 * przełączenia `edycjaLekcji` (`lib/przelaczenie/grupy.ts`): ekran „Lekcja:
 * treść, nagranie, materiały”. Bez starej trasy — w starym froncie lekcję
 * edytowało się na stronie kursu. Kurs stoi w ścieżce, bo administracja czyta
 * lekcje listą kursu: lekcja spoza kursu z adresu nie jest na tej liście,
 * więc ekran pokazuje „Nie znaleziono lekcji” i nie pobiera jej danych.
 * Jedyny `main#tresc` i strażnika ról daje układ `admin/layout.tsx` tej grupy
 * tras. Dopóki grupa jest wyłączona, adres odpowiada 404.
 */
export default async function StronaLekcjiKursu({
  params,
}: {
  params: Promise<{ id: string; idLekcji: string }>;
}) {
  if (!czyNowaTrasaDostepna(GRUPY.edycjaLekcji)) notFound();

  const { id, idLekcji } = await params;

  return <LekcjaEdycja idLekcji={liczbaZAdresu(idLekcji)} idKursu={liczbaZAdresu(id)} zNazwaKursu />;
}
