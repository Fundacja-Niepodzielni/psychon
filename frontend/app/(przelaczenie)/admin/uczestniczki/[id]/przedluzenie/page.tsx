import { redirect } from "next/navigation";

/**
 * Trasa `/admin/uczestniczki/[id]/przedluzenie` — dawny adres osobnego ekranu
 * przedłużenia dostępu. Ekranu już nie ma: datę dostępu zmienia okno
 * „Zmień datę” w nagłówku karty osoby. Adres zostaje, żeby zapisane odnośniki
 * nie kończyły się stroną „nie znaleziono”: przekierowuje na kartę osoby
 * `/admin/uczestniczki/[id]`, a gdy segment `[id]` nie jest liczbą — na listę
 * osób. Strona niczego nie wczytuje i nie wysyła żadnego żądania.
 * Przekierowanie jest TYMCZASOWE (typ 307, domyślne `redirect`) — decyzja
 * przyjęta: zapisane odnośniki mają dalej działać, a na stałe (308) dopiero po
 * osobnej decyzji. Zmierzone: układ grupy `(przelaczenie)` strumieniuje
 * odpowiedź, więc pod tym adresem HTTP ma kod 200, a przekierowanie typu 307
 * niesie strumień strony (`NEXT_REDIRECT;replace;…;307`) i wykonuje je
 * przeglądarka; prawdziwy HTTP 307 zwraca dopiero strona pod segmentem nowego
 * frontu.
 */
export default async function PrzekierowanieNaKarteOsoby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(/^\d+$/.test(id) ? `/admin/uczestniczki/${id}` : "/admin/uczestniczki");
}
