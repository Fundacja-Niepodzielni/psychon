import RequireRole from "@/components/permissions/RequireRole";

/**
 * Dziennik stażu (H11) jest wyłącznie dla Wolontariuszki (backend/routes/api/h11.php:25
 * wymaga roli `volunteer`) — Studentka wchodząca ręcznie pod adres dostaje wspólny szablon
 * odmowy zamiast komunikatu technicznego serwera (karta B6-07, tekst z B7 w. 3).
 */
export default function StazLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole
      allowedRoles={["volunteer"]}
      deniedMessage="Ta funkcja jest dostępna tylko dla wolontariuszek."
    >
      {children}
    </RequireRole>
  );
}
