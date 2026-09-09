"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import {
  ApiError,
  assignSupervisor,
  fetchAdminUsers,
  type AdminUserListItem,
} from "@/lib/api";

/**
 * Nadanie prowadzącego z panelu (H12 · PUT /admin/users/{id}/supervisor).
 *
 * Ekran niczego nie rozstrzyga: listę kandydatów bierze z `/admin/users?role=instructor`,
 * a o dopuszczalności przypisania decyduje serwer — odmowę (422) pokazujemy tak,
 * jak wróciła. Dlatego przycisk nie znika przy „podejrzanym" wyborze; blokuje go
 * tylko brak wskazanej osoby i trwające żądanie.
 */
export default function AssignSupervisor({ userId }: { userId: number }) {
  const [instructors, setInstructors] = useState<AdminUserListItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<{ name: string; at: string | null } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    fetchAdminUsers({ role: "instructor", per_page: 100 })
      .then(({ data }) => {
        if (active) setInstructors(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setListError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wczytać listy prowadzących.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    const supervisorId = Number(selected);
    if (!supervisorId) return;

    setSaving(true);
    setError(null);
    setAssigned(null);

    try {
      const assignment = await assignSupervisor(userId, supervisorId);
      const person = instructors.find((row) => row.id === assignment.supervisor_id);
      setAssigned({
        name: person
          ? `${person.first_name} ${person.last_name}`
          : `osoba nr ${assignment.supervisor_id}`,
        at: assignment.assigned_at,
      });
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Nie udało się nadać prowadzącego. Spróbuj ponownie.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Prowadzący superwizje">
      <p className="mb-4 text-small text-muted">
        Wskazana osoba przejmuje superwizję tej uczestniczki — poprzednie
        przypisanie serwer zamyka sam.
      </p>
      {listError && <Alert variant="error">{listError}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {assigned && (
        <p role="status" className="mb-4 text-small font-medium text-ink">
          Prowadzącym/ą jest teraz {assigned.name}
          {assigned.at
            ? ` (od ${new Date(assigned.at).toLocaleString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })})`
            : ""}
          .
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Prowadzący/a"
          className="min-w-64"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Wybierz osobę</option>
          {instructors.map((row) => (
            <option key={row.id} value={row.id}>
              {row.first_name} {row.last_name} ({row.email})
            </option>
          ))}
        </Select>
        <Button loading={saving} disabled={selected === ""} onClick={submit}>
          Nadaj prowadzącego
        </Button>
      </div>
    </Card>
  );
}
