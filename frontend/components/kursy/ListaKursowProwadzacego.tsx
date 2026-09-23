"use client";

import { useEffect, useState } from "react";
import TextLink from "@/components/ui/TextLink";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate from "@/components/templates/ListTemplate";
import { api, ApiError } from "@/lib/api";
import type { InstructorCourseSummary } from "@/lib/kursy/types";

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Lista kursów przypisanych prowadzącemu (poz. 11, D-27) — `GET
 * /instructor/courses` (`MyInstructorProfileController::courses`, H09) zwraca
 * wyłącznie kursy, do których prowadzący ma przypisanie (`CourseAssignment`),
 * więc ekran nie filtruje nic po swojej stronie.
 */
export default function ListaKursowProwadzacego() {
  const [reloadKey, setReloadKey] = useState(0);
  /** `null` = jeszcze nie wczytano (stan `loading`, dopóki nie ma też błędu). */
  const [kursy, setKursy] = useState<InstructorCourseSummary[] | null>(null);
  const [failed, setFailed] = useState<{
    key: number;
    message: string;
    status?: number;
  } | null>(null);

  useEffect(() => {
    let active = true;

    api<InstructorCourseSummary[]>("/instructor/courses")
      .then((data) => {
        if (!active) return;
        setKursy(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFailed({
          key: reloadKey,
          message: messageFrom(err, "Nie udało się wczytać listy kursów. Odśwież stronę."),
          status: err instanceof ApiError ? err.status : undefined,
        });
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const stan =
    failed?.key === reloadKey
      ? "error"
      : kursy === null
        ? "loading"
        : kursy.length === 0
          ? "empty"
          : "success";

  const columns: Column<InstructorCourseSummary>[] = [
    {
      key: "sequence_order",
      header: "Pozycja",
      render: (row) => row.sequence_order ?? "Poza ścieżką",
    },
    {
      key: "title",
      header: "Tytuł",
      render: (row) => (
        <TextLink href={`/prowadzacy/kursy/${row.id}`}>{row.title}</TextLink>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <TextLink
          href={`/prowadzacy/kursy/${row.id}`}
          aria-label={`Edytuj kurs: ${row.title}`}
        >
          Edytuj
        </TextLink>
      ),
    },
  ];

  return (
    <ListTemplate
      naglowek={{
        title: "Kursy",
        description: "Kursy, do których jesteś przypisany albo przypisana.",
      }}
      stan={stan}
      httpStatus={failed?.status}
      komunikatLadowania="Wczytywanie listy kursów…"
      komunikatBledu={failed?.message}
      onPonow={() => setReloadKey((value) => value + 1)}
      pustyTytul="Nie masz jeszcze żadnego przypisanego kursu."
    >
      <Table
        columns={columns}
        rows={kursy ?? []}
        rowKey={(row) => row.id}
        caption="Kursy przypisane do Ciebie"
        emptyMessage="Nie masz jeszcze żadnego przypisanego kursu."
      />
    </ListTemplate>
  );
}
