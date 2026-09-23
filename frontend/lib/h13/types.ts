import { api, apiPaged, type PaginationMeta } from "@/lib/api";

/**
 * Kształt wiersza `GET /admin/certificates` i odpowiedzi
 * `POST /admin/certificates/{certificate}/revoke` (H13, kontrakt §3.2 —
 * `AdminCertificateResource`, `backend/app/Http/Resources/AdminCertificateResource.php`).
 */
export type CertificateStatus = "valid" | "revoked";

export interface AdminCertificate {
  id: number;
  number: string;
  issued_at: string | null;
  status: CertificateStatus;
  edition: string | null;
  user: { id: number; first_name: string; last_name: string } | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  revoked_by: number | null;
}

/** Lista wydanych certyfikatów panelu administracji (`admin/certyfikaty`). */
export function fetchAdminCertificates(
  strona: number,
): Promise<{ data: AdminCertificate[]; meta?: PaginationMeta }> {
  return apiPaged<AdminCertificate>(`/admin/certificates?page=${strona}&per_page=25`);
}

/**
 * Unieważnienie certyfikatu z powodem — jedyna trasa w H13, która dotąd nie
 * miała odbiorcy w interfejsie („administracja
 * unieważnia certyfikat z powodem"; `backend/routes/api/h13.php:37`).
 * Rola sprawdzana middlewarem trasy (`role:project_manager,super_admin`) —
 * ten sam warunek, którym `RequireRole` osłania cały panel `/admin`.
 */
export function revokeCertificate(id: number, reason: string): Promise<AdminCertificate> {
  return api<AdminCertificate>(`/admin/certificates/${id}/revoke`, {
    method: "POST",
    body: { reason },
  });
}
