"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import { api, ApiError, getToken } from "@/lib/api";
import {
  fetchCertificateConditions,
  type CertificateCondition,
  type CertificateConditions,
} from "@/lib/pulpit/data";

type Condition = CertificateCondition;
type Conditions = CertificateConditions;

type IssueState = "idle" | "queued" | "downloading";

/**
 * Ekran, z którego pochodzi każda liczba warunku (H13). `workshop` nie ma
 * wpisu celowo — warsztat stacjonarny odhacza wyłącznie administracja
 * (`AdminWorkshopController`), uczestniczka nie ma własnego ekranu źródłowego.
 */
const SOURCE_HREF: Partial<Record<Condition["key"], string>> = {
  courses: "/panel/kursy",
  internship: "/panel/staz",
  supervision: "/panel/superwizja",
};

/** Nazwa ekranu źródłowego do treści `aria-label` linku (dopełniacz). */
const SOURCE_NAME: Partial<Record<Condition["key"], string>> = {
  courses: "listy kursów i testów",
  internship: "dziennika stażu",
  supervision: "terminów superwizji",
};

function hasCount(c: Condition): boolean {
  return c.done !== undefined && c.done !== null && c.required !== undefined && c.required !== null;
}

/** Brakujące pole liczbowe pokazujemy jako "brak danych", nigdy jako 0. */
function formatCount(done?: number | string, required?: number | string): string {
  if (done === undefined || done === null || required === undefined || required === null) {
    return "brak danych";
  }
  return `${done} / ${required}`;
}

/**
 * Poz. 19 Załącznika 1: liczba zaliczonych testów osobno od `courses`
 * (który scala etapy i testy w jedno pole po stronie API). Ten sam
 * konwencja "brak danych" co przy licznikach warunków, gdy pole nie
 * przyjdzie ze starej odpowiedzi API (wstecznie kompatybilne).
 */
function formatPassedTestsCount(value?: number | null): string {
  if (value === undefined || value === null) {
    return "brak danych";
  }
  return String(value);
}

function percent(done?: number | string, required?: number | string): number {
  const d = Number(done ?? 0);
  const r = Number(required ?? 0);
  if (!r) return 0;
  return Math.min(100, (d / r) * 100);
}

export default function CertificatePage() {
  const [data, setData] = useState<Conditions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issue, setIssue] = useState<IssueState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchCertificateConditions()
        .then(setData)
        .catch((err) => {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Nie udało się wczytać warunków. Odśwież stronę.",
          );
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setActionError(null);
    try {
      await api("/certificate/generate", { method: "POST" });
      setIssue("queued");
    } catch (err) {
      if (err instanceof ApiError && err.code === "conditions_not_met") {
        setActionError(
          "Nie wszystkie warunki są spełnione — odśwież listę poniżej.",
        );
        void load();
      } else if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError("Nie udało się rozpocząć generowania. Spróbuj ponownie.");
      }
    }
  }

  async function download() {
    setActionError(null);
    setIssue("downloading");
    try {
      const base =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${base.replace(/\/+$/, "")}/api/v1/certificate/download`, {
        headers: { Authorization: `Bearer ${(await getToken()) ?? ""}` },
      });
      if (res.status === 404) {
        setActionError(
          "Certyfikat jeszcze się generuje. Spróbuj ponownie za chwilę.",
        );
        setIssue("queued");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "certyfikat.html";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setIssue("queued");
    } catch {
      setActionError("Nie udało się pobrać pliku. Spróbuj ponownie za chwilę.");
      setIssue("queued");
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Alert variant="error">{loadError}</Alert>
      </div>
    );
  }

  if (!data) {
    return <p className="text-body text-muted">Wczytywanie…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 font-black text-ink">Certyfikat ukończenia programu</h1>

      <Card title="Warunki ukończenia">
        <ul className="flex flex-col divide-y divide-line">
          {data.conditions.map((c) => {
            const href = SOURCE_HREF[c.key];
            const count = formatCount(c.done, c.required);

            return (
              <li key={c.key} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-body text-ink">{c.label}</span>
                  <span className="flex items-center gap-3">
                    {c.key !== "workshop" &&
                      (href ? (
                        <Link
                          href={href}
                          aria-label={`${c.label}: ${count} — przejdź do ${SOURCE_NAME[c.key]}`}
                          className="text-small font-bold text-ink underline underline-offset-4 hover:text-accent focus-visible:focus-ring"
                        >
                          {count}
                        </Link>
                      ) : (
                        <span className="text-small font-bold text-ink">{count}</span>
                      ))}
                    <Badge variant={c.met ? "success" : "warning"}>
                      {c.met ? "spełniony" : "w toku"}
                    </Badge>
                  </span>
                </div>
                {c.key !== "workshop" && hasCount(c) && (
                  <ProgressBar
                    value={percent(c.done, c.required)}
                    label={`Postęp: ${c.label}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center justify-between gap-4 border-t border-line pt-3 text-body text-ink">
          <span>Zaliczone testy</span>
          <span className="text-small font-bold text-ink">
            {formatPassedTestsCount(data.passed_tests_count)}
          </span>
        </p>
      </Card>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      {data.eligible ? (
        issue === "idle" ? (
          <div>
            <Alert variant="success" className="mb-4">
              Wszystkie warunki są spełnione. Możesz wygenerować certyfikat.
            </Alert>
            <Button onClick={generate}>Wygeneruj certyfikat</Button>
          </div>
        ) : (
          <Card>
            <p className="mb-3 text-body text-muted">
              Certyfikat został zlecony do wygenerowania. Plik będzie gotowy za
              chwilę.
            </p>
            <Button onClick={download} loading={issue === "downloading"}>
              Pobierz certyfikat
            </Button>
          </Card>
        )
      ) : (
        <Alert variant="info">
          Certyfikat będzie dostępny po spełnieniu wszystkich czterech warunków.
        </Alert>
      )}
    </div>
  );
}
