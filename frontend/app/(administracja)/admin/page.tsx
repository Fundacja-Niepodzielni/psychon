"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import PageTemplate from "@/components/templates/PageTemplate";
import { api, ApiError } from "@/lib/api";

interface DashboardCounters {
  participants: number;
  completed: number;
  certificates: number;
}

interface DashboardQueue {
  key: string;
  count: number;
  link: string;
}

interface Dashboard {
  counters: DashboardCounters;
  queues: DashboardQueue[];
}

const COUNTER_LABELS: Record<keyof DashboardCounters, string> = {
  participants: "Uczestniczki i uczestnicy",
  completed: "Ukończenia programu",
  certificates: "Wydane certyfikaty",
};

const QUEUE_LABELS: Record<string, string> = {
  applications: "Zgłoszenia rekrutacyjne",
  internship_entries: "Wpisy stażu do akceptacji",
  profiles: "Profile psychologa do decyzji",
  questions: "Pytania bez odpowiedzi",
};

export default function AdminHomePage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Ponowienie liczy proby, nie tylko flage: ten sam wzorzec co /panel/start,
  // zeby klikniecie "Sprobuj ponownie" zawsze wywolalo nowy efekt.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api<Dashboard>("/admin/dashboard")
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wczytać pulpitu. Odśwież stronę.",
        );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  if (loadError) {
    return (
      <PageTemplate naglowek={{ title: "Pulpit" }}>
        <ErrorState message={loadError} onRetry={retry} />
      </PageTemplate>
    );
  }

  if (!dashboard) {
    return (
      <PageTemplate naglowek={{ title: "Pulpit" }}>
        <LoadingState label="Wczytywanie pulpitu…" />
      </PageTemplate>
    );
  }

  return (
    <PageTemplate naglowek={{ title: "Pulpit" }}>
      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(COUNTER_LABELS) as (keyof DashboardCounters)[]).map(
          (key) => (
            <Card key={key}>
              <p className="text-caption font-bold uppercase tracking-wide text-muted">
                {COUNTER_LABELS[key]}
              </p>
              <p className="mt-2 text-h2 font-black text-ink">
                {dashboard.counters[key]}
              </p>
            </Card>
          ),
        )}
      </div>

      <Card title="Kolejki spraw">
        {dashboard.queues.length === 0 ? (
          <p className="text-small text-muted">Brak spraw do obsłużenia.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {dashboard.queues.map((queue) => (
              <li key={queue.key} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={queue.link}
                  className="flex items-center justify-between gap-4 rounded-sm px-2 py-1 -mx-2 hover:bg-grey focus-visible:focus-ring"
                >
                  <span className="text-body text-ink">
                    {QUEUE_LABELS[queue.key] ?? queue.key}
                  </span>
                  <span className="text-h4 font-bold text-primary">
                    {queue.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageTemplate>
  );
}
