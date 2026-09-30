import { EkranStartowy } from "@/nowy-front/ekran-startowy/EkranStartowy";

/**
 * Trasa `/nowy-front/admin/ekran-startowy` — redakcja treści ekranu „Zacznij
 * tutaj” (H21): `GET /onboarding` i `PATCH /admin/onboarding`
 * (`backend/routes/api/h21.php:25,27-28`). Odczyt i zapis biegną z
 * przeglądarki (`EkranStartowy.tsx`) — powód opisany w
 * `nowy-front/ekran-startowy/dane.ts`.
 */
export default function StronaEkranuStartowego() {
  return <EkranStartowy />;
}
