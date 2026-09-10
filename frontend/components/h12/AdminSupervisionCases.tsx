"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  ApiError,
  fetchAdminSupervisionCases,
  type SupervisionCase,
  type SupervisionCasePerson,
} from "@/lib/api";

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "full",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function fullName(person: SupervisionCasePerson): string {
  return `${person.first_name} ${person.last_name}`;
}

/**
 * `reporter` gubi się z koperty, gdy relacja nie jest dociągnięta po stronie
 * API (`whenLoaded`) — ten sam mechanizm co `supervisor` w terminach
 * superwizji; trzeci stan obok „jest", tak jak `volunteerLabel` niżej.
 */
function reporterLabel(person: SupervisionCasePerson | undefined): string {
  if (!person) return "Zgłaszający/a nieznany/a";
  return fullName(person);
}

function volunteerLabel(person: SupervisionCasePerson | null): string {
  if (!person) return "Sprawa ogólna — bez wskazania osoby";
  return fullName(person);
}

export default function AdminSupervisionCases() {
  const [cases, setCases] = useState<SupervisionCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSupervisionCases()
      .then(({ data }) => {
        if (cancelled) return;
        setCases(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wczytać zgłoszonych spraw. Spróbuj ponownie.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const loading = cases === null && error === null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h2 font-black text-ink">Sprawy</h1>
        <p className="mt-2 max-w-3xl text-body text-muted">
          Sprawy zgłoszone przez prowadzących, dotyczące osób z ich grup lub
          zgłoszone bez wskazania konkretnej osoby.
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Nie udało się wczytać spraw">
          <p>{error}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setCases(null);
              setError(null);
              setReload((value) => value + 1);
            }}
          >
            Spróbuj ponownie
          </Button>
        </Alert>
      )}

      {loading ? (
        <p className="text-body text-muted" role="status">
          Wczytywanie spraw…
        </p>
      ) : cases === null ? null : cases.length === 0 ? (
        <Card>
          <p className="text-body text-muted">
            Brak zgłoszonych spraw do wyświetlenia.
          </p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Zgłoszone sprawy">
          {cases.map((item) => (
            <li key={item.id}>
              <Card
                title={item.subject}
                data-testid={"admin-case-" + item.id}
              >
                <div className="flex flex-wrap items-center gap-3 text-small text-muted">
                  <span>{formatDate(item.created_at)}</span>
                  <span>·</span>
                  <span>Zgłosił/a: {reporterLabel(item.reporter)}</span>
                  <span>·</span>
                  <span>{volunteerLabel(item.volunteer)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-body text-ink">
                  {item.body}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
