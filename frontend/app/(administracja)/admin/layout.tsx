import RequireRole from "@/components/permissions/RequireRole";
import { RamkaAdministracji } from "@/app/(przelaczenie)/admin/RamkaAdministracji";

/**
 * Układ starej grupy tras administracji. Strażnik ról bez zmian; ramkę
 * wybiera `RamkaAdministracji`: dotychczasowy `PanelShell` dla każdej
 * ścieżki poza stronami, które przy włączonej grupie przełączenia
 * zamieniają treść na ekran nowego frontu (te dostają nową ramkę z makiety).
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allowedRoles={["project_manager", "super_admin"]}>
      <RamkaAdministracji>{children}</RamkaAdministracji>
    </RequireRole>
  );
}
