import { redirect } from "next/navigation";

/**
 * Trasa `/nowy-front/admin/uczestniczki/[id]/przedluzenie` — dawny adres
 * osobnego ekranu przedłużenia dostępu pod segmentem nowego frontu. Ekranu już
 * nie ma: datę dostępu zmienia okno „Zmień datę” w nagłówku karty osoby.
 * Adres przekierowuje na kartę osoby `/nowy-front/admin/uczestniczki/[id]`,
 * a gdy segment `[id]` nie jest liczbą — na listę osób.
 * Przekierowanie jest TYMCZASOWE (HTTP 307, domyślne `redirect`) — decyzja
 * przyjęta: zapisane odnośniki mają dalej działać, a na stałe (308) dopiero po
 * osobnej decyzji.
 */
export default async function PrzekierowanieNaKarteOsoby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(/^\d+$/.test(id) ? `/nowy-front/admin/uczestniczki/${id}` : "/nowy-front/admin/uczestniczki");
}
