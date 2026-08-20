import Card from "@/components/ui/Card";

/** Etykiety PL dla kluczy `reason.missing` z koperty 403 (kontrakt §1.1). */
const MISSING_LABELS: Record<string, string> = {
  lessons: "Lekcje do ukończenia",
  test: "Test do zaliczenia",
  courses: "Etapy szkoleniowe i testy",
  internship: "Godziny stażu",
  supervision: "Obecności na superwizjach",
  workshop: "Warsztat stacjonarny",
};

export interface ForbiddenProps {
  /** `error.message` z koperty błędu 403. */
  message?: string;
  /** `error.reason.missing` z koperty błędu 403 (jeśli jest). */
  missing?: string[];
}

/**
 * Ekran 403 — dostęp zablokowany (rola albo reguła domenowa, np. course_locked).
 * Użycie: złap ApiError o statusie 403 i wyrenderuj
 * <Forbidden message={err.message} missing={err.reason?.missing} />.
 */
export default function Forbidden({
  message = "Nie masz dostępu do tej sekcji.",
  missing,
}: ForbiddenProps) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card>
        <p className="text-caption font-bold uppercase tracking-wide text-subtle">
          Błąd 403
        </p>
        <h1 className="mt-1 text-h3 font-bold text-ink">Dostęp zablokowany</h1>
        <p className="mt-3 text-body text-muted">{message}</p>
        {missing && missing.length > 0 && (
          <>
            <p className="mt-4 text-small font-bold text-ink">
              Czego jeszcze brakuje:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-muted">
              {missing.map((key) => (
                <li key={key}>{MISSING_LABELS[key] ?? key}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
