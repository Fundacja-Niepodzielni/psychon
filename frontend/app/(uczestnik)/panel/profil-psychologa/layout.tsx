import RequireRole from "@/components/permissions/RequireRole";

/**
 * Profil psychologa (H15) jest wyłącznie dla Wolontariuszki (backend/routes/api/h15.php
 * wymaga roli `volunteer` — `role:volunteer`) — Studentka wchodząca ręcznie pod adres dostaje wspólny szablon
 * odmowy zamiast komunikatu technicznego serwera (karta B6-07, tekst z B7 w. 3).
 */
export default function ProfilPsychologaLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole
      allowedRoles={["volunteer"]}
      deniedMessage="Ta funkcja jest dostępna tylko dla wolontariuszek."
    >
      {children}
    </RequireRole>
  );
}
