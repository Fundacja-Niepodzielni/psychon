import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Odpowiedź zaplecza sprzed dodania pól `course`, `question_addressee`,
 * `required_active_seconds`, `materials[].mime` i `has_test` nie może wywrócić
 * ekranu: elementy, które z tych pól wynikają, znikają albo wracają do stanu
 * neutralnego, a reszta lekcji działa.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("kurs=pierwsza-pomoc-psychologiczna"),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

const { Lekcja } = await import("../Lekcja");

/** Lekcja dokładnie w kształcie sprzed zmiany: bez nowych pól, z `video_status`. */
const LEKCJA_STARA = {
  id: 21,
  title: "Rozpoznawanie kryzysu psychicznego",
  description: "Opis lekcji",
  content: "Treść lekcji bez nowych pól.",
  topic: { id: 7, title: "Kryzys i jego przebieg", position: 1 },
  duration_seconds: 1200,
  watched_seconds: 720,
  active_seconds: 720,
  is_completed: false,
  completable: false,
  completable_at_percent: 80,
  video_status: "ready",
};

const KURS_STARY = {
  lessons: [
    { id: 21, title: "Rozpoznawanie kryzysu psychicznego", sequence_order: 1 },
    { id: 22, title: "Następna", sequence_order: 2 },
  ],
  materials: [{ id: 1, name: "Karta pracy.pdf", size: 245760, lesson_id: 21, download_url: "https://api.test/1" }],
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  push.mockReset();
  apiPaged.mockResolvedValue({ data: [] });
});

function odpowiedzi(lekcja: Record<string, unknown>, kurs: unknown) {
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka === "/lessons/21") return lekcja;
    if (sciezka === "/lessons/21/video-link") return { url: "https://nagrania.atrapa.test/a.m3u8", expires_at: 1, video_id: "w" };
    if (sciezka === "/courses/pierwsza-pomoc-psychologiczna") return kurs;
    throw new Error(`nieoczekiwane żądanie: ${sciezka}`);
  });
}

describe("odpowiedź bez nowych pól", () => {
  it("lekcja bez kursu, adresata i wymaganego czasu: ekran działa, kurs z adresu, wymagany czas z progu procentowego", async () => {
    odpowiedzi(LEKCJA_STARA, KURS_STARY);

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: LEKCJA_STARA.title })).toBeInTheDocument();
    // 80% z 1200 s = 960 s = 16 min; aktywne 720 s → brakuje 4 min.
    expect(await screen.findByText("Zostały 4 minuty nagrania.")).toBeInTheDocument();
    expect(screen.getByText("Pytanie widzisz tylko Ty i prowadzący.")).toBeInTheDocument();
    expect(screen.queryByText(/Odpowiada/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Treść lekcji" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pliki bez mime: rodzaj z rozszerzenia nazwy; kurs bez has_test: bez przejścia do testu", async () => {
    odpowiedzi({ ...LEKCJA_STARA, is_completed: true }, { ...KURS_STARY, lessons: [KURS_STARY.lessons[0]] });

    render(<Lekcja id="21" />);

    expect(await screen.findByText("PDF · 240 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do kursu" })).toBeInTheDocument();
    expect(screen.queryByText("Przejdź do testu")).toBeNull();
  });

  it("odczyt kursu bez tematów i bez pól lekcji: ekran lekcji cały, bez postępu w temacie", async () => {
    odpowiedzi(LEKCJA_STARA, { lessons: [{ id: 21, title: "L", sequence_order: 1 }] });

    render(<Lekcja id="21" />);

    expect(await screen.findByRole("heading", { level: 1, name: LEKCJA_STARA.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" })).toBeInTheDocument();
    expect(screen.queryByText(/lekcji ukończone/)).toBeNull();
  });

  it("odpowiedź bez wymaganego czasu i bez position_seconds: odtwarzacz startuje od 0", async () => {
    odpowiedzi(LEKCJA_STARA, KURS_STARY);

    const { container } = render(<Lekcja id="21" />);
    await screen.findByRole("heading", { level: 1, name: LEKCJA_STARA.title });

    expect(container.querySelector("[data-pozycja-startowa]")).toHaveAttribute("data-pozycja-startowa", "0");
    expect(screen.getByRole("button", { name: "Odtwórz nagranie" })).toBeInTheDocument();
  });
});
