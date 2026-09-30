import { ProfileKolejka } from "@/nowy-front/profile-kolejka/ProfileKolejka";

/**
 * Trasa `/nowy-front/admin/profile` — lista wniosków o profil psychologa
 * (H15, `AdminProfileController::index`, `backend/routes/api/h15.php:34`).
 * Odczyt biegnie z przeglądarki (`ProfileKolejka.tsx`). Ekran decyzji o
 * pojedynczym wniosku jest osobną trasą `profile/[id]`.
 */
export default function StronaWnioskowOProfil() {
  return <ProfileKolejka />;
}
