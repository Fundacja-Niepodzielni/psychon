import { czyTrybPodgladu } from "@/nowy-front/wspolne/tryb-podgladu/tryb-podgladu";

/**
 * Kto widzi ekrany uczestnika: osoba, której konto ma rolę uczestnika (`student` albo `volunteer`,
 * te same role, które po zalogowaniu lądują na starcie panelu uczestnika — `lib/home-by-role.ts`).
 * Osoba z kilkoma rolami widzi ekran, gdy jedna z nich jest rolą uczestnika. Personel i prowadzący
 * widzą ekran kursu, testu kursu i lekcji wyłącznie w trybie podglądu (parametr `podglad`
 * o wartości 1) — to ekrany, które ten tryb mają. Moduł jest czysty (bez odczytów i zapisów).
 */

/** Role uczestnika. */
export const ROLE_UCZESTNIKA = ["student", "volunteer"] as const;

/**
 * Adresy ekranów z trybem podglądu: kurs, test kursu i lekcja — na trasie produktu (`/panel/…`)
 * i na stronie podglądu nowego frontu (`/nowy-front/…`).
 */
const ADRESY_Z_TRYBEM_PODGLADU: readonly RegExp[] = [
  /^\/panel\/kursy\/[^/]+(?:\/test)?\/?$/,
  /^\/panel\/lekcje\/[^/]+\/?$/,
  /^\/nowy-front\/kurs-uczestnika\/[^/]+(?:\/test)?\/?$/,
  /^\/nowy-front\/lekcja\/[^/]+\/?$/,
];

/** Odpowiedź konta tak, jak ją oddaje `GET /me`: lista ról i rola główna. */
export interface KontoZRolami {
  role?: unknown;
  roles?: unknown;
}

/**
 * Role konta: rola główna `role` i każda rola z listy `roles` (bez powtórzeń, rola główna
 * pierwsza). Wartości inne niż tekst są pomijane.
 */
export function roleKonta(konto: KontoZRolami | null | undefined): string[] {
  if (konto === null || typeof konto !== "object") return [];
  const lista = Array.isArray(konto.roles) ? konto.roles : [];
  const wszystkie = [konto.role, ...lista].filter((rola): rola is string => typeof rola === "string");
  return [...new Set(wszystkie)];
}

/** Czy konto ma którąś z ról uczestnika. */
export function maRoleUczestnika(role: readonly string[]): boolean {
  return role.some((rola) => (ROLE_UCZESTNIKA as readonly string[]).includes(rola));
}

/** Czy pod tym adresem stoi ekran z trybem podglądu. */
export function czyAdresZTrybemPodgladu(sciezka: string): boolean {
  return ADRESY_Z_TRYBEM_PODGLADU.some((wzorzec) => wzorzec.test(sciezka));
}

/**
 * Czy osoba z tymi rolami widzi w trybie podglądu ekran pod tym adresem: adres ekranu z trybem
 * podglądu, parametr `podglad` o wartości 1 i rola personelu albo prowadzącego.
 */
export function czyPodgladPersonelu(role: readonly string[], sciezka: string, parametrPodgladu: string | null): boolean {
  return czyAdresZTrybemPodgladu(sciezka) && role.some((rola) => czyTrybPodgladu(parametrPodgladu, rola));
}
