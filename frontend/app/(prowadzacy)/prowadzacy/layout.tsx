import RequireRole from "@/components/permissions/RequireRole";
import { RamkaProwadzacego } from "@/app/(przelaczenie)/prowadzacy/RamkaProwadzacego";

/**
 * Układ starej grupy tras prowadzącego. Strażnik ról bez zmian; ramkę
 * wybiera `RamkaProwadzacego`: dotychczasowy `PanelShell` dla każdej
 * ścieżki poza stronami, które przy włączonej grupie przełączenia zamieniają
 * treść na ekran nowego frontu (te dostają nową ramkę z makiety).
 */
export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allowedRoles={["instructor"]}>
      <RamkaProwadzacego>{children}</RamkaProwadzacego>
    </RequireRole>
  );
}
