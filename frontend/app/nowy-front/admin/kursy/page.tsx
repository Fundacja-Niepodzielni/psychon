import { KursyAdministracji } from "@/nowy-front/kursy-administracji/KursyAdministracji";

/**
 * Trasa `/nowy-front/admin/kursy` (ekran „Kursy”) — lista kursów administracji
 * i kolejność ścieżki (H08). Odczyt i zapis biegną z przeglądarki, z tokenem
 * sesji (`KursyAdministracji.tsx`). Ten sam ekran stoi też pod adresem
 * `/admin/kursy` (`app/(administracja)/admin/kursy/page.tsx`, grupa
 * przełączenia `kursyAdministracji`); trasa poligonu zostaje obok.
 */
export default function StronaKursowAdministracji() {
  return <KursyAdministracji />;
}
