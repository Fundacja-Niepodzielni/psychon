import { GRUPY, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import { pasujeDoWzorca } from "@/lib/przelaczenie/ramka";

/**
 * Czy ekran pod tym adresem stoi w ramie panelu administracji, która pokazuje
 * pasek wysyłania nagrania. Prawda dla każdego ekranu administracji z
 * włączonej grupy przełączenia; każdy inny adres (dotychczasowy panel, inne
 * panele, strony publiczne) to ekran bez paska — przed wejściem na niego
 * w trakcie wysyłania osoba dostaje pytanie.
 */
export function czyAdresZPaskiemWysylania(adres: string, grupy: Record<string, DefinicjaGrupy> = GRUPY): boolean {
  if (!adres.startsWith("/") || adres.startsWith("//")) return false;
  return Object.values(grupy).some(
    (grupa) =>
      grupa.wlaczona &&
      grupa.ekrany.some((ekran) => ekran.panel === "administracja" && pasujeDoWzorca(adres, ekran.nowaTrasa)),
  );
}
