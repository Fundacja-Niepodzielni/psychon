"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import {
  api,
  ApiError,
  fetchAdminUsers,
  type AdminUserListItem,
} from "@/lib/api";
import type {
  AdminCoursesSlot,
  AdminCoursesSlotProps,
} from "@/lib/slots/admin-courses";

/** Konta, które uczestniczą w programie — tylko one dostają zaproszenia. */
const PARTICIPANT_ROLES = ["volunteer", "student"] as const;

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Odmiana „osoba" po liczbie — komunikat sukcesu czyta się po polsku. */
function invitedLabel(count: number): string {
  if (count === 1) return "Zaproszono 1 osobę.";

  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const few = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);

  return `Zaproszono ${count} ${few ? "osoby" : "osób"}.`;
}

/**
 * Zaproszenie na kurs poza główną ścieżką (kryterium 5 karty H08).
 *
 * Zaproszenie jest wyłącznie powiadomieniem — nie nadaje dostępu do kursu.
 * Kurs ze ścieżki odblokowuje się sekwencyjnie (M4 pkt 6), więc dla takiego
 * kursu panel pokazuje wyjaśnienie zamiast formularza; API odrzuca taką próbę
 * niezależnie, kodem 422 `conditions_not_met`.
 */
export function CourseInvitePanel({ course }: AdminCoursesSlotProps) {
  const onMainPath = course.sequence_order !== null;

  const [people, setPeople] = useState<AdminUserListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [invited, setInvited] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    // Kurs ze ścieżki nie ma formularza, więc nie fatygujemy API H18.
    if (!onMainPath) {
      Promise.all(
        PARTICIPANT_ROLES.map((role) =>
          fetchAdminUsers({
            role,
            status: "active",
            per_page: 100,
            sort: "last_name",
          }),
        ),
      )
        .then((pages) => {
          if (!active) return;
          setPeople(pages.flatMap((page) => page.data));
          setLoadError(null);
        })
        .catch((err: unknown) => {
          if (!active) return;
          setLoadError(
            messageFrom(err, "Nie udało się wczytać listy osób. Odśwież stronę."),
          );
        });
    }

    return () => {
      active = false;
    };
  }, [onMainPath]);

  if (onMainPath) {
    return (
      <Card title="Zaproszenia">
        <p className="text-body text-muted">
          Ten kurs stoi na pozycji {course.sequence_order} głównej ścieżki, więc
          odblokowuje się kolejnymi etapami — zaproszenia dotyczą wyłącznie
          kursów poza ścieżką, na przykład webinarów. Usuń pozycję w ścieżce,
          jeśli kurs ma być webinarem.
        </p>
      </Card>
    );
  }

  const term = search.trim().toLowerCase();
  const visible =
    term === ""
      ? people
      : people.filter((person) =>
          `${person.first_name} ${person.last_name} ${person.email}`
            .toLowerCase()
            .includes(term),
        );

  function togglePerson(id: number, checked: boolean) {
    setInvited(null);
    setSelected((prev) =>
      checked ? [...prev, id] : prev.filter((value) => value !== id),
    );
  }

  async function sendInvitations() {
    setSending(true);
    setSendError(null);
    setInvited(null);

    try {
      const result = await api<{ invited: number }>(
        `/admin/courses/${course.id}/invite`,
        { method: "POST", body: { user_ids: selected } },
      );
      setInvited(result.invited);
      setSelected([]);
    } catch (err) {
      setSendError(
        messageFrom(err, "Nie udało się wysłać zaproszeń. Spróbuj ponownie."),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Zaproszenia">
      <div className="flex flex-col gap-4">
        <p className="text-small text-muted">
          Zaproszone osoby dostaną powiadomienie w panelu i e-mail w skrzynce.
          Zaproszenie nie nadaje dostępu do kursu — jest informacją o webinarze.
        </p>

        {loadError && <Alert variant="error">{loadError}</Alert>}
        {sendError && <Alert variant="error">{sendError}</Alert>}
        {invited !== null && (
          <Alert variant="success">{invitedLabel(invited)}</Alert>
        )}

        <Input
          label="Szukaj osoby"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          hint="Filtruje listę po imieniu, nazwisku i adresie e-mail."
        />

        <fieldset className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-sm border border-line p-4">
          <legend className="px-1 text-caption font-bold uppercase tracking-wide text-muted">
            Kogo zapraszasz
          </legend>

          {visible.length === 0 ? (
            <p className="text-body text-subtle">
              Brak osób spełniających kryteria.
            </p>
          ) : (
            visible.map((person) => (
              <label
                key={person.id}
                className="flex items-start gap-2 text-body text-ink"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(person.id)}
                  onChange={(event) =>
                    togglePerson(person.id, event.target.checked)
                  }
                  className="mt-1 focus-visible:focus-ring"
                />
                <span>
                  {person.first_name} {person.last_name}
                  <span className="block text-caption text-subtle">
                    {person.email}
                  </span>
                </span>
              </label>
            ))
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-caption text-subtle">
            Zaznaczono: {selected.length}
          </p>
          <Button
            onClick={sendInvitations}
            loading={sending}
            disabled={selected.length === 0}
          >
            Zaproś
          </Button>
        </div>
      </div>
    </Card>
  );
}

const slot: AdminCoursesSlot = {
  id: "h08b-course-invite",
  region: "course-actions",
  order: 100,
  Component: CourseInvitePanel,
};

export default slot;
