"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import {
  ApiError,
  downloadAdminUsersCsv,
  fetchAdminUsers,
  type AdminUserListItem,
  type PaginationMeta,
} from "@/lib/api";
import { ROLE_LABELS } from "@/lib/h18/labels";

interface Loaded {
  key: string;
  rows: AdminUserListItem[];
  meta?: PaginationMeta;
}

export default function AdminUsersList() {
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState({ role: "", search: "" });
  const [page, setPage] = useState(1);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
    null,
  );

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const key = JSON.stringify({ ...applied, page });

  useEffect(() => {
    let active = true;
    fetchAdminUsers({ ...applied, page, per_page: 25 })
      .then(({ data, meta }) => {
        if (active) setLoaded({ key, rows: data, meta });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFailed({
          key,
          message:
            err instanceof ApiError
              ? err.message
              : "Nie udało się wczytać listy osób.",
        });
      });
    return () => {
      active = false;
    };
  }, [applied, page, key]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setPage(1);
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

  const showError = failed?.key === key;
  const showData = loaded?.key === key;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h2 font-black text-ink">
            Uczestniczki i uczestnicy
          </h1>
          <p className="mt-2 text-body text-muted">
            Filtruj po roli, szukaj po imieniu, nazwisku lub adresie e-mail.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv} loading={downloading}>
          Eksport CSV
        </Button>
      </div>

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

      {showError ? (
        <Alert variant="error">{failed.message}</Alert>
      ) : !showData ? (
        <p role="status" className="text-body text-muted">
          Wczytywanie listy…
        </p>
      ) : (
        <>
          <Table
            columns={columns}
            rows={loaded.rows}
            rowKey={(row) => row.id}
            caption="Lista osób w programie"
            emptyMessage="Brak osób spełniających kryteria."
          />
          {loaded.meta && loaded.meta.last_page > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
              >
                Poprzednia
              </Button>
              <span className="text-small text-subtle">
                Strona {loaded.meta.current_page} z {loaded.meta.last_page}
              </span>
              <Button
                variant="secondary"
                disabled={page >= loaded.meta.last_page}
                onClick={() => setPage((v) => v + 1)}
              >
                Następna
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
