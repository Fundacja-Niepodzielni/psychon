"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
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
  }, []);

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (!dashboard) {
    return <p className="text-body text-muted">Wczytywanie pulpitu…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 font-black text-ink">Pulpit</h1>

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
    </div>
  );
}
