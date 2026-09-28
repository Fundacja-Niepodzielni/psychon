import { FormyStazu } from "@/nowy-front/formy-stazu/FormyStazu";

/**
 * Trasa `/nowy-front/admin/formy-stazu` — słownik form stażu (H11),
 * `AdminInternshipFormController` (`backend/routes/api/h11.php:42-44`).
 * Odczyt i zapis biegną z przeglądarki (`FormyStazu.tsx`) — powód opisany
 * tam i w `nowy-front/formy-stazu/dane.ts`.
 */
export default function StronaFormStazu() {
  return <FormyStazu />;
}
