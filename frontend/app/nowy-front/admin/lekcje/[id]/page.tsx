import { LekcjaEdycja } from "@/nowy-front/lekcja-edycja/LekcjaEdycja";

/** Liczba całkowita z adresu albo `null` — ekran pokazuje wtedy stan „nie znaleziono”. */
function liczbaZAdresu(wartosc: string | string[] | undefined): number | null {
  return typeof wartosc === "string" && /^\d+$/.test(wartosc) ? Number(wartosc) : null;
}

/**
 * Trasa `/nowy-front/admin/lekcje/{id}?kurs={idKursu}` — ekran „Lekcja: treść,
 * nagranie, materiały” (administracja). Odczyt i zapis biegną z przeglądarki
 * (`nowy-front/lekcja-edycja/dane.ts`): token płynie przez `lib/api/klient.ts`,
 * strona nie woła `@/auth` po stronie serwera. Kurs w adresie jest potrzebny,
 * bo administracja czyta lekcje listą kursu (`GET /admin/courses/{course}/lessons`).
 */
export default async function StronaEdycjiLekcji({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [klucz: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const zapytanie = await searchParams;

  return <LekcjaEdycja idLekcji={liczbaZAdresu(id)} idKursu={liczbaZAdresu(zapytanie.kurs)} />;
}
