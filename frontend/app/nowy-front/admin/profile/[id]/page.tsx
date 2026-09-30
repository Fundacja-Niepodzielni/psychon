import { ProfilDecyzja } from "@/nowy-front/profil-decyzja/ProfilDecyzja";

/**
 * Trasa `/nowy-front/admin/profile/[id]` — decyzja o wniosku o profil psychologa
 * (`H15/AdminProfileController`, `backend/routes/api/h15.php:35-38`). Odczyt i zapis
 * biegną z przeglądarki tokenem osoby (`ProfilDecyzja.tsx`).
 */
export default async function StronaWniosku({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfilDecyzja id={id} />;
}
