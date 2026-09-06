"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import ProgressBar from "@/components/ui/ProgressBar";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import { api, ApiError } from "@/lib/api";
import type { Column } from "@/components/ui/Table";
import type {
  Attendance,
  GroupMember,
  InstructorGroup as InstructorGroupData,
  InstructorSlot,
} from "@/lib/h12/types";
import H07ReliabilitySlot from "./H07ReliabilitySlot";

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "full",
  timeStyle: "short",
});

type SlotForm = {
  starts_at: string;
  duration_minutes: string;
  seats_limit: string;
  location_or_link: string;
};

function emptySlotForm(): SlotForm {
  return {
    starts_at: "",
    duration_minutes: "90",
    seats_limit: "3",
    location_or_link: "",
  };
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function errorFor(
  errors: Record<string, string[]> | undefined,
  field: string,
): string | undefined {
  return errors?.[field]?.[0];
}

function attendanceLabel(value: Attendance | null): string {
  if (value === "present") return "Obecny/a";
  if (value === "absent") return "Nieobecny/a";
  return "Nieoznaczona";
}

export default function InstructorGroup() {
  const [group, setGroup] = useState<InstructorGroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm>(emptySlotForm);
  const [slotErrors, setSlotErrors] = useState<Record<string, string[]>>();
  const [slotError, setSlotError] = useState<string | null>(null);
  const [savingSlot, setSavingSlot] = useState(false);
  const [attendance, setAttendance] = useState<
    Record<number, Record<number, Attendance>>
  >({});
  const [savingAttendanceId, setSavingAttendanceId] = useState<number | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function loadGroup() {
    setLoadError(null);
    api<InstructorGroupData>("/instructor/group")
      .then(setGroup)
      .catch((error: unknown) => {
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się wczytać grupy. Spróbuj ponownie.",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    api<InstructorGroupData>("/instructor/group")
      .then((value) => {
        if (!cancelled) setGroup(value);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się wczytać grupy. Spróbuj ponownie.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSlot(true);
    setSlotError(null);
    setSlotErrors(undefined);
    setSuccess(null);

    try {
      const created = await api<InstructorSlot>("/instructor/slots", {
        method: "POST",
        body: {
          starts_at: new Date(slotForm.starts_at).toISOString(),
          duration_minutes: Number(slotForm.duration_minutes),
          seats_limit: Number(slotForm.seats_limit),
          location_or_link: slotForm.location_or_link || null,
        },
      });
      setGroup((current) =>
        current ? { ...current, slots: [...current.slots, created] } : current,
      );
      setSlotForm(emptySlotForm());
      setSuccess("Termin został utworzony.");
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 422) {
        setSlotErrors(error.errors);
        setSlotError("Popraw zaznaczone pola.");
      } else {
        setSlotError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się utworzyć terminu.",
        );
      }
    } finally {
      setSavingSlot(false);
    }
  }

  function setSlotAttendance(slotId: number, userId: number, value: Attendance) {
    setAttendance((current) => ({
      ...current,
      [slotId]: {
        ...current[slotId],
        [userId]: value,
      },
    }));
  }

  async function saveAttendance(slot: InstructorSlot) {
    setSavingAttendanceId(slot.id);
    setAttendanceError(null);
    setSuccess(null);

    const values: Record<string, Attendance> = {};
    slot.signups.forEach((signup) => {
      const value = attendance[slot.id]?.[signup.user.id] ?? signup.attendance;
      if (value) values[String(signup.user.id)] = value;
    });

    try {
      const updated = await api<InstructorSlot>(
        "/instructor/slots/" + slot.id + "/attendance",
        { method: "PATCH", body: { attendance: values } },
      );
      setGroup((current) =>
        current
          ? {
              ...current,
              slots: current.slots.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      setSuccess("Obecności zostały zapisane.");
    } catch (error: unknown) {
      setAttendanceError(
        error instanceof ApiError
          ? error.message
          : "Nie udało się zapisać obecności.",
      );
    } finally {
      setSavingAttendanceId(null);
    }
  }

  const memberColumns: Column<GroupMember>[] = [
    {
      key: "name",
      header: "Uczestnik",
      render: (member) => member.first_name + " " + member.last_name,
    },
    {
      key: "courses",
      header: "Kursy",
      render: (member) => {
        const { courses_done: done, courses_total: total } = member.progress;
        const value = total > 0 ? (done / total) * 100 : 0;
        return (
          <div className="min-w-36">
            <span className="text-small">{done} / {total}</span>
            <ProgressBar
              className="mt-2"
              value={value}
              label={"Postęp kursów: " + done + " z " + total}
            />
          </div>
        );
      },
    },
    {
      key: "internship",
      header: "Staż",
      render: (member) => member.progress.hours_accepted + " h",
    },
    {
      key: "supervision",
      header: "Superwizje",
      render: (member) => String(member.progress.supervision_present),
    },
    {
      key: "workshop",
      header: "Warsztat",
      render: (member) => (
        <Badge variant={member.progress.workshop_done ? "success" : "neutral"}>
          {member.progress.workshop_done ? "Ukończony" : "Nieukończony"}
        </Badge>
      ),
    },
  ];

  if (loading) {
    return <p className="text-body text-subtle" role="status">Wczytywanie grupy…</p>;
  }

  if (loadError || group === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h2 font-black text-ink">Moja grupa</h1>
        <Alert variant="error">{loadError ?? "Nie udało się wczytać grupy."}</Alert>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            void loadGroup();
          }}
        >
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-black text-ink">Moja grupa</h1>
        <p className="mt-2 text-body text-muted">
          Sprawdzaj postępy uczestników i zarządzaj terminami superwizji.
        </p>
      </div>
      {success && <Alert variant="success">{success}</Alert>}
      {attendanceError && <Alert variant="error">{attendanceError}</Alert>}

      <Card title="Uczestnicy">
        <Table
          columns={memberColumns}
          rows={group.members}
          rowKey={(member) => member.id}
          caption="Postępy uczestników grupy"
          emptyMessage="Nie masz jeszcze przypisanych uczestników."
        />
      </Card>

      <Card title="Utwórz termin">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={createSlot}>
          {slotError && (
            <Alert variant="error" className="sm:col-span-2">{slotError}</Alert>
          )}
          <Input
            label="Data i godzina"
            type="datetime-local"
            required
            value={slotForm.starts_at}
            onChange={(event) =>
              setSlotForm({ ...slotForm, starts_at: event.target.value })
            }
            error={errorFor(slotErrors, "starts_at")}
          />
          <Input
            label="Czas trwania (minuty)"
            type="number"
            min="1"
            max="65535"
            required
            value={slotForm.duration_minutes}
            onChange={(event) =>
              setSlotForm({ ...slotForm, duration_minutes: event.target.value })
            }
            error={errorFor(slotErrors, "duration_minutes")}
          />
          <Input
            label="Limit miejsc"
            type="number"
            min="1"
            max="255"
            required
            value={slotForm.seats_limit}
            onChange={(event) =>
              setSlotForm({ ...slotForm, seats_limit: event.target.value })
            }
            error={errorFor(slotErrors, "seats_limit")}
          />
          <Input
            label="Miejsce lub link"
            value={slotForm.location_or_link}
            onChange={(event) =>
              setSlotForm({ ...slotForm, location_or_link: event.target.value })
            }
            error={errorFor(slotErrors, "location_or_link")}
          />
          <div className="sm:col-span-2">
            <Button type="submit" loading={savingSlot}>Utwórz termin</Button>
          </div>
        </form>
      </Card>

      <Card title="Terminy i obecności">
        {group.slots.length === 0 ? (
          <p className="text-body text-muted">Nie utworzyłeś/aś jeszcze żadnego terminu.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {group.slots.map((slot) => (
              <section key={slot.id} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-h4 font-bold text-ink">{formatDate(slot.starts_at)}</h3>
                    <p className="mt-1 text-small text-muted">
                      {slot.active_signups_count} / {slot.seats_limit} miejsc · {slot.duration_minutes} min
                      {slot.location_or_link ? " · " + slot.location_or_link : ""}
                    </p>
                  </div>
                  <Badge variant={slot.available_seats === 0 ? "danger" : "info"}>
                    {slot.available_seats} wolnych miejsc
                  </Badge>
                </div>

                {slot.signups.length === 0 ? (
                  <p className="mt-4 text-small text-muted">Nikt nie zapisał się na ten termin.</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    {slot.signups.map((signup) => {
                      const value = attendance[slot.id]?.[signup.user.id] ?? signup.attendance;
                      return (
                        <div
                          key={signup.user.id}
                          className="flex flex-col gap-2 rounded-sm bg-grey p-3 sm:flex-row sm:items-end sm:justify-between"
                        >
                          <div>
                            <p className="text-small font-medium text-ink">
                              {signup.user.first_name} {signup.user.last_name}
                            </p>
                            <p className="text-caption text-muted">
                              Obecność: {attendanceLabel(value)}
                            </p>
                          </div>
                          <Select
                            label="Obecność"
                            value={value ?? ""}
                            onChange={(event) => {
                              const next = event.target.value as Attendance;
                              if (next === "present" || next === "absent") {
                                setSlotAttendance(slot.id, signup.user.id, next);
                              }
                            }}
                          >
                            <option value="">Wybierz</option>
                            <option value="present">Obecny/a</option>
                            <option value="absent">Nieobecny/a</option>
                          </Select>
                        </div>
                      );
                    })}
                    <Button
                      className="self-start"
                      loading={savingAttendanceId === slot.id}
                      onClick={() => saveAttendance(slot)}
                    >
                      Zapisz obecności
                    </Button>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </Card>

      <H07ReliabilitySlot />
    </div>
  );
}
