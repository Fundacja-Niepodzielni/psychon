import { api, ApiError } from "@/lib/api/klient";
import { createAdminUser, updateAdminUser, type UserRole } from "@/lib/api/h18";
import { ROLE_LABELS } from "@/lib/h18/labels";
import { KOMUNIKAT_ZAPIS } from "@/nowy-front/wspolne/komunikaty";

/**
 * Logika ekranu „Nowa osoba / zmiana roli” — bez JSX, z własnym testem.
 *
 * Trasy (kontrakt §2 „Panel — osoby”, `backend/routes/api/h18.php:27,30`):
 *  - `POST /admin/users` — konto + zaproszenie, 201 z kartą osoby;
 *  - `PATCH /admin/users/{id}` — zmiana roli istniejącego konta, 200 z kartą;
 *  - `GET /me` (`backend/routes/api/h01.php:27`) — wyłącznie do odczytu ról
 *    z tokenu (`ProfileResource::toArray`, klucz `roles`), żeby ukryć opcję
 *    Super Admin przed Opiekunem Projektu. O nadaniu roli i tak rozstrzyga
 *    serwer: `AdminUserController::assertMayAssignRole`
 *    (`backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:274`).
 */

/** Wycinek `GET /me` potrzebny temu ekranowi (`ProfileResource`). */
export interface ProfilRol {
  role: string;
  roles?: string[];
}

export interface Uprawnienia {
  /** Rola sekcji: `project_manager` albo `super_admin` (middleware `role:` trasy). */
  administracja: boolean;
  superAdmin: boolean;
}

export function uprawnieniaZProfilu(profil: ProfilRol): Uprawnienia {
  const role = profil.roles ?? [profil.role];
  const superAdmin = role.includes("super_admin");
  return { administracja: superAdmin || role.includes("project_manager"), superAdmin };
}

export async function pobierzUprawnienia(): Promise<Uprawnienia> {
  return uprawnieniaZProfilu(await api<ProfilRol>("/me"));
}

/** Kolejność opcji: role uczestników najpierw, administracja na końcu. */
const KOLEJNOSC_ROL: UserRole[] = ["volunteer", "student", "instructor", "project_manager", "super_admin"];

export interface OpcjaRoli {
  wartosc: string;
  etykieta: string;
}

/** Rola Super Admin tylko dla Super Admina (serwer i tak odrzuca — 403). */
export function opcjeRol(superAdmin: boolean): OpcjaRoli[] {
  return KOLEJNOSC_ROL.filter((rola) => superAdmin || rola !== "super_admin").map((rola) => ({
    wartosc: rola,
    etykieta: ROLE_LABELS[rola],
  }));
}

/** Zdanie o skutku nadania roli — pod polem „Rola”. */
export const SKUTEK_ROLI: Record<UserRole, string> = {
  volunteer: "Wolontariusz przechodzi pełny program: kursy, dyżury, superwizje i certyfikat.",
  student: "Student ma dostęp do kursów i materiałów.",
  instructor: "Psycholog prowadzący widzi przypisane kursy, pytania uczestników i swoją grupę w zakładce Moja grupa.",
  project_manager: "Opiekun Projektu pracuje w panelu administracji, poza kontami Super Adminów.",
  super_admin: "Super Admin ma pełny dostęp do administracji, także do kont Super Adminów.",
};

export function skutekRoli(rola: string): string | undefined {
  return rola in SKUTEK_ROLI ? SKUTEK_ROLI[rola as UserRole] : undefined;
}

export function etykietaRoli(rola: string): string {
  return rola in ROLE_LABELS ? ROLE_LABELS[rola as UserRole] : rola;
}

export interface FormularzOsoby {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

export const PUSTY_FORMULARZ: FormularzOsoby = { first_name: "", last_name: "", email: "", role: "" };

/** Ciało `POST /admin/users` — dokładnie pola z `StoreUserRequest`, bez pustych znaków na brzegach. */
export function cialoZalozenia(formularz: FormularzOsoby): {
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
} {
  return {
    first_name: formularz.first_name.trim(),
    last_name: formularz.last_name.trim(),
    email: formularz.email.trim(),
    role: formularz.role as UserRole,
  };
}

export interface WynikZalozenia {
  id: number;
  email: string;
}

export async function zalozKonto(formularz: FormularzOsoby): Promise<WynikZalozenia> {
  const karta = await createAdminUser(cialoZalozenia(formularz));
  return { id: karta.profile.id, email: karta.profile.email };
}

export async function zmienRole(idOsoby: number, rola: string): Promise<void> {
  await updateAdminUser(idOsoby, { role: rola });
}

export type BladZapisu =
  | { rodzaj: "walidacja"; pola: Record<string, string[]> }
  | { rodzaj: "duplikat"; komunikat: string; istniejacaOsoba: number | null }
  | { rodzaj: "zakazane"; komunikat: string }
  | { rodzaj: "brak-sesji" }
  | { rodzaj: "nie-znaleziono"; komunikat: string }
  | { rodzaj: "blad"; komunikat: string };

/**
 * Jedno miejsce, które zamienia wyjątek na stan ekranu (kontrakt §1.1):
 * 422 → pola, 409 `email_already_registered` → duplikat z `reason.existing_user_id`,
 * 403 → odmowa akcji, 401 → brak sesji, 404 → brak osoby, reszta (także sieć) → błąd.
 */
export function klasyfikujBlad(wyjatek: unknown): BladZapisu {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "blad", komunikat: KOMUNIKAT_ZAPIS };
  if (wyjatek.status === 422 && wyjatek.errors) return { rodzaj: "walidacja", pola: wyjatek.errors };
  if (wyjatek.status === 409 && wyjatek.code === "email_already_registered") {
    const id = wyjatek.reason?.existing_user_id;
    return {
      rodzaj: "duplikat",
      komunikat: wyjatek.message,
      istniejacaOsoba: typeof id === "number" ? id : null,
    };
  }
  if (wyjatek.status === 403) return { rodzaj: "zakazane", komunikat: wyjatek.message };
  if (wyjatek.status === 401) return { rodzaj: "brak-sesji" };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono", komunikat: wyjatek.message };
  return { rodzaj: "blad", komunikat: KOMUNIKAT_ZAPIS };
}

/** Pierwszy komunikat pola z odpowiedzi 422 (klucze jak w `StoreUserRequest`). */
export function bladPola(blad: BladZapisu | null, pole: keyof FormularzOsoby): string | undefined {
  if (blad?.rodzaj !== "walidacja") return undefined;
  return blad.pola[pole]?.[0];
}

/** Komunikaty 422 dotyczące pól, których ekran nie ma (np. telefon) — nie giną po cichu. */
export function bledyPozostale(blad: BladZapisu | null): string[] {
  if (blad?.rodzaj !== "walidacja") return [];
  const znane = new Set<string>(["first_name", "last_name", "email", "role"]);
  return Object.entries(blad.pola)
    .filter(([klucz]) => !znane.has(klucz))
    .flatMap(([, komunikaty]) => komunikaty.slice(0, 1));
}
