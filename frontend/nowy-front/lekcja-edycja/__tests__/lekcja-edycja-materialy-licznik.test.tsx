import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LekcjaAdmin, MaterialAdmin, StanNagrania } from "../dane";

/**
 * Karta „Pliki do tej lekcji” strony lekcji:
 *  - licznik materiałów pochodzi z zaplecza (`materials_count` lekcji) i ma
 *    poprawną formę liczby;
 *  - lekcja z materiałami wgranymi wcześniej nie wygląda jak pusta: ekran mówi
 *    jednym zdaniem, że ich lista pojawi się w kolejnym kroku;
 *  - licznik 0 to stan pusty, bez tego zdania;
 *  - wgrany plik widać raz: jeden wiersz z nazwą i „Usuń”; wiersz stanu jest
 *    tylko w trakcie wgrywania albo przy błędzie.
 */

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

const { ApiError } = await import("@/lib/api/klient");
const { LekcjaEdycja } = await import("../LekcjaEdycja");

function lekcja(liczbaMaterialow: number): LekcjaAdmin {
  return {
    id: 21,
    course_id: 3,
    title: "Wprowadzenie do wywiadu",
    description: null,
    content: null,
    sequence_order: 1,
    topic_id: 7,
    topic_position: 1,
    video_provider_id: null,
    duration_seconds: 1800,
    materials_count: liczbaMaterialow,
    created_at: null,
    updated_at: null,
  };
}

const BRAK_NAGRANIA: StanNagrania = { status: "no_video" };

const WGRANY: MaterialAdmin = {
  id: 9,
  name: "karta.pdf",
  mime: "application/pdf",
  size: 4,
  lesson_id: 21,
  course_id: null,
  created_at: null,
};

const ZDANIE_O_LISCIE =
  "Lista wcześniej wgranych materiałów pojawi się tu w kolejnym kroku — na razie widać tylko pliki dodane teraz.";

type Wgranie = () => unknown;

async function renderEkranu(liczbaMaterialow: number, wgranie: Wgranie = () => WGRANY) {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: "project_manager" });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    const metoda = opcje?.method ?? "GET";
    if (metoda === "GET" && sciezka === "/admin/courses/3/lessons") return [lekcja(liczbaMaterialow)];
    if (metoda === "GET" && sciezka === "/admin/lessons/21/video-status") return BRAK_NAGRANIA;
    if (metoda === "POST" && sciezka === "/admin/lessons/21/materials") {
      const wynik = wgranie();
      if (wynik instanceof Error) throw wynik;
      return wynik;
    }
    if (metoda === "DELETE" && sciezka === "/admin/materials/9") return { id: 9, deleted: true };
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
  const uzytkownik = userEvent.setup();
  const wynik = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
  await screen.findByLabelText(/^Tytuł lekcji/);
  return { ...wynik, uzytkownik };
}

function sekcja(): HTMLElement {
  return screen.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" }).closest("section")!;
}

async function wgraj(container: HTMLElement, uzytkownik: ReturnType<typeof userEvent.setup>, nazwa = "karta.pdf") {
  const wejscie = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await uzytkownik.upload(wejscie, new File(["%PDF"], nazwa, { type: "application/pdf" }));
}

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
});

describe("licznik materiałów lekcji i zdanie o wcześniej wgranych", () => {
  it("licznik 3: zdanie z liczbą i zdanie o liście; nie ma stanu pustego", async () => {
    await renderEkranu(3);

    expect(within(sekcja()).getByText("Ta lekcja ma 3 materiały.")).toBeInTheDocument();
    expect(within(sekcja()).getByText(ZDANIE_O_LISCIE)).toBeInTheDocument();
    expect(within(sekcja()).queryByText("Ta lekcja nie ma jeszcze materiałów.")).toBeNull();
    expect(within(sekcja()).queryByText(/Brak materiałów/)).toBeNull();
  });

  it("licznik 0: stan pusty, bez zdania o liście", async () => {
    await renderEkranu(0);

    expect(within(sekcja()).getByText("Ta lekcja nie ma jeszcze materiałów.")).toBeInTheDocument();
    expect(within(sekcja()).queryByText(ZDANIE_O_LISCIE)).toBeNull();
    expect(within(sekcja()).queryByText(/^Ta lekcja ma /)).toBeNull();
  });

  it.each([
    [1, "Ta lekcja ma 1 materiał."],
    [2, "Ta lekcja ma 2 materiały."],
    [4, "Ta lekcja ma 4 materiały."],
    [5, "Ta lekcja ma 5 materiałów."],
    [12, "Ta lekcja ma 12 materiałów."],
    [22, "Ta lekcja ma 22 materiały."],
    [25, "Ta lekcja ma 25 materiałów."],
  ])("licznik %i: forma liczby „%s”", async (liczba, zdanie) => {
    await renderEkranu(liczba);

    expect(within(sekcja()).getByText(zdanie)).toBeInTheDocument();
  });

  it("wgranie pliku przy liczniku 3 daje 4, a usunięcie go wraca do 3; zdanie o liście zostaje", async () => {
    const { container, uzytkownik } = await renderEkranu(3);

    await wgraj(container, uzytkownik);
    expect(await within(sekcja()).findByText("Ta lekcja ma 4 materiały.")).toBeInTheDocument();
    expect(within(sekcja()).getByText(ZDANIE_O_LISCIE)).toBeInTheDocument();

    await uzytkownik.click(screen.getByRole("button", { name: "Usuń plik karta.pdf" }));
    await uzytkownik.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń plik" }));
    await waitFor(() => expect(within(sekcja()).getByText("Ta lekcja ma 3 materiały.")).toBeInTheDocument());
    expect(within(sekcja()).getByText(ZDANIE_O_LISCIE)).toBeInTheDocument();
  });

  it("wgranie pierwszego pliku przy liczniku 0: „1 materiał”, bez zdania o wcześniejszych — cała lista jest na ekranie", async () => {
    const { container, uzytkownik } = await renderEkranu(0);

    await wgraj(container, uzytkownik);

    expect(await within(sekcja()).findByText("Ta lekcja ma 1 materiał.")).toBeInTheDocument();
    expect(within(sekcja()).queryByText(ZDANIE_O_LISCIE)).toBeNull();
    expect(within(sekcja()).queryByText("Ta lekcja nie ma jeszcze materiałów.")).toBeNull();
  });
});

describe("wgrany plik widać raz", () => {
  it("po udanym wgraniu dokładnie jeden element z nazwą pliku — wiersz z „Usuń”; ogłoszenie o wgraniu zostaje", async () => {
    const { container, uzytkownik } = await renderEkranu(3);

    await wgraj(container, uzytkownik);
    await screen.findByRole("button", { name: "Usuń plik karta.pdf" });

    expect(within(sekcja()).getAllByText("karta.pdf")).toHaveLength(1);
    expect(container.querySelector("[data-stan]")).toBeNull();
    const ogloszenie = within(sekcja()).getByRole("status");
    expect(ogloszenie).toHaveTextContent("Wgrano plik „karta.pdf”.");
  });

  it("wgranie trwa: wiersz stanu „Wgrywanie…”, jeszcze bez wiersza „Usuń”", async () => {
    let dokoncz: (material: MaterialAdmin) => void = () => undefined;
    const { container, uzytkownik } = await renderEkranu(3, () => new Promise<MaterialAdmin>((ok) => (dokoncz = ok)));

    await wgraj(container, uzytkownik);

    expect(await within(sekcja()).findByText("Wgrywanie…")).toBeInTheDocument();
    expect(container.querySelector("[data-stan='przetwarzanie']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Usuń plik karta.pdf" })).toBeNull();

    dokoncz(WGRANY);
    await screen.findByRole("button", { name: "Usuń plik karta.pdf" });
    expect(within(sekcja()).getAllByText("karta.pdf")).toHaveLength(1);
  });

  it("błąd wgrania: wiersz stanu z komunikatem, brak wiersza „Usuń”, licznik bez zmian", async () => {
    const { container, uzytkownik } = await renderEkranu(
      3,
      () =>
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { file: ["Plik może mieć najwyżej 10 MB."] },
        }),
    );

    await wgraj(container, uzytkownik, "duzy.pdf");

    expect(await within(sekcja()).findByText("Plik może mieć najwyżej 10 MB.")).toBeInTheDocument();
    expect(container.querySelector("[data-stan='blad']")).not.toBeNull();
    expect(within(sekcja()).getAllByText("duzy.pdf")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Usuń plik/ })).toBeNull();
    expect(within(sekcja()).getByText("Ta lekcja ma 3 materiały.")).toBeInTheDocument();
  });
});
