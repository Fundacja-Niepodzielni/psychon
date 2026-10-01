import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

/** Wspólne pomoce prób ekranu „Publikacja kursu”. */
export const KORZEN_ZAPLECZA = join(process.cwd(), "..", "backend");

export function kluczeZasobuKursu(): string[] {
  const zrodlo = readFileSync(
    join(KORZEN_ZAPLECZA, "app/Http/Resources/H08/AdminCourseResource.php"),
    "utf-8",
  );
  return [...zrodlo.matchAll(/^\s+'([a-z_]+)' => /gm)].map((dopasowanie) => dopasowanie[1]);
}


export function kursZeSchematu(nadpisania: Record<string, unknown> = {}) {
  const wartosci: Record<string, unknown> = {
    id: 5,
    title: "Wywiad psychologiczny",
    slug: "wywiad-psychologiczny",
    description: null,
    type: "course",
    product_group: "psychon",
    sequence_order: 2,
    edition_id: 1,
    is_published: false,
    lessons_count: 3,
    materials_count: 1,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
    publication_gaps: { blocking: [], waiting: [] },
  };
  return Object.fromEntries(
    kluczeZasobuKursu().map((klucz) => [klucz, klucz in nadpisania ? nadpisania[klucz] : wartosci[klucz]]),
  );
}


export function atrapaFetch(status: number, cialo: unknown) {
  const fetchMock = vi.fn(async (adres: RequestInfo | URL) => {
    if (String(adres).includes("/api/auth/session")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: "token-test", expiresAt: Date.now() + 600_000 }),
      };
    }
    return { ok: status >= 200 && status < 300, status, json: async () => cialo };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function wywolaniaApi(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    (wywolanie: unknown[]) => !String(wywolanie[0]).includes("/api/auth/session"),
  ) as [RequestInfo | URL, RequestInit | undefined][];
}

/** Sprawdza ciało zapisu publikacji: dokładnie jedno pole, prawdziwa wartość logiczna. */
export function cialoPublikacji(surowe: unknown, oczekiwane: boolean): boolean {
  if (typeof surowe !== "string") return false;
  const zdekodowane = JSON.parse(surowe) as Record<string, unknown>;
  const klucze = Object.keys(zdekodowane);
  return klucze.length === 1 && klucze[0] === "is_published" && zdekodowane.is_published === oczekiwane;
}
