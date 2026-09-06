"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ApiError, type PaginationMeta } from "@/lib/api";
import {
  fetchAdminReliability,
  fetchAdminReliabilityDetail,
  type AdminReliabilityDetail,
  type AdminReliabilityPerson,
  type ReliabilityLesson,
} from "@/lib/h07/api";
import ReliabilityValue from "./ReliabilityValue";

interface DetailsState {
  status: "loading" | "loaded" | "error";
  data?: AdminReliabilityDetail;
  message?: string;
}

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

function LessonRow({ lesson }: { lesson: ReliabilityLesson }) {
  return (
    <li className="rounded-md border border-line bg-page p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-bold text-ink">{lesson.title}</p>
        <Badge variant={lesson.below_threshold ? "danger" : "success"}>
          {lesson.below_threshold ? "Poniżej progu" : "W normie"}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-3 text-small sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">Czas aktywny</dt>
          <dd className="font-medium text-ink">
            {formatDuration(lesson.active_seconds)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Czas lekcji</dt>
          <dd className="font-medium text-ink">
            {formatDuration(lesson.duration_seconds)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Liczba otwarć</dt>
          <dd className="font-medium text-ink">{lesson.open_count}</dd>
        </div>
        <div>
          <dt className="text-muted">Ostatnia aktywność</dt>
          <dd className="font-medium text-ink">
            {lesson.last_activity_at
              ? dateFormatter.format(new Date(lesson.last_activity_at))
              : "Brak danych"}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export default function AdminReliability() {
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [rows, setRows] = useState<AdminReliabilityPerson[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, DetailsState>>({});

  useEffect(() => {
    let active = true;

    fetchAdminReliability(page)
      .then((response) => {
        if (!active) return;
        setRows(response.data);
        setMeta(response.meta);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setListError(
          errorMessage(error, "Nie udało się wczytać danych o rzetelności."),
        );
      });

    return () => {
      active = false;
    };
  }, [page, retryKey]);

  function loadDetails(userId: number, force = false) {
    if (!force && details[userId]?.status === "loaded") return;

    setDetails((current) => ({
      ...current,
      [userId]: { status: "loading" },
    }));
    fetchAdminReliabilityDetail(userId)
      .then((data) => {
        setDetails((current) => ({
          ...current,
          [userId]: { status: "loaded", data },
        }));
      })
      .catch((error: unknown) => {
        setDetails((current) => ({
          ...current,
          [userId]: {
            status: "error",
            message: errorMessage(
              error,
              "Nie udało się wczytać szczegółów osoby.",
            ),
          },
        }));
      });
  }

  function toggle(row: AdminReliabilityPerson) {
    const opening = expandedId !== row.id;
    setExpandedId(opening ? row.id : null);
    if (opening) loadDetails(row.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h2 font-black text-ink">Czas nauki</h1>
        <p className="mt-2 max-w-3xl text-body text-muted">
          Lista jest uporządkowana od najniższej rzetelności. Rozwiń osobę,
          aby zobaczyć dane ukończonych lekcji.
        </p>
      </header>

      {listError ? (
        <Alert variant="error" title="Nie udało się wczytać listy">
          <p>{listError}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setRows(null);
              setListError(null);
              setRetryKey((value) => value + 1);
            }}
          >
            Spróbuj ponownie
          </Button>
        </Alert>
      ) : rows === null ? (
        <p role="status" className="text-body text-muted">
          Wczytywanie danych o rzetelności…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-body text-muted">
            Brak osób z danymi do wyświetlenia.
          </p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-4" aria-label="Rzetelność osób">
          {rows.map((row) => {
            const isExpanded = expandedId === row.id;
            const detail = details[row.id];
            const panelId = `reliability-details-${row.id}`;

            return (
              <li key={row.id}>
                <Card className={row.below_threshold ? "border-danger-border" : ""}>
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-h4 font-bold text-ink">
                        {row.first_name} {row.last_name}
                      </p>
                      <p className="mt-1 break-all text-small text-muted">
                        {row.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                      <ReliabilityValue
                        percent={row.reliability_percent}
                        belowThreshold={row.below_threshold}
                      />
                      <Button
                        variant="secondary"
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        onClick={() => toggle(row)}
                      >
                        {isExpanded ? "Ukryj szczegóły" : "Pokaż szczegóły"}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div id={panelId} className="mt-5 border-t border-line pt-5">
                      {detail?.status === "error" ? (
                        <Alert variant="error">
                          <p>{detail.message}</p>
                          <Button
                            variant="secondary"
                            className="mt-3"
                            onClick={() => loadDetails(row.id, true)}
                          >
                            Spróbuj ponownie
                          </Button>
                        </Alert>
                      ) : detail?.status !== "loaded" || !detail.data ? (
                        <p role="status" className="text-small text-muted">
                          Wczytywanie szczegółów…
                        </p>
                      ) : detail.data.lessons.length === 0 ? (
                        <p className="text-small text-muted">
                          Brak ukończonych lekcji z pomiarem czasu.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-3">
                          {detail.data.lessons.map((lesson) => (
                            <LessonRow key={lesson.id} lesson={lesson} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {meta && meta.last_page > 1 && (
        <nav
          aria-label="Strony listy rzetelności"
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => {
              setRows(null);
              setListError(null);
              setPage((value) => Math.max(1, value - 1));
            }}
          >
            Poprzednia
          </Button>
          <span className="text-small text-muted">
            Strona {meta.current_page} z {meta.last_page}
          </span>
          <Button
            variant="secondary"
            disabled={page >= meta.last_page}
            onClick={() => {
              setRows(null);
              setListError(null);
              setPage((value) => value + 1);
            }}
          >
            Następna
          </Button>
        </nav>
      )}
    </div>
  );
}
