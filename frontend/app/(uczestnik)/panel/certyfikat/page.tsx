"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import { api, ApiError, getToken } from "@/lib/api";

interface Condition {
  key: "courses" | "internship" | "supervision" | "workshop";
  label: string;
  done?: number | string;
  required?: number | string;
  met: boolean;
}

interface Conditions {
  eligible: boolean;
  conditions: Condition[];
}

type IssueState = "idle" | "queued" | "downloading";

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
      api<Conditions>("/certificate/conditions")
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
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
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
          {data.conditions.map((c) => (
            <li key={c.key} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-body text-ink">{c.label}</span>
                <span className="flex items-center gap-3">
                  {c.key !== "workshop" && (
                    <span className="text-small font-bold text-ink">
                      {c.done} / {c.required}
                    </span>
                  )}
                  <Badge variant={c.met ? "success" : "warning"}>
                    {c.met ? "spełniony" : "w toku"}
                  </Badge>
                </span>
              </div>
              {c.key !== "workshop" && (
                <ProgressBar
                  value={percent(c.done, c.required)}
                  label={`Postęp: ${c.label}`}
                />
              )}
            </li>
          ))}
        </ul>
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
