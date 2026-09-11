"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate from "@/components/templates/ListTemplate";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import {
  ApiError,
  downloadAdminUsersCsv,
  fetchAdminUsers,
  type AdminUserListItem,
} from "@/lib/api";
import { ROLE_LABELS } from "@/lib/h18/labels";

interface Filtry {
  role: string;
  search: string;
}

const PUSTE_FILTRY: Filtry = { role: "", search: "" };

/**
 * Lista osób w administracji (H18), na `ListTemplate` (C2 wariant C).
 * 403 na 403 → `forbidden` idzie przez `httpStatus` z haka i `ListTemplate`
 * (jeden mechanizm dla wszystkich ekranów, nie kopia na tym jednym).
 */
export default function AdminUsersList() {
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState<Filtry>(PUSTE_FILTRY);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const pobierz = useCallback(
    (strona: number) => fetchAdminUsers({ ...applied, page: strona, per_page: 25 }),
    [applied],
  );

  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<AdminUserListItem>(
    pobierz,
    [applied],
    "Nie udało się wczytać listy osób.",
  );

  const dane = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && dane.length === 0;

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    ustawStrone(1);
    setApplied({ role, search: search.trim() });
  }

  async function exportCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadAdminUsersCsv(applied);
    } catch (err) {
      setDownloadError(
        err instanceof ApiError ? err.message : "Nie udało się pobrać pliku CSV.",
      );
    } finally {
      setDownloading(false);
    }
  }

  const columns: Column<AdminUserListItem>[] = [
    {
      key: "name",
      header: "Osoba",
      render: (row) => (
        <Link
          href={`/admin/uczestniczki/${row.id}`}
          className="font-medium text-primary underline underline-offset-4"
        >
          {row.first_name} {row.last_name}
        </Link>
      ),
    },
    { key: "email", header: "E-mail", render: (row) => row.email },
    {
      key: "role",
      header: "Rola",
      render: (row) => ROLE_LABELS[row.role] ?? row.role,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "blocked" ? "danger" : "success"}>
          {row.status === "blocked" ? "Zablokowana" : "Aktywna"}
        </Badge>
      ),
    },
  ];

  return (
    <ListTemplate
      naglowek={{
        title: "Uczestniczki i uczestnicy",
        description: "Filtruj po roli, szukaj po imieniu, nazwisku lub adresie e-mail.",
        action: (
          <Button variant="secondary" onClick={exportCsv} loading={downloading}>
            Eksport CSV
          </Button>
        ),
      }}
      stan={listaPusta ? "empty" : stan.status}
      httpStatus={stan.status === "error" ? stan.httpStatus : undefined}
      komunikatLadowania="Wczytywanie listy…"
      komunikatBledu={stan.status === "error" ? stan.message : undefined}
      komunikatBleduTytul=""
      onPonow={ponow}
      pustyTytul="Brak osób spełniających kryteria."
      paginacja={
        meta ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone } : undefined
      }
      dodatkowyPanel={
        <>
          {downloadError && <Alert variant="error">{downloadError}</Alert>}
          <form
            onSubmit={applyFilters}
            className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end"
          >
            <Select
              label="Rola"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">Wszystkie role</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              label="Szukaj"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="np. Kowalska albo demo@"
            />
            <Button type="submit">Filtruj</Button>
          </form>
        </>
      }
    >
      <Table
        columns={columns}
        rows={dane}
        rowKey={(row) => row.id}
        caption="Lista osób w programie"
        emptyMessage="Brak osób spełniających kryteria."
      />
    </ListTemplate>
  );
}
