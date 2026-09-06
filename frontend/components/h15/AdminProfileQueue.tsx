"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { apiPaged, ApiError, type PaginationMeta } from "@/lib/api";
import type { AdminPsychologistProfile } from "@/lib/h15/types";

export default function AdminProfileQueue() {
  const [profiles, setProfiles] = useState<AdminPsychologistProfile[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiPaged<AdminPsychologistProfile>(`/admin/profiles?page=${page}&per_page=25`)
      .then(({ data, meta: responseMeta }) => {
        if (cancelled) return;
        setProfiles(data);
        setMeta(responseMeta);
        setError(null);
        setLoadedPage(page);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof ApiError ? reason.message : "Nie udało się wczytać kolejki.");
        setLoadedPage(page);
      });
    return () => { cancelled = true; };
  }, [page, reload]);

  const loading = loadedPage !== page && error === null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-black text-ink">Profile psychologów</h1>
        <p className="mt-2 text-body text-muted">Wnioski oczekujące na weryfikację.</p>
      </div>
      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" onClick={() => { setError(null); setLoadedPage(null); setReload((value) => value + 1); }}>
              Spróbuj ponownie
            </Button>
          </div>
        </Alert>
      )}
      {loading ? (
        <p className="rounded-md border border-line bg-card px-4 py-8 text-center text-body text-subtle" role="status">
          Wczytywanie kolejki…
        </p>
      ) : !error && profiles.length === 0 ? (
        <Card><p className="text-body text-muted">Brak wniosków oczekujących na decyzję.</p></Card>
      ) : !error ? (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <Card key={profile.id} title={`${profile.user.first_name} ${profile.user.last_name}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-small text-muted">{profile.city ?? "—"} · {profile.approach ?? "—"}</p>
                  <p className="text-small text-muted">Załączniki: {profile.documents.length}</p>
                </div>
                <Badge variant="info">Oczekuje na weryfikację</Badge>
              </div>
              <div className="mt-4">
                <Link href={`/admin/profile/${profile.id}`}>
                  <Button variant="secondary">Zobacz szczegóły</Button>
                </Link>
              </div>
            </Card>
          ))}
          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Poprzednia</Button>
              <span className="text-small text-subtle">Strona {meta.current_page} z {meta.last_page}</span>
              <Button variant="secondary" disabled={page >= meta.last_page} onClick={() => setPage((value) => Math.min(meta.last_page, value + 1))}>Następna</Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
