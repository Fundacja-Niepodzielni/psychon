"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  ApiError,
  fetchAdminSupervisionSlots,
  type AdminSupervisionSlot,
} from "@/lib/api";

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "full",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

/**
 * Obecność odnotowuje prowadzący na swoim ekranie (PATCH
 * /instructor/slots/{id}/attendance); tu jest tylko do odczytu — dokładnie
 * to kryterium pozycji 6 nazywa „potwierdzeniem odbycia widocznym w administracji".
 */
function attendanceLabel(value: "present" | "absent" | null): string {
  if (value === "present") return "Obecność potwierdzona";
  if (value === "absent") return "Nieobecność";
  return "Jeszcze nieoznaczona";
}

function fullName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`;
}

export default function AdminSupervisionSlots() {
  const [slots, setSlots] = useState<AdminSupervisionSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSupervisionSlots()
      .then(({ data }) => {
        if (cancelled) return;
        setSlots(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wczytać terminów superwizji. Spróbuj ponownie.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const loading = slots === null && error === null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h2 font-black text-ink">Superwizje</h1>
        <p className="mt-2 max-w-3xl text-body text-muted">
          Wszystkie terminy wszystkich prowadzących, z obecnością odnotowaną
          przez prowadzącego przy każdej zapisanej osobie.
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Nie udało się wczytać terminów">
          <p>{error}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setSlots(null);
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
          Wczytywanie terminów superwizji…
        </p>
      ) : slots === null ? null : slots.length === 0 ? (
        <Card>
          <p className="text-body text-muted">
            Brak terminów superwizji do wyświetlenia.
          </p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Terminy superwizji">
          {slots.map((slot) => (
            <li key={slot.id}>
              <Card
                title={formatDate(slot.starts_at)}
                data-testid={"admin-slot-" + slot.id}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-small text-muted">Prowadzący/a:</span>
                  <span className="font-medium text-ink">
                    {fullName(slot.supervisor)}
                  </span>
                  <Badge
                    variant={
                      slot.active_signups_count >= slot.seats_limit
                        ? "danger"
                        : "info"
                    }
                  >
                    {slot.active_signups_count} / {slot.seats_limit}
                  </Badge>
                </div>

                {slot.signups.length === 0 ? (
                  <p className="mt-4 text-small text-muted">
                    Nikt jeszcze się nie zapisał.
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-2">
                    {slot.signups.map((signup) => (
                      <li
                        key={signup.user.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-page px-3 py-2 text-small"
                      >
                        <span className="font-medium text-ink">
                          {fullName(signup.user)}
                        </span>
                        <span className="text-muted">
                          {attendanceLabel(signup.attendance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
