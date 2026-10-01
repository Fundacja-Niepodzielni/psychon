import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LekcjaAdmin, MaterialAdmin, StanNagrania } from "../dane";

/**
 * Ekran lekcji pod adresem z kursem w ścieżce:
 *  - okruszki niosą nazwę kursu i prowadzą do listy kursów oraz do kursu;
 *  - lekcja spoza kursu z adresu to stan „nie znaleziono” bez jej danych;
 *  - materiał lekcji wgrany na ekranie da się z niego usunąć (potwierdzenie,
 *    jedno żądanie, fokus zostaje na ekranie), a odmowa serwera zostawia plik.
 */

const api = vi.fn();
const pobierzJa = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
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

const LEKCJA: LekcjaAdmin = {
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
  materials_count: 2,
  created_at: null,
  updated_at: null,
};

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

type Odpowiedz = (sciezka: string, metoda: string) => unknown;

/** Atrapa API: trasy odczytu ekranu; `dodatkowe` odpowiada pierwsze (wartość `undefined` = nie ta trasa). */
function ustawApi(dodatkowe: Odpowiedz = () => undefined, kurs: (() => unknown) | null = () => ({ id: 3, title: "Wywiad psychologiczny" })) {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: "project_manager" });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    const metoda = opcje?.method ?? "GET";
    const wlasna = dodatkowe(sciezka, metoda);
    if (wlasna instanceof Error) throw wlasna;
    if (wlasna !== undefined) return wlasna;
    if (metoda === "GET" && sciezka === "/admin/courses/3" && kurs) return kurs();
    if (metoda === "GET" && sciezka === "/admin/courses/3/lessons") return [LEKCJA];
    if (metoda === "GET" && sciezka === "/admin/lessons/21/video-status") return BRAK_NAGRANIA;
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
}

function sciezki(): string[] {
  return api.mock.calls.map(([adres, opcje]) => `${(opcje as { method?: string } | undefined)?.method ?? "GET"} ${adres as string}`);
}

function okruszki(): HTMLElement {
  return screen.getByRole("navigation", { name: /okruszki|ścieżka/i });
}

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  push.mockReset();
});

describe("okruszki ekranu lekcji pod adresem z kursem w ścieżce", () => {
  it("Kursy → nazwa kursu → Lekcja; dwa pierwsze są odnośnikami", async () => {
    ustawApi();
    render(<LekcjaEdycja idLekcji={21} idKursu={3} zNazwaKursu />);
    await screen.findByLabelText(/^Tytuł lekcji/);

    const nawigacja = okruszki();
    expect(within(nawigacja).getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/admin/kursy");
    expect(await within(nawigacja).findByRole("link", { name: "Wywiad psychologiczny" })).toHaveAttribute(
      "href",
      "/admin/kursy/3",
    );
    expect(within(nawigacja).getByText("Lekcja")).toBeInTheDocument();
  });

  it("odczyt nazwy kursu się nie udał: ekran lekcji działa, okruszek kursu ma nazwę zastępczą i prowadzi do kursu", async () => {
    ustawApi(undefined, () => {
      throw new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." });
    });
    render(<LekcjaEdycja idLekcji={21} idKursu={3} zNazwaKursu />);
    await screen.findByLabelText(/^Tytuł lekcji/);

    expect(within(okruszki()).getByRole("link", { name: "Tematy i lekcje" })).toHaveAttribute("href", "/admin/kursy/3");
  });

  it("powrót i sąsiednia lekcja prowadzą pod adresy z kursem w ścieżce", async () => {
    ustawApi((sciezka, metoda) =>
      metoda === "GET" && sciezka === "/admin/courses/3/lessons"
        ? [LEKCJA, { ...LEKCJA, id: 22, title: "Druga lekcja", sequence_order: 2 }]
        : undefined,
    );
    render(<LekcjaEdycja idLekcji={21} idKursu={3} zNazwaKursu />);
    await screen.findByLabelText(/^Tytuł lekcji/);

    expect(screen.getByRole("link", { name: "← Wróć do kursu" })).toHaveAttribute("href", "/admin/kursy/3");
    expect(screen.getByRole("link", { name: "Następna lekcja: Druga lekcja" })).toHaveAttribute(
      "href",
      "/admin/kursy/3/lekcje/22",
    );
  });

  it("okruszek przy niezapisanym tekście pyta tym samym oknem; bez zmian przechodzi od razu", async () => {
    ustawApi();
    const uzytkownik = userEvent.setup();
    render(<LekcjaEdycja idLekcji={21} idKursu={3} zNazwaKursu />);
    await screen.findByLabelText(/^Tytuł lekcji/);

    await uzytkownik.click(within(okruszki()).getByRole("link", { name: "Kursy" }));
    expect(push).toHaveBeenCalledWith("/admin/kursy");
    expect(screen.queryByRole("dialog")).toBeNull();

    push.mockReset();
    fireEvent.change(screen.getByLabelText(/^Tytuł lekcji/), { target: { value: "Zmieniony tytuł" } });
    await uzytkownik.click(within(okruszki()).getByRole("link", { name: "Kursy" }));
    const okno = await screen.findByRole("dialog", { name: "Zapisać zmiany przed przejściem?" });
    expect(push).not.toHaveBeenCalled();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Przejdź bez zapisu" }));
    expect(push).toHaveBeenCalledWith("/admin/kursy");
  });

  it("trasa podglądu (bez nazwy kursu) nie czyta kursu i zostawia okruszki jak dotąd", async () => {
    ustawApi(undefined, null);
    render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByLabelText(/^Tytuł lekcji/);

    expect(sciezki()).not.toContain("GET /admin/courses/3");
    expect(within(okruszki()).queryByRole("link", { name: "Kursy" })).toBeNull();
  });
});

describe("lekcja spoza kursu z adresu", () => {
  it("stan „Nie znaleziono lekcji”, okruszki z nazwą kursu, żadnego żądania o cudzą lekcję i żadnych jej danych", async () => {
    ustawApi();
    render(<LekcjaEdycja idLekcji={99} idKursu={3} zNazwaKursu />);

    expect(await screen.findByRole("heading", { name: "Nie znaleziono lekcji" })).toBeInTheDocument();
    expect(await within(okruszki()).findByRole("link", { name: "Wywiad psychologiczny" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();
    expect(sciezki().filter((wpis) => wpis.includes("/lessons/99"))).toEqual([]);
    expect(sciezki().sort()).toEqual(["GET /admin/courses/3", "GET /admin/courses/3/lessons"]);
  });
});

describe("usunięcie pliku lekcji wgranego na ekranie", () => {
  async function wgrajMaterial(dodatkowe: Odpowiedz = () => undefined) {
    ustawApi((sciezka, metoda) => {
      if (metoda === "POST" && sciezka === "/admin/lessons/21/materials") return WGRANY;
      return dodatkowe(sciezka, metoda);
    });
    const uzytkownik = userEvent.setup();
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} zNazwaKursu />);
    await screen.findByLabelText(/^Tytuł lekcji/);
    const wejscie = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await uzytkownik.upload(wejscie, new File(["%PDF"], "karta.pdf", { type: "application/pdf" }));
    await screen.findByText("Wgrano plik „karta.pdf”.");
    expect(screen.getByText("Ta lekcja ma 3 materiały.")).toBeInTheDocument();
    return { uzytkownik, container };
  }

  it("„Usuń” pyta; potwierdzenie wysyła jedno DELETE, plik znika, licznik wraca, fokus zostaje na ekranie", async () => {
    const { uzytkownik } = await wgrajMaterial((sciezka, metoda) =>
      metoda === "DELETE" && sciezka === "/admin/materials/9" ? { id: 9, deleted: true } : undefined,
    );

    await uzytkownik.click(screen.getByRole("button", { name: "Usuń plik karta.pdf" }));
    expect(sciezki()).not.toContain("DELETE /admin/materials/9");
    await uzytkownik.click(
      within(screen.getByRole("dialog", { name: "Usunąć plik „karta.pdf”?" })).getByRole("button", { name: "Usuń plik" }),
    );

    await waitFor(() => expect(screen.getByText("Ta lekcja ma 2 materiały.")).toBeInTheDocument());
    expect(sciezki().filter((wpis) => wpis === "DELETE /admin/materials/9")).toHaveLength(1);
    expect(screen.queryByRole("list", { name: "Pliki dodane teraz" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Usuń plik karta.pdf" })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveAttribute("role", "button");
    expect(document.activeElement?.id).toMatch(/-plik-materialu-obszar$/);
  });

  it("„Anuluj” w oknie nie wysyła żądania i zostawia plik", async () => {
    const { uzytkownik } = await wgrajMaterial();

    await uzytkownik.click(screen.getByRole("button", { name: "Usuń plik karta.pdf" }));
    await uzytkownik.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Anuluj" }));

    expect(sciezki()).not.toContain("DELETE /admin/materials/9");
    expect(screen.getByRole("button", { name: "Usuń plik karta.pdf" })).toBeInTheDocument();
    expect(screen.getByText("Ta lekcja ma 3 materiały.")).toBeInTheDocument();
  });

  it("odmowa serwera 403: komunikat po polsku, plik i licznik zostają", async () => {
    const { uzytkownik } = await wgrajMaterial((sciezka, metoda) =>
      metoda === "DELETE" && sciezka === "/admin/materials/9"
        ? new ApiError({ status: 403, code: "forbidden", message: "This action is unauthorized." })
        : undefined,
    );

    await uzytkownik.click(screen.getByRole("button", { name: "Usuń plik karta.pdf" }));
    await uzytkownik.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń plik" }));

    expect(await screen.findByText("Usunięcie materiału nie jest dostępne dla Twojej roli.")).toBeInTheDocument();
    expect(screen.queryByText(/unauthorized/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Usuń plik karta.pdf" })).toBeInTheDocument();
    expect(screen.getByText("Ta lekcja ma 3 materiały.")).toBeInTheDocument();
  });
});
