import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LekcjaAdmin, StanNagrania, ZlecenieWgrania } from "@/nowy-front/lekcja-edycja/dane";
import { przygotujUkladDlaEdytora } from "@/nowy-front/lekcja-edycja/__tests__/pomoc-edytora";

/**
 * Strona lekcji prowadzącego po włączeniu sekcji nagrania (stała
 * `NAGRANIE_PROWADZACEGO` podmieniona na `true` tylko w tym pliku): karta
 * „Nagranie” bez zdania o roli, stan nagrania i zlecenie wgrania trasami
 * prowadzącego. Dostawca nagrań jest atrapą `fetch` — żadne żądanie nie
 * wychodzi poza próbę.
 */

vi.mock("@/nowy-front/rola-kursu/nagranie-prowadzacego", () => ({ NAGRANIE_PROWADZACEGO: true }));

const api = vi.fn();
const pobierzJa = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...argumenty: unknown[]) => api(...argumenty) };
});

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...argumenty: unknown[]) => pobierzJa(...argumenty),
}));

const { LekcjaEdycja } = await import("@/nowy-front/lekcja-edycja/LekcjaEdycja");
const { uchwytWysylania } = await import("@/nowy-front/wysylanie-nagrania/uchwyt");

const LEKCJA: LekcjaAdmin = {
  id: 21,
  course_id: 4,
  title: "Wprowadzenie do wywiadu",
  description: "Krótki opis",
  content: "## Cel lekcji\n\nPierwszy akapit.",
  sequence_order: 1,
  topic_id: 7,
  topic_position: 1,
  video_provider_id: null,
  duration_seconds: 1800,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

const BRAK_NAGRANIA: StanNagrania = { status: "no_video" };

const ZLECENIE: ZlecenieWgrania = {
  video_id: "vid-1",
  upload_url: "https://video.test/tusupload",
  library_id: "77",
  expiration_time: 1790000000,
  signature: "sig",
};

function ustawApi(stan: StanNagrania = BRAK_NAGRANIA) {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: "instructor" });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    const metoda = opcje?.method ?? "GET";
    if (metoda === "GET" && sciezka === "/instructor/courses/4/lessons") return [LEKCJA];
    if (metoda === "GET" && sciezka === "/instructor/lessons/21/video-status") return stan;
    if (metoda === "POST" && sciezka === "/instructor/lessons/21/video-uploads") return ZLECENIE;
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
}

function wywolania(metoda: string, sciezka: string) {
  return api.mock.calls.filter(
    ([adres, opcje]) => adres === sciezka && ((opcje as { method?: string } | undefined)?.method ?? "GET") === metoda,
  );
}

function sciezkiAdministracji(): string[] {
  return api.mock.calls.map(([sciezka]) => sciezka as string).filter((sciezka) => sciezka.startsWith("/admin/"));
}

async function renderujStrone(stan?: StanNagrania) {
  ustawApi(stan);
  const wynik = render(<LekcjaEdycja rola="instructor" idLekcji={21} idKursu={4} />);
  await screen.findByLabelText(/^Tytuł lekcji/);
  return wynik;
}

beforeAll(przygotujUkladDlaEdytora);

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  vi.unstubAllGlobals();
  uchwytWysylania.porzuc(21);
});

describe("strona lekcji prowadzącego z włączonym nagraniem", () => {
  it("karta „Nagranie” jest, bez zdania o roli; stan nagrania z trasy prowadzącego", async () => {
    const { container } = await renderujStrone();

    const karta = screen.getByRole("heading", { level: 2, name: "Nagranie" }).closest("section")!;
    expect(karta).not.toBeNull();
    expect(screen.queryByText(/Nagranie może wgrać/)).toBeNull();
    expect(container.querySelector('input[type="file"][id$="-nagranie-plik"]')).not.toBeNull();
    await waitFor(() => expect(wywolania("GET", "/instructor/lessons/21/video-status").length).toBeGreaterThan(0));
    expect(sciezkiAdministracji()).toEqual([]);
    // Karta plików lekcji zostaje pominięta — zaplecze nie ma listy plików lekcji prowadzącego.
    expect(container.querySelector('input[type="file"][id$="-plik-materialu"]')).toBeNull();
  });

  it("zlecenie wgrania idzie trasą prowadzącego z samym tytułem, potem wysyłka do atrapy dostawcy", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujStrone();
    const przetwarzane: StanNagrania = { status: "processing", duration_seconds: 0, preview_embed_url: "https://x.test/e" };
    ustawApi(przetwarzane);
    const dostawca = vi.fn(async (_adres: string, opcje: { method: string }) =>
      opcje.method === "POST"
        ? new Response(null, { status: 201, headers: { Location: "https://video.test/tusupload/abc" } })
        : new Response(null, { status: 204, headers: { "Upload-Offset": "5" } }),
    );
    vi.stubGlobal("fetch", dostawca);

    const wejscie = container.querySelector<HTMLInputElement>('input[type="file"][id$="-nagranie-plik"]')!;
    await uzytkownik.upload(wejscie, new File(["12345"], "nagranie.mp4", { type: "video/mp4" }));

    await waitFor(() => expect(container.querySelector('[data-stan-nagrania="przetwarzanie"]')).not.toBeNull());
    const zlecenia = wywolania("POST", "/instructor/lessons/21/video-uploads");
    expect(zlecenia).toHaveLength(1);
    expect((zlecenia[0][1] as { body: unknown }).body).toEqual({ title: "Wprowadzenie do wywiadu" });
    expect(dostawca).toHaveBeenCalledTimes(2);
    for (const [adres] of dostawca.mock.calls) expect(String(adres)).toMatch(/^https:\/\/video\.test\//);
    expect(sciezkiAdministracji()).toEqual([]);
    const karta = screen.getByRole("heading", { level: 2, name: "Nagranie" }).closest("section")!;
    expect(within(karta).getByText("Możesz wszystko zamknąć – nagranie przetworzy się samo.")).toBeInTheDocument();
  });
});
