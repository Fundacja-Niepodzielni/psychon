import Link from "next/link";
import Card from "@/components/ui/Card";

export interface Forbidden403Reason {
  required_roles?: string[];
  your_role?: string | null;
  [key: string]: unknown;
}

export interface Forbidden403Props {
  /** Treść pola `error.reason` z koperty błędu (kontrakt §1), jeśli dostępna. */
  reason?: Forbidden403Reason;
  /** Nadpisanie domyślnego komunikatu (np. `error.message` z API). */
  message?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  project_manager: "Opiekun Projektu",
  instructor: "Psycholog prowadzący",
  volunteer: "Wolontariusz",
  student: "Student",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * H02 · Wspólny ekran 403 (moduł M2) — dla ręcznego wejścia pod adres, do
 * którego zalogowana rola nie ma dostępu. Uprawnienia egzekwuje serwer przy
 * każdym żądaniu (docs/system/03-role-i-uprawnienia.md §1); ten ekran tylko
 * tłumaczy dlaczego, zamiast pokazywać pusty albo zepsuty panel.
 */
export default function Forbidden403({ reason, message }: Forbidden403Props) {
  const requiredRoles = reason?.required_roles;
  const yourRole = reason?.your_role;

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <Card className="w-full max-w-xl text-center">
        <p className="text-caption font-bold uppercase tracking-wide text-subtle">
          Błąd 403
        </p>
        <h1 className="mt-1 text-h3 font-bold text-ink">Brak dostępu</h1>
        <p className="mt-3 text-body text-muted">
          {message ?? "Nie masz uprawnień do tej sekcji."}
        </p>

        {(requiredRoles?.length || yourRole) && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-small">
            {yourRole && (
              <>
                <dt className="font-bold text-muted">Twoja rola:</dt>
                <dd className="text-ink">{roleLabel(yourRole)}</dd>
              </>
            )}
            {requiredRoles && requiredRoles.length > 0 && (
              <>
                <dt className="font-bold text-muted">Wymagana rola:</dt>
                <dd className="text-ink">
                  {requiredRoles.map(roleLabel).join(" lub ")}
                </dd>
              </>
            )}
          </dl>
        )}

        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-pill bg-primary px-6 py-2.5 text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
        >
          Wróć na stronę główną
        </Link>
      </Card>
    </div>
  );
}
