"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api";
import type { ParticipantSlot } from "@/lib/h12/types";

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "full",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function actionMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Nie udało się wykonać operacji. Spróbuj ponownie.";
  }
  if (error.code === "slot_full") {
    return "Ten termin został właśnie zapełniony. Odśwież listę i wybierz inny termin.";
  }
  if (error.code === "not_your_supervisor") {
    return "Możesz zapisywać się tylko na terminy swojego superwizora.";
  }
  return error.message;
}

export default function SupervisionSlots() {
  const [slots, setSlots] = useState<ParticipantSlot[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiPaged<ParticipantSlot>("/supervision/slots?page=1&per_page=25")
      .then(({ data, meta: responseMeta }) => {
        if (cancelled) return;
        setSlots(data);
        setMeta(responseMeta);
        setLoadError(null);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się wczytać terminów. Spróbuj ponownie.",
        );
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function toggleSignup(slot: ParticipantSlot) {
    setActionId(slot.id);
    setActionError(null);
    setSuccess(null);
    const path = "/supervision/slots/" + slot.id + "/signup";
    try {
      const updated = slot.signup
        ? await api<ParticipantSlot>(path, { method: "DELETE" })
        : await api<ParticipantSlot>(path, { method: "POST" });
      setSlots((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess(
        slot.signup ? "Wypisano Cię z terminu." : "Zapisano Cię na termin.",
      );
    } catch (error: unknown) {
      setActionError(actionMessage(error));
      setReload((value) => value + 1);
    } finally {
      setActionId(null);
    }
  }

  const loading = !loaded && loadError === null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-black text-ink">Superwizja</h1>
        <p className="mt-2 text-body text-muted">
          Wybierz termin prowadzony przez Twojego aktualnego superwizora.
        </p>
      </div>
      {success && <Alert variant="success">{success}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}
      {loadError && (
        <Alert variant="error">
          {loadError}{" "}
          <button
            className="ml-2 underline focus-visible:focus-ring"
            type="button"
            onClick={() => {
              setLoaded(false);
              setLoadError(null);
              setReload((value) => value + 1);
            }}
          >
            Spróbuj ponownie
          </button>
        </Alert>
      )}
      {loading ? (
        <p className="text-body text-subtle" role="status">
          Wczytywanie terminów…
        </p>
      ) : slots.length === 0 && loadError === null ? (
        <Card>
          <p className="text-body text-muted">
            Nie masz jeszcze dostępnych terminów u swojego superwizora.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {slots.map((slot) => {
            const busy = actionId === slot.id;
            const ownSignup = slot.signup !== null;
            const seatText = slot.available_seats === 1 ? "miejsce" : "miejsca";
            return (
              <Card key={slot.id} title={formatDate(slot.starts_at)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={slot.is_full && !ownSignup ? "danger" : "info"}>
                    {slot.is_full && !ownSignup
                      ? "Brak miejsc"
                      : slot.available_seats + " " + seatText + " wolne"}
                  </Badge>
                  <span className="text-small text-muted">
                    {slot.duration_minutes} min
                  </span>
                </div>
                <dl className="mt-4 grid gap-2 text-small">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Zapisane osoby</dt>
                    <dd className="font-medium text-ink">
                      {slot.active_signups_count} / {slot.seats_limit}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Miejsce lub link</dt>
                    <dd className="text-right text-ink">
                      {slot.location_or_link ?? "Szczegóły u prowadzącego"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {ownSignup && <Badge variant="success">Jesteś zapisany/a</Badge>}
                  <Button
                    variant={ownSignup ? "secondary" : "primary"}
                    loading={busy}
                    disabled={!ownSignup && slot.is_full}
                    onClick={() => toggleSignup(slot)}
                  >
                    {ownSignup ? "Wypisz się" : "Zapisz się"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {meta && meta.last_page > 1 && (
        <p className="text-caption text-muted">
          Strona {meta.current_page} z {meta.last_page}
        </p>
      )}
    </div>
  );
}
