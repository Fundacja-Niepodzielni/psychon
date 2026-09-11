"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import ReorderConfirmModal from "@/components/h08/ReorderConfirmModal";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate from "@/components/templates/ListTemplate";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api";
import {
  COURSE_TYPE_LABELS,
  PRODUCT_GROUP_LABELS,
  type AdminCourse,
  type CourseType,
  type ProductGroup,
  type ReorderImpactRow,
} from "@/lib/h08/types";

/** Kontrakt §1 dopuszcza `per_page` do 100 — cała ścieżka mieści się na stronie. */
const PER_PAGE = 100;

interface NewCourseForm {
  title: string;
  slug: string;
  type: CourseType;
  product_group: ProductGroup;
  sequence_order: string;
  description: string;
}

const EMPTY_FORM: NewCourseForm = {
  title: "",
  slug: "",
  type: "course",
  product_group: "psychon",
  sequence_order: "",
  description: "",
};

function pobierzKursy(
  strona: number,
): Promise<{ data: AdminCourse[]; meta?: PaginationMeta }> {
  return apiPaged<AdminCourse>(
    `/admin/courses?page=${strona}&per_page=${PER_PAGE}&sort=sequence_order`,
  );
}

export default function AdminCoursesPage() {
  const router = useRouter();

  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<AdminCourse>(
    pobierzKursy,
    [],
    "Nie udało się wczytać listy kursów. Odśwież stronę.",
  );
  const kursy = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && kursy.length === 0;

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewCourseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [order, setOrder] = useState<AdminCourse[] | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [impact, setImpact] = useState<ReorderImpactRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  function update<K extends keyof NewCourseForm>(
    key: K,
    value: NewCourseForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitNewCourse(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const created = await api<AdminCourse>("/admin/courses", {
        method: "POST",
        body: {
          title: form.title,
          slug: form.slug,
          type: form.type,
          product_group: form.product_group,
          sequence_order: form.sequence_order
            ? Number(form.sequence_order)
            : null,
          description: form.description || null,
        },
      });
      router.push(`/admin/kursy/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setFieldErrors(err.errors);
        setFormError("Popraw zaznaczone pola.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Nie udało się utworzyć kursu. Spróbuj ponownie.");
      }
      setSaving(false);
    }
  }

  function startReorder() {
    setReorderError(null);
    setOrder(kursy.filter((course) => course.sequence_order !== null));
  }

  function move(index: number, delta: number) {
    setOrder((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function requestPreview() {
    if (!order) return;
    setPreviewing(true);
    setReorderError(null);
    setModalError(null);

    try {
      const rows = await api<ReorderImpactRow[]>(
        "/admin/courses/reorder/preview",
        {
          method: "POST",
          body: { course_ids: order.map((course) => course.id) },
        },
      );
      setImpact(rows);
      setModalOpen(true);
    } catch (err) {
      setReorderError(
        err instanceof ApiError
          ? err.message
          : "Nie udało się policzyć wpływu zmiany kolejności.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmReorder() {
    if (!order) return;
    setConfirming(true);
    setModalError(null);

    try {
      await api<AdminCourse[]>("/admin/courses/reorder", {
        method: "PATCH",
        body: { course_ids: order.map((course) => course.id) },
      });
      setModalOpen(false);
      setImpact([]);
      setOrder(null);
      ponow();
    } catch (err) {
      setModalError(
        err instanceof ApiError
          ? err.message
          : "Nie udało się zapisać nowej kolejności.",
      );
    } finally {
      setConfirming(false);
    }
  }

  const fieldError = (key: string) => fieldErrors[key]?.[0];

  const columns: Column<AdminCourse>[] = [
    {
      key: "sequence_order",
      header: "Pozycja",
      render: (row) => row.sequence_order ?? "Poza ścieżką",
    },
    {
      key: "title",
      header: "Tytuł",
      render: (row) => (
        <Link
          href={`/admin/kursy/${row.id}`}
          className="font-medium text-primary underline underline-offset-4 focus-visible:focus-ring"
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Typ",
      render: (row) => COURSE_TYPE_LABELS[row.type] ?? row.type,
    },
    {
      key: "product_group",
      header: "Grupa produktowa",
      render: (row) => PRODUCT_GROUP_LABELS[row.product_group] ?? row.product_group,
    },
    {
      key: "is_published",
      header: "Publikacja",
      render: (row) => (
        <Badge variant={row.is_published ? "success" : "neutral"}>
          {row.is_published ? "Opublikowany" : "Szkic"}
        </Badge>
      ),
    },
    {
      key: "lessons_count",
      header: "Lekcje",
      render: (row) => row.lessons_count,
    },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <Link
          href={`/admin/kursy/${row.id}`}
          className="text-small font-medium text-accent-dark underline underline-offset-4 focus-visible:focus-ring"
        >
          Edytuj
        </Link>
      ),
    },
  ];

  return (
    <>
      <ListTemplate
        naglowek={{
          title: "Kursy",
          description:
            "Twórz kursy i webinary, dodawaj lekcje i ustalaj kolejność ścieżki.",
          action: (
            <>
              <Button
                variant="secondary"
                onClick={startReorder}
                disabled={stan.status !== "success" || order !== null}
              >
                Zmień kolejność ścieżki
              </Button>
              <Button
                onClick={() => {
                  setCreating((value) => !value);
                  setFormError(null);
                  setFieldErrors({});
                }}
                aria-expanded={creating}
              >
                {creating ? "Zamknij formularz" : "Nowy kurs"}
              </Button>
            </>
          ),
        }}
        stan={listaPusta ? "empty" : stan.status}
        httpStatus={stan.status === "error" ? stan.httpStatus : undefined}
        komunikatLadowania="Wczytywanie listy kursów…"
        komunikatBledu={stan.status === "error" ? stan.message : undefined}
        komunikatBleduTytul=""
        onPonow={ponow}
        pustyTytul="Nie ma jeszcze żadnego kursu. Utwórz pierwszy szkic."
        paginacja={
          meta ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone } : undefined
        }
        dodatkowyPanel={
          <>
            {creating && (
              <Card title="Nowy kurs">
                <form onSubmit={submitNewCourse} noValidate className="flex flex-col gap-4">
                  {formError && <Alert variant="error">{formError}</Alert>}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Tytuł"
                      value={form.title}
                      onChange={(e) => update("title", e.target.value)}
                      error={fieldError("title")}
                    />
                    <Input
                      label="Identyfikator (slug)"
                      value={form.slug}
                      onChange={(e) => update("slug", e.target.value)}
                      error={fieldError("slug")}
                      hint="Małe litery i myślniki, np. wywiad-psychologiczny."
                    />
                    <Select
                      label="Typ"
                      value={form.type}
                      onChange={(e) => update("type", e.target.value as CourseType)}
                      error={fieldError("type")}
                    >
                      {Object.entries(COURSE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Grupa produktowa"
                      value={form.product_group}
                      onChange={(e) =>
                        update("product_group", e.target.value as ProductGroup)
                      }
                      error={fieldError("product_group")}
                    >
                      {Object.entries(PRODUCT_GROUP_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Pozycja w ścieżce"
                      type="number"
                      min={1}
                      value={form.sequence_order}
                      onChange={(e) => update("sequence_order", e.target.value)}
                      error={fieldError("sequence_order")}
                      hint="Puste pole = kurs poza główną ścieżką (np. webinar)."
                    />
                  </div>

                  <Input
                    label="Opis"
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    error={fieldError("description")}
                  />

                  <p className="text-small text-muted">
                    Kurs powstaje jako szkic — publikacja jest osobną akcją na karcie
                    kursu i wymaga co najmniej jednej lekcji.
                  </p>

                  <div className="flex justify-end">
                    <Button type="submit" loading={saving}>
                      Utwórz szkic
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {order !== null && (
              <Card title="Kolejność ścieżki">
                <div className="flex flex-col gap-4">
                  <p className="text-small text-muted">
                    Ustaw kolejność, a przed zapisem zobaczysz listę osób, którym
                    zmienią się statusy kursów.
                  </p>

                  {reorderError && <Alert variant="error">{reorderError}</Alert>}

                  {order.length === 0 ? (
                    <p className="text-body text-subtle">
                      Żaden kurs nie ma jeszcze pozycji w ścieżce.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-2">
                      {order.map((course, index) => (
                        <li
                          key={course.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-page px-4 py-3"
                        >
                          <span className="text-body text-ink">
                            <span className="mr-2 font-bold">{index + 1}.</span>
                            {course.title}
                          </span>
                          <span className="flex gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => move(index, -1)}
                              disabled={index === 0}
                              aria-label={`Przesuń w górę: ${course.title}`}
                            >
                              W górę
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => move(index, 1)}
                              disabled={index === order.length - 1}
                              aria-label={`Przesuń w dół: ${course.title}`}
                            >
                              W dół
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setOrder(null);
                        setReorderError(null);
                      }}
                    >
                      Anuluj
                    </Button>
                    <Button
                      onClick={requestPreview}
                      loading={previewing}
                      disabled={order.length < 2}
                    >
                      Sprawdź wpływ zmiany
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </>
        }
      >
        <Table
          columns={columns}
          rows={kursy}
          rowKey={(row) => row.id}
          caption="Kursy i webinary w panelu administracji"
          emptyMessage="Nie ma jeszcze żadnego kursu. Utwórz pierwszy szkic."
        />
      </ListTemplate>

      <ReorderConfirmModal
        open={modalOpen}
        rows={impact}
        loading={confirming}
        error={modalError}
        onCancel={() => {
          if (confirming) return;
          setModalOpen(false);
          setModalError(null);
        }}
        onConfirm={confirmReorder}
      />
    </>
  );
}
