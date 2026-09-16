/**
 * Lądowanie po roli — jedyny słownik ról w froncie (kontrakt §3.4). Wspólny
 * dla `/logowanie` (sesja już żywa) i `/aktywacja` (świeże powiązanie konta):
 * obie strony czytają tę samą rolę z `/me` albo z odpowiedzi `/sso/powiaz`
 * i mają wylądować w tym samym miejscu.
 */
export type Role = "super_admin" | "project_manager" | "instructor" | "volunteer" | "student";

export const HOME_BY_ROLE: Record<Role, string> = {
  volunteer: "/panel/start",
  student: "/panel/start",
  instructor: "/prowadzacy",
  project_manager: "/admin",
  super_admin: "/admin",
};

export function isRole(value: string | undefined): value is Role {
  return !!value && value in HOME_BY_ROLE;
}

/** Dom dla roli — rola spoza słownika (albo jej brak) ląduje na starcie panelu uczestnika. */
export function homeForRole(role: string | undefined): string {
  return isRole(role) ? HOME_BY_ROLE[role] : "/panel/start";
}
