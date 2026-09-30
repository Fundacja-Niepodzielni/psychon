import { StazKolejka } from "@/nowy-front/staz-kolejka/StazKolejka";

/**
 * Trasa `/nowy-front/admin/staz` — decyzje o dyżurach w dzienniku stażu
 * (H11, `AdminInternshipController`, `backend/routes/api/h11.php:34-40`).
 * Odczyt i zapis biegną z przeglądarki (`StazKolejka.tsx`), tak jak na
 * pozostałych ekranach administracji nowego frontu.
 */
export default function StronaDecyzjiODyzurach() {
  return <StazKolejka />;
}
