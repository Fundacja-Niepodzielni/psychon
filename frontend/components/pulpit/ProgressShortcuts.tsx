import Link from "next/link";
import type { CourseListItem } from "@/lib/courses";
import type { CertificateConditions } from "@/lib/pulpit/data";
import { LINK_CLASS } from "./styles";
import type { Aux } from "./useDashboardData";

/** Sekcja „Skróty postępu" — cztery kafle (etapy, bieżący etap, staż, superwizje). */
export default function ProgressShortcuts({
  stages,
  inProgress,
  conditions,
  isVolunteer,
}: {
  stages: CourseListItem[];
  inProgress: CourseListItem | null;
  conditions: Aux<CertificateConditions> | { status: "skipped" };
  isVolunteer: boolean;
}) {
  const completed = stages.filter((course) => course.status === "completed").length;

  const internship =
    conditions.status === "ok"
      ? conditions.data.conditions.find((c) => c.key === "internship")
      : undefined;
  const supervision =
    conditions.status === "ok"
      ? conditions.data.conditions.find((c) => c.key === "supervision")
      : undefined;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h3 font-bold text-ink">Skróty postępu</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Ukończone etapy"
          value={stages.length === 0 ? "—" : `${completed} / ${stages.length}`}
        />
        <StatTile
          label="Bieżący etap"
          value={inProgress ? `${inProgress.progress_percent}%` : "—"}
          caption={inProgress ? inProgress.title : "brak aktywnego etapu"}
        />

        {conditions.status === "ok" ? (
          <>
            <StatTile
              label="Godziny stażu"
              value={`${internship?.done ?? "0"} / ${internship?.required ?? "0"}`}
            />
            <StatTile
              label="Obecności na superwizjach"
              value={`${supervision?.done ?? "0"} / ${supervision?.required ?? "0"}`}
            />
          </>
        ) : conditions.status === "loading" ? (
          <>
            <StatTile label="Godziny stażu" value="…" />
            <StatTile label="Obecności na superwizjach" value="…" />
          </>
        ) : (
          <p className="col-span-2 flex items-center rounded-lg border border-line bg-card-warm p-6 text-small text-muted">
            {conditions.status === "error"
              ? "Nie udało się wczytać danych stażu i superwizji."
              : "Godziny stażu i obecności na superwizjach zobaczysz tutaj jako wolontariusz."}
          </p>
        )}
      </div>

      {isVolunteer && (
        <Link href="/panel/certyfikat" className={LINK_CLASS}>
          Zobacz warunki certyfikatu
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-card p-6 shadow-card">
      <p className="text-caption font-bold uppercase tracking-[0.06em] text-subtle">
        {label}
      </p>
      <p className="text-h3 font-black text-ink">{value}</p>
      {caption && <p className="text-caption text-muted">{caption}</p>}
    </div>
  );
}
