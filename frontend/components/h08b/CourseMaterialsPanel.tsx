"use client";

import { useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Table, { type Column } from "@/components/ui/Table";
import { api, ApiError } from "@/lib/api";
import type { AdminMaterial } from "@/lib/h08/types";
import type {
  AdminCoursesSlot,
  AdminCoursesSlotProps,
} from "@/lib/slots/admin-courses";

/** Lista rozszerzeń zgodna z regułą `mimes` w `StoreMaterialRequest` (H08b). */
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg";

const HINT =
  "Dozwolone formaty: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG. Maksymalnie 10 MB.";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} kB`;

  return `${(kilobytes / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Materiały kursu albo lekcji (pakiet H08b) — wchodzi w region
 * „course-materials" ekranu `#/admin/kursy`, którego właścicielem jest H08a.
 *
 * Renderuje się także wewnątrz formularza lekcji, więc nie może zawierać
 * własnego `<form>` (zagnieżdżone formularze to niepoprawny HTML) — wysyłkę
 * uruchamia przycisk, nie `submit`.
 *
 * Tabela pokazuje materiały wgrane w tej sesji: kontrakt H08b rejestruje
 * wyłącznie upload i usunięcie, więc panel nie ma skąd odczytać wcześniej
 * zapisanych plików. Ich liczbę bierzemy z `materials_count` zasobu.
 */
export function CourseMaterialsPanel({ course, lesson }: AdminCoursesSlotProps) {
  const [materials, setMaterials] = useState<AdminMaterial[]>([]);
  const [selected, setSelected] = useState<File | null>(null);
  /** Zmiana klucza remontuje pole pliku — to jedyny sposób, żeby je wyczyścić. */
  const [fieldKey, setFieldKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const uploadPath = lesson
    ? `/admin/lessons/${lesson.id}/materials`
    : `/admin/courses/${course.id}/materials`;
  const scope = lesson ? `lekcji „${lesson.title}"` : `kursu „${course.title}"`;
  const storedCount = lesson ? lesson.materials_count : course.materials_count;

  async function upload() {
    if (!selected) {
      setFileError("Wskaż plik do wgrania.");
      return;
    }

    setUploading(true);
    setFileError(null);
    setActionError(null);

    const body = new FormData();
    body.append("file", selected);

    try {
      const created = await api<AdminMaterial>(uploadPath, {
        method: "POST",
        body,
      });
      setMaterials((prev) => [...prev, created]);
      setSelected(null);
      setFieldKey((value) => value + 1);
    } catch (err) {
      // 422 renderujemy przy polu pliku — walidacja typu i rozmiaru jest
      // jedynym błędem, który użytkownik potrafi sam naprawić.
      setFileError(
        err instanceof ApiError
          ? (err.errors?.file?.[0] ?? err.message)
          : "Nie udało się wgrać pliku. Spróbuj ponownie.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function remove(material: AdminMaterial) {
    if (
      !window.confirm(
        `Usunąć materiał „${material.name}"? Pliku nie da się przywrócić.`,
      )
    ) {
      return;
    }

    setActionError(null);

    try {
      await api<{ id: number; deleted: boolean }>(
        `/admin/materials/${material.id}`,
        { method: "DELETE" },
      );
      setMaterials((prev) => prev.filter((item) => item.id !== material.id));
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Nie udało się usunąć materiału.",
      );
    }
  }

  const columns: Column<AdminMaterial>[] = [
    { key: "name", header: "Nazwa", render: (row) => row.name },
    { key: "mime", header: "Typ", render: (row) => row.mime ?? "—" },
    { key: "size", header: "Rozmiar", render: (row) => formatSize(row.size) },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <Button
          variant="ghost"
          onClick={() => remove(row)}
          aria-label={`Usuń materiał: ${row.name}`}
        >
          Usuń
        </Button>
      ),
    },
  ];

  return (
    <Card title={`Materiały ${scope}`}>
      <div className="flex flex-col gap-4">
        {actionError && <Alert variant="error">{actionError}</Alert>}

        <p className="text-small text-muted">
          Uczestniczki i uczestnicy pobierają materiały ze strony kursu
          podpisanym, wygasającym linkiem.
          {storedCount > 0 &&
            ` Zapisanych wcześniej materiałów: ${storedCount}.`}
        </p>

        <Table
          columns={columns}
          rows={materials}
          rowKey={(row) => row.id}
          caption={`Materiały wgrane w tej sesji do ${scope}`}
          emptyMessage="Nie wgrano jeszcze żadnego materiału w tej sesji."
        />

        <div className="flex flex-wrap items-end gap-3">
          <Input
            key={fieldKey}
            label="Plik materiału"
            type="file"
            accept={ACCEPT}
            hint={HINT}
            error={fileError ?? undefined}
            className="grow"
            onChange={(event) => {
              setSelected(event.target.files?.[0] ?? null);
              setFileError(null);
            }}
          />
          <Button onClick={upload} loading={uploading} disabled={!selected}>
            Wgraj materiał
          </Button>
        </div>
      </div>
    </Card>
  );
}

const slot: AdminCoursesSlot = {
  id: "h08b-course-materials",
  region: "course-materials",
  order: 100,
  Component: CourseMaterialsPanel,
};

export default slot;
