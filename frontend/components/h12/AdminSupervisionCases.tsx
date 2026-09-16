"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
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
  const [errorStatus, setErrorStatus] = useState<number | undefined>();
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
        setErrorStatus(err instanceof ApiError ? err.status : undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const stanEfektywny: StanListy = error
    ? "error"
    : cases === null
      ? "loading"
      : cases.length === 0
        ? "empty"
        : "success";

  return (
    <ListTemplate
      naglowek={{
        title: "Sprawy",
        description:
          "Sprawy zgłoszone przez prowadzących, dotyczące osób z ich grup lub zgłoszone bez wskazania konkretnej osoby.",
      }}
      stan={stanEfektywny}
      httpStatus={errorStatus}
      komunikatLadowania="Wczytywanie spraw…"
      komunikatBledu={error ?? undefined}
      komunikatBleduTytul="Nie udało się wczytać spraw"
      onPonow={() => {
        setCases(null);
        setError(null);
        setErrorStatus(undefined);
        setReload((value) => value + 1);
      }}
      pustyTytul="Brak zgłoszonych spraw do wyświetlenia."
    >
        <ol className="flex flex-col gap-4" aria-label="Zgłoszone sprawy">
          {(cases ?? []).map((item) => (
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
    </ListTemplate>
  );
}
