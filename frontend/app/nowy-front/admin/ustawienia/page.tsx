import { UstawieniaEdycji } from "@/nowy-front/ustawienia-edycji/UstawieniaEdycji";

/**
 * Trasa `/nowy-front/admin/ustawienia` — ekran „Ustawienia roku programu”
 * (H19): `GET`/`PATCH /admin/edition` (`backend/routes/api/h19.php:27-28`).
 * Odczyt i zapis biegną z przeglądarki (`UstawieniaEdycji.tsx`) — powód
 * opisany w `nowy-front/ustawienia-edycji/dane.ts`.
 */
export default function StronaUstawieniaEdycji() {
  return <UstawieniaEdycji />;
}
