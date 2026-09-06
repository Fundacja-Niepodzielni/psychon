"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ApiError } from "@/lib/api";
import {
  fetchInstructorReliability,
  type ReliabilityPerson,
} from "@/lib/h07/api";
import ReliabilityValue from "@/components/h07/ReliabilityValue";

export default function H07ReliabilitySlot() {
  const [retryKey, setRetryKey] = useState(0);
  const [rows, setRows] = useState<ReliabilityPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchInstructorReliability()
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Nie udało się wczytać danych o rzetelności grupy.",
        );
      });

    return () => {
      active = false;
    };
  }, [retryKey]);

  return (
    <section
      id="h07-reliability-slot"
      aria-labelledby="h07-reliability-slot-title"
      className="flex flex-col gap-4"
    >
      <div>
        <h2
          id="h07-reliability-slot-title"
          className="text-h3 font-black text-ink"
        >
          Rzetelność nauki
        </h2>
        <p className="mt-2 text-body text-muted">
          Osoby z aktualnej grupy, od najniższego wyniku.
        </p>
      </div>

      {error ? (
        <Alert variant="error" title="Nie udało się wczytać sekcji">
          <p>{error}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setRows(null);
              setError(null);
              setRetryKey((value) => value + 1);
            }}
          >
            Spróbuj ponownie
          </Button>
        </Alert>
      ) : rows === null ? (
        <p role="status" className="text-body text-muted">
          Wczytywanie rzetelności grupy…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-body text-muted">
            Nie masz obecnie przypisanych osób w grupie.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card
                className={`h-full ${row.below_threshold ? "border-danger-border" : ""}`}
              >
                <p className="mb-3 font-bold text-ink">
                  {row.first_name} {row.last_name}
                </p>
                <ReliabilityValue
                  percent={row.reliability_percent}
                  belowThreshold={row.below_threshold}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
