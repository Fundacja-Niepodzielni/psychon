import type { UserRole } from "@/lib/api";

/** Etykiety ról po polsku (kontrakt §3.4). */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  project_manager: "Opiekun Projektu",
  instructor: "Psycholog prowadzący",
  volunteer: "Wolontariusz",
  student: "Student",
};

/** Etykiety typów dokumentów (kontrakt §3.4). */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  volunteer_agreement: "Porozumienie wolontariackie",
  internship_certificate: "Zaświadczenie o stażu",
};
