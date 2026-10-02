import { redirect } from "next/navigation";

/**
 * Trasa `/admin/uczestniczki/[id]/przedluzenie` — dawny adres osobnego ekranu
 * przedłużenia dostępu. Ekranu już nie ma: datę dostępu zmienia okno
 * „Zmień datę” w nagłówku karty osoby. Adres zostaje, żeby zapisane odnośniki
 * nie kończyły się stroną „nie znaleziono”: przekierowuje na kartę osoby
 * `/admin/uczestniczki/[id]`, a gdy segment `[id]` nie jest liczbą — na listę
 * osób. Strona niczego nie wczytuje i nie wysyła żadnego żądania.
 */
export default async function PrzekierowanieNaKarteOsoby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(/^\d+$/.test(id) ? `/admin/uczestniczki/${id}` : "/admin/uczestniczki");
}
