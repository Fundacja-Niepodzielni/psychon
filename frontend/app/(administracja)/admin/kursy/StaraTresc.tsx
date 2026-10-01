"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import ReorderConfirmModal from "@/components/h08/ReorderConfirmModal";
import ActionRow from "@/components/molecules/ActionRow";
import MoveButtons from "@/components/molecules/MoveButtons";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Columns from "@/components/ui/Columns";
import Form from "@/components/ui/Form";
import Input from "@/components/ui/Input";
import Inset from "@/components/ui/Inset";
import Select from "@/components/ui/Select";
import Stack from "@/components/ui/Stack";
import Table, { type Column } from "@/components/ui/Table";
import Text from "@/components/ui/Text";
import TextLink from "@/components/ui/TextLink";
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
        <TextLink href={`/admin/kursy/${row.id}`}>{row.title}</TextLink>
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
        <TextLink
          href={`/admin/kursy/${row.id}`}
          aria-label={`Edytuj kurs: ${row.title}`}
        >
          Edytuj
        </TextLink>
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
                variant={creating ? "secondary" : "primary"}
                onClick={() => {
                  setCreating((value) => !value);
                  setFormError(null);
                  setFieldErrors({});
                }}
                aria-expanded={creating}
              >
                {creating ? "Zamknij formularz" : "Dodaj kurs"}
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
                <Form onSubmit={submitNewCourse} bledyPol={fieldErrors}>
                  <Stack>
                    {formError && <Alert variant="error">{formError}</Alert>}

                    <Columns>
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
                    </Columns>

                    <Input
                      label="Opis"
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                      error={fieldError("description")}
                    />

                    <Text size="small" tone="muted">
                      Kurs powstaje jako szkic — publikacja jest osobną akcją na karcie
                      kursu i wymaga co najmniej jednej lekcji.
                    </Text>

                    <ActionRow>
                      <Button type="submit" loading={saving}>
                        Utwórz szkic
                      </Button>
                    </ActionRow>
                  </Stack>
                </Form>
              </Card>
            )}

            {order !== null && (
              <Card title="Kolejność ścieżki">
                <Stack>
                  <Text size="small" tone="muted">
                    Ustaw kolejność, a przed zapisem zobaczysz listę osób, którym
                    zmienią się statusy kursów.
                  </Text>

                  {reorderError && <Alert variant="error">{reorderError}</Alert>}

                  {order.length === 0 ? (
                    <Text tone="muted">
                      Żaden kurs nie ma jeszcze pozycji w ścieżce.
                    </Text>
                  ) : (
                    <Stack as="ol" gap="tight">
                      {order.map((course, index) => (
                        <Inset as="li" layout="row" key={course.id}>
                          <Text>
                            <strong>{index + 1}.</strong> {course.title}
                          </Text>
                          <MoveButtons
                            label={course.title}
                            index={index}
                            count={order.length}
                            onMove={move}
                          />
                        </Inset>
                      ))}
                    </Stack>
                  )}

                  <ActionRow>
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
                      variant="secondary"
                      onClick={requestPreview}
                      loading={previewing}
                      disabled={order.length < 2}
                    >
                      Sprawdź wpływ zmiany
                    </Button>
                  </ActionRow>
                </Stack>
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
