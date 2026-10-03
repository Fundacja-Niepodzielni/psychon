import OdmowaRoli from "@/components/permissions/OdmowaRoli";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Dziennik stażu (H11) jest wyłącznie dla Wolontariuszki (backend/routes/api/h11.php:25
 * wymaga roli `volunteer`) — Student wchodzący ręcznie pod adres dostaje wspólny ekran odmowy
 * nowej ramki (`EkranOdmowy`) zamiast treści ekranu: bez formularza i bez danych strony.
 */
export default function StazLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole
      allowedRoles={["volunteer"]}
      deniedScreen={<OdmowaRoli rolaDocelowa="wolontariuszy" />}
    >
      {children}
    </RequireRole>
  );
}
