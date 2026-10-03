import OdmowaRoli from "@/components/permissions/OdmowaRoli";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Certyfikat (H13) jest wyłącznie dla Wolontariuszki (backend/routes/api/h13.php:25
 * wymaga roli `volunteer`) — Student wchodzący ręcznie pod adres dostaje wspólny ekran odmowy
 * nowej ramki (`EkranOdmowy`) zamiast treści ekranu: bez formularza i bez danych strony.
 */
export default function CertyfikatLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole
      allowedRoles={["volunteer"]}
      deniedScreen={<OdmowaRoli rolaDocelowa="wolontariuszy" />}
    >
      {children}
    </RequireRole>
  );
}
