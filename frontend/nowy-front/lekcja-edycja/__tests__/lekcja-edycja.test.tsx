import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import type { CialoLekcji, LekcjaAdmin, MaterialAdmin, StanNagrania, ZlecenieWgrania } from "../dane";

/**
 * Ekran „Lekcja: treść, nagranie, materiały” (administracja): każdy stan
 * w szablonie formularza z jednym `main`, zapis treści bez przycinania,
 * licznik znaków, 422 na polu treści, materiały, nagranie dla obu ról
 * administracji, odmowa z powodu roli (403, 0 danych w DOM). Odpowiedź 401
 * w próbie jest błędem podanym wprost przez atrapę funkcji `api`: sprawdza,
 * że ekran i wtedy nie pokazuje danych. W produkcie 401 bez sesji nie dochodzi
 * do ekranu — wspólny klient przenosi wtedy na `/logowanie`.
 * Każda atrapa odpowiedzi serwera ma jawny typ z `../dane`, więc brak albo
 * obcy klucz w atrapie czerwieni `npm run sprawdz-typy`.
 */

const api = vi.fn();
const pobierzJa = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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
  description: "Krótki opis",
  content: "## Cel lekcji\n\nPierwszy akapit.",
  sequence_order: 1,
  topic_id: 7,
  topic_position: 1,
  video_provider_id: null,
  duration_seconds: 1800,
  materials_count: 2,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

const INNA_LEKCJA: LekcjaAdmin = { ...LEKCJA, id: 22, title: "Inna lekcja" };

const BRAK_NAGRANIA: StanNagrania = { status: "no_video" };

const GOTOWE_NAGRANIE: StanNagrania = { status: "finished", duration_seconds: 125, preview_embed_url: "https://x.test/e" };

interface Ustawienia {
  rola?: string;
  lekcje?: LekcjaAdmin[];
  nagranie?: StanNagrania;
  patch?: (cialo: CialoLekcji) => LekcjaAdmin;
}

/** Atrapa API: odpowiada na każdą z tras ekranu; reszta tras nie istnieje. */
function ustawApi({ rola = "super_admin", lekcje = [LEKCJA, INNA_LEKCJA], nagranie = BRAK_NAGRANIA, patch }: Ustawienia = {}) {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: rola });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: CialoLekcji }) => {
    const metoda = opcje?.method ?? "GET";
    if (metoda === "GET" && sciezka === "/admin/courses/3/lessons") return lekcje;
    if (metoda === "GET" && sciezka === "/admin/lessons/21/video-status") return nagranie;
    if (metoda === "PATCH" && sciezka === "/admin/lessons/21") {
      const cialo = opcje?.body;
      if (!cialo) throw new Error("Zapis bez ciała");
      return patch ? patch(cialo) : { ...LEKCJA, ...cialo };
    }
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
}

function wywolania(metoda: string, sciezka: string) {
  return api.mock.calls.filter(
    ([adres, opcje]) => adres === sciezka && ((opcje as { method?: string } | undefined)?.method ?? "GET") === metoda,
  );
}

async function renderujDane(ustawienia: Ustawienia = {}) {
  ustawApi(ustawienia);
  const wynik = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
  await screen.findByLabelText(/^Tytuł lekcji/);
  return wynik;
}

function przyciskiGlowne(kontener: HTMLElement): HTMLElement[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("button")).filter((przycisk) =>
    /primary/.test(przycisk.className),
  );
}

function pole(etykieta: RegExp): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByLabelText(etykieta) as HTMLInputElement | HTMLTextAreaElement;
}

function wejsciaPlikow(kontener: HTMLElement): HTMLInputElement[] {
  return Array.from(kontener.querySelectorAll<HTMLInputElement>('input[type="file"]'));
}

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  back.mockReset();
  vi.unstubAllGlobals();
});

describe("stany ekranu w szablonie formularza", () => {
  function szablon(kontener: HTMLElement) {
    expect(() => jedenMain(kontener)).not.toThrow();
    expect(kontener.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-formularz");
  }

  it("ładowanie: szablon, jeden main, brak pól", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    szablon(container);
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();
  });

  it("dane: szablon, jeden main, pola wypełnione z serwera", async () => {
    const { container } = await renderujDane();
    szablon(container);
    expect(pole(/^Tytuł lekcji/).value).toBe("Wprowadzenie do wywiadu");
    expect(pole(/^Treść lekcji/).value).toBe("## Cel lekcji\n\nPierwszy akapit.");
    expect(pole(/^Czas trwania/).value).toBe("1800");
    expect(screen.getByRole("heading", { level: 1, name: "Wprowadzenie do wywiadu" })).toBeInTheDocument();
  });

  it.each([
    [403, "odmowa roli"],
    [401, "błąd 401 podany przez atrapę klienta (w produkcie 401 bez sesji przenosi na /logowanie)"],
  ])("%i — %s: rola administracji w tekście, zero danych, szablon", async (status) => {
    ustawApi();
    api.mockRejectedValue(new ApiError({ status, code: status === 401 ? "unauthenticated" : "forbidden", message: "x" }));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText(/administracji/);
    szablon(container);
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();
    expect(screen.queryByText("Wprowadzenie do wywiadu")).toBeNull();
    expect(container.querySelectorAll("textarea, input").length).toBe(0);
    expect(api).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });

  it("404 z serwera: stan nie znaleziono w szablonie, zero pól", async () => {
    ustawApi();
    api.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText("Nie znaleziono lekcji");
    szablon(container);
    expect(container.querySelectorAll("textarea, input").length).toBe(0);
  });

  it("lekcji nie ma na liście kursu: stan nie znaleziono", async () => {
    ustawApi({ lekcje: [INNA_LEKCJA] });
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText("Nie znaleziono lekcji");
    szablon(container);
  });

  it("adres bez kursu: nie znaleziono bez żadnego wywołania API", () => {
    ustawApi();
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={null} />);
    expect(screen.getByText("Nie znaleziono lekcji")).toBeInTheDocument();
    szablon(container);
    expect(api).not.toHaveBeenCalled();
  });

  it("błąd połączenia: Notice z „Spróbuj ponownie”, ponowienie wczytuje dane", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText("Nie udało się wczytać lekcji");
    szablon(container);
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByLabelText(/^Tytuł lekcji/);
    szablon(container);
  });

  it("po zapisie: szablon, jeden main, komunikat o zapisie", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    await screen.findByText("Lekcja została zapisana.");
    szablon(container);
  });

  it("błąd zapisu (422 z polami): szablon, jeden main", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({
      patch: () => {
        throw new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { title: ["Tytuł lekcji może mieć najwyżej 255 znaków."] },
        });
      },
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    await screen.findAllByText("Tytuł lekcji może mieć najwyżej 255 znaków.");
    szablon(container);
  });
});

describe("przycisk główny", () => {
  it("jedyny przycisk główny to „Zapisz lekcję”", async () => {
    const { container } = await renderujDane();
    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Zapisz lekcję");
  });

  it("w obszarze treści nadal jeden przycisk główny przy otwartym oknie porzucenia zmian", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Zmieniony tytuł" } });
    await uzytkownik.click(screen.getByRole("button", { name: "Anuluj" }));
    await screen.findByRole("dialog");
    expect(przyciskiGlowne(container.querySelector("main") as HTMLElement)).toHaveLength(1);
  });
});

describe("zapis treści lekcji", () => {
  it("PATCH z dokładnie czterema polami; treść bez przycinania; bez pól tematu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    const tresc = "  Akapit z twardym łamaniem  \n\n<script>alert(1)</script>  ";
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: tresc } });
    fireEvent.change(pole(/^Krótki opis lekcji/), { target: { value: "" } });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));

    await waitFor(() => expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(1));
    const cialo = (wywolania("PATCH", "/admin/lessons/21")[0][1] as { body: Record<string, unknown> }).body;
    expect(cialo).toEqual({
      title: "Wprowadzenie do wywiadu",
      description: null,
      content: tresc,
      duration_seconds: 1800,
    });
    expect(cialo).not.toHaveProperty("topic_id");
    expect(cialo).not.toHaveProperty("topic_position");
    expect(cialo).not.toHaveProperty("sequence_order");
    expect(await screen.findByText("Lekcja została zapisana.")).toBeInTheDocument();
  });

  it("zapis zwraca treść z serwera do formularza i do podglądu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({ patch: (cialo) => ({ ...LEKCJA, ...cialo, title: "Tytuł z serwera" }) });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    await screen.findByText("Lekcja została zapisana.");
    expect(pole(/^Tytuł lekcji/).value).toBe("Tytuł z serwera");
    expect(screen.getByRole("heading", { level: 1, name: "Tytuł z serwera" })).toBeInTheDocument();
  });

  it("pusty tytuł: błąd pola bez żadnego zapytania zapisu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "  " } });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    expect((await screen.findAllByText("Podaj tytuł lekcji.")).length).toBeGreaterThan(0);
    expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(0);
  });

  it("422 na treści: komunikat pod polem, treść w formularzu zostaje, brak komunikatu o zapisie", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({
      patch: () => {
        throw new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { content: ["Treść lekcji może mieć najwyżej 20 000 znaków."] },
        });
      },
    });
    const za_dluga = "a".repeat(20001);
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: za_dluga } });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));

    const komunikaty = await screen.findAllByText("Treść lekcji może mieć najwyżej 20 000 znaków.");
    expect(komunikaty.length).toBeGreaterThan(0);
    expect(pole(/^Treść lekcji/).value).toBe(za_dluga);
    expect(screen.queryByText("Lekcja została zapisana.")).toBeNull();
    expect(pole(/^Treść lekcji/)).toHaveAttribute("aria-invalid", "true");
  });

  it("błąd połączenia przy zapisie: Notice, wpisane zmiany zostają", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({
      patch: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    await screen.findByText("Lekcja nie została zapisana");
    expect(screen.getByText(/Sprawdź połączenie/)).toBeInTheDocument();
    expect(pole(/^Tytuł lekcji/).value).toBe("Nowy tytuł");
  });

  it("403 przy zapisie: zdanie o roli, zmiany zostają w formularzu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({
      patch: () => {
        throw new ApiError({ status: 403, code: "forbidden", message: "x" });
      },
    });
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz lekcję" }));
    expect(await screen.findByText(/nie jest dostępny dla Twojej roli/)).toBeInTheDocument();
    expect(pole(/^Tytuł lekcji/).value).toBe("Nowy tytuł");
  });
});

describe("licznik znaków treści", () => {
  it("20 000 znaków wielobajtowych mieści się w limicie (40 000 bajtów)", async () => {
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "ż".repeat(20000) } });
    expect(screen.getByText(/20 000 z 20 000 znaków\./)).toBeInTheDocument();
    expect(screen.queryByText(/Przekroczono limit/)).toBeNull();
  });

  it("20 001 znaków pokazuje przekroczenie limitu o jeden znak", async () => {
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "ż".repeat(20001) } });
    expect(screen.getByText(/Przekroczono limit o 1 znak \(limit: 20 000\)\./)).toBeInTheDocument();
  });

  it("licznik rośnie razem z wpisywanym tekstem", async () => {
    await renderujDane({ lekcje: [{ ...LEKCJA, content: null }] });
    expect(screen.getByText(/0 z 20 000 znaków\./)).toBeInTheDocument();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "abcde" } });
    expect(screen.getByText(/5 z 20 000 znaków\./)).toBeInTheDocument();
  });
});

describe("podgląd treści", () => {
  it("podgląd renderuje Markdown jako nagłówek i akapit", async () => {
    await renderujDane();
    const podglad = screen.getByRole("region", { name: "Podgląd treści" });
    expect(within(podglad).getByRole("heading", { name: "Cel lekcji" })).toBeInTheDocument();
    expect(within(podglad).getByText("Pierwszy akapit.")).toBeInTheDocument();
  });

  it("HTML w treści jest tekstem, nie elementem", async () => {
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: '<img src=x onerror="alert(1)"> <script>x</script>' } });
    const podglad = screen.getByRole("region", { name: "Podgląd treści" });
    expect(podglad.querySelector("img")).toBeNull();
    expect(podglad.querySelector("script")).toBeNull();
    expect(podglad.textContent).toContain("<script>x</script>");
  });

  it("pusta treść: zdanie zamiast podglądu", async () => {
    await renderujDane({ lekcje: [{ ...LEKCJA, content: null }] });
    const podglad = screen.getByRole("region", { name: "Podgląd treści" });
    expect(within(podglad).getByText(/Treść lekcji jest pusta/)).toBeInTheDocument();
  });
});

describe("materiały", () => {
  it("wgranie pliku: multipart z polem file, licznik rośnie, wiersz pliku gotowy", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    expect(screen.getByText("Materiały przy tej lekcji: 2.")).toBeInTheDocument();
    const wgrany: MaterialAdmin = {
      id: 9,
      name: "karta.pdf",
      mime: "application/pdf",
      size: 4,
      lesson_id: 21,
      course_id: null,
      created_at: null,
    };
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
      if (sciezka === "/admin/lessons/21/materials" && opcje?.method === "POST") return wgrany;
      throw new Error(`Nieoczekiwana trasa: ${sciezka}`);
    });
    const plik = new File(["%PDF"], "karta.pdf", { type: "application/pdf" });
    await uzytkownik.upload(wejsciaPlikow(container)[0], plik);

    await screen.findByText("Wgrano materiał.");
    const wywolanie = wywolania("POST", "/admin/lessons/21/materials")[0];
    const cialo = (wywolanie[1] as { body: FormData }).body;
    expect(cialo).toBeInstanceOf(FormData);
    expect((cialo.get("file") as File).name).toBe("karta.pdf");
    expect(screen.getByText("Materiały przy tej lekcji: 3.")).toBeInTheDocument();
  });

  it("422 na pliku: komunikat serwera w wierszu pliku, licznik bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    api.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { file: ["Plik może mieć najwyżej 10 MB."] },
      }),
    );
    await uzytkownik.upload(wejsciaPlikow(container)[0], new File(["x"], "duzy.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Plik może mieć najwyżej 10 MB.")).toBeInTheDocument();
    expect(screen.getByText("Materiały przy tej lekcji: 2.")).toBeInTheDocument();
  });
});

describe("nagranie", () => {
  it("Super Admin: obszar upuszczania nagrania jest aktywny, opiekun projektu widzi powód", async () => {
    const administrator = await renderujDane({ rola: "super_admin" });
    expect(wejsciaPlikow(administrator.container)).toHaveLength(2);
    expect(screen.queryByText(/tylko Super Admin/)).toBeNull();
    administrator.unmount();

    const opiekun = await renderujDane({ rola: "project_manager" });
    expect(wejsciaPlikow(opiekun.container)).toHaveLength(1);
    expect(screen.getByText(/Nagranie może wgrać tylko Super Admin/)).toBeInTheDocument();
  });

  it("opiekun projektu: stan nagrania z serwera widoczny, wgrywania brak", async () => {
    await renderujDane({
      rola: "project_manager",
      nagranie: GOTOWE_NAGRANIE,
    });
    expect(screen.getByText("Nagranie jest gotowe. Czas trwania: 2 min 5 s.")).toBeInTheDocument();
  });

  it("Super Admin: zlecenie wgrania z samym tytułem, potem wysyłka do dostawcy", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({ rola: "super_admin" });
    const zlecenie: ZlecenieWgrania = {
      video_id: "vid-1",
      upload_url: "https://video.test/tusupload",
      library_id: "77",
      expiration_time: 1790000000,
      signature: "sig",
    };
    const ponowny: StanNagrania = { status: "processing", duration_seconds: 0, preview_embed_url: "https://x.test/e" };
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
      if (sciezka === "/admin/lessons/21/video-uploads" && opcje?.method === "POST") return zlecenie;
      if (sciezka === "/admin/lessons/21/video-status") return ponowny;
      throw new Error(`Nieoczekiwana trasa: ${sciezka}`);
    });
    const dostawca = vi.fn(async (_adres: string, opcje: { method: string }) =>
      opcje.method === "POST"
        ? new Response(null, { status: 201, headers: { Location: "https://video.test/tusupload/abc" } })
        : new Response(null, { status: 204, headers: { "Upload-Offset": "5" } }),
    );
    vi.stubGlobal("fetch", dostawca);

    await uzytkownik.upload(wejsciaPlikow(container)[1], new File(["12345"], "nagranie.mp4", { type: "video/mp4" }));

    await screen.findByText("Wgrano. Nagranie jest przetwarzane.");
    const wywolanie = wywolania("POST", "/admin/lessons/21/video-uploads")[0];
    expect((wywolanie[1] as { body: unknown }).body).toEqual({ title: "Wprowadzenie do wywiadu" });
    expect(dostawca).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Nagranie jest przetwarzane\. Wróć/)).toBeInTheDocument();
  });

  it("plik, który nie jest wideo: błąd w wierszu, zero zapytań o wgranie", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({ rola: "super_admin" });
    await uzytkownik.upload(wejsciaPlikow(container)[1], new File(["x"], "notatki.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Wybierz plik wideo.")).toBeInTheDocument();
    expect(wywolania("POST", "/admin/lessons/21/video-uploads")).toHaveLength(0);
  });

  it("odmowa 403 przy zleceniu wgrania: komunikat w wierszu pliku", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({ rola: "super_admin" });
    api.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
    await uzytkownik.upload(wejsciaPlikow(container)[1], new File(["x"], "n.mp4", { type: "video/mp4" }));
    expect(await screen.findByText("Nie masz dostępu do tej sekcji.")).toBeInTheDocument();
  });

  it("błąd odczytu stanu nagrania nie blokuje edycji tekstu", async () => {
    ustawApi();
    const dawne = api.getMockImplementation()!;
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: unknown }) => {
      if (sciezka === "/admin/lessons/21/video-status") {
        throw new ApiError({ status: 503, code: "video_not_configured", message: "x" });
      }
      return dawne(sciezka, opcje);
    });
    render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByLabelText(/^Tytuł lekcji/);
    expect(screen.getByText("Nie udało się sprawdzić stanu nagrania.")).toBeInTheDocument();
  });
});

describe("wyjście z ekranu", () => {
  it("bez zmian „Anuluj” wraca od razu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    await uzytkownik.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ze zmianami „Anuluj” pyta; „Wróć do edycji” zostaje, „Porzuć zmiany” wraca", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "coś innego" } });
    await uzytkownik.click(screen.getByRole("button", { name: "Anuluj" }));
    const okno = await screen.findByRole("dialog");
    expect(back).not.toHaveBeenCalled();

    await uzytkownik.click(within(okno).getByRole("button", { name: "Wróć do edycji" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(back).not.toHaveBeenCalled();

    await uzytkownik.click(screen.getByRole("button", { name: "Anuluj" }));
    await uzytkownik.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Porzuć zmiany" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("trasy ekranu", () => {
  it("odczyt tylko listy lekcji kursu, roli i stanu nagrania; bez tras tematów", async () => {
    await renderujDane();
    const adresy = api.mock.calls.map(([adres, opcje]) => `${(opcje as { method?: string } | undefined)?.method ?? "GET"} ${adres}`);
    expect(adresy.sort()).toEqual(["GET /admin/courses/3/lessons", "GET /admin/lessons/21/video-status"]);
    expect(pobierzJa).toHaveBeenCalledTimes(1);
  });
});
