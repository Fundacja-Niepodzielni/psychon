import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import type { CialoLekcji, LekcjaAdmin } from "@/nowy-front/lekcja-edycja/dane";
import { przygotujUkladDlaEdytora } from "@/nowy-front/lekcja-edycja/__tests__/pomoc-edytora";

/**
 * Strona lekcji (`lekcja-edycja`) w roli prowadzącego, z wyłączoną sekcją
 * nagrania (stała `NAGRANIE_PROWADZACEGO` w stanie z repozytorium). Atrapa
 * funkcji `api` zna wyłącznie trasy prowadzącego; każda inna trasa jest
 * błędem, więc próba czerwienieje, gdy strona zapyta o trasę administracji,
 * stan nagrania albo listę plików lekcji.
 */

const api = vi.fn();
const pobierzJa = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push, replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...argumenty: unknown[]) => api(...argumenty) };
});

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...argumenty: unknown[]) => pobierzJa(...argumenty),
}));

const { LekcjaEdycja } = await import("@/nowy-front/lekcja-edycja/LekcjaEdycja");
const { NAGRANIE_PROWADZACEGO } = await import("@/nowy-front/rola-kursu/nagranie-prowadzacego");
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

const DRUGA: LekcjaAdmin = { ...LEKCJA, id: 22, title: "Druga lekcja", sequence_order: 2, topic_position: 2 };

function ustawApi() {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: "instructor" });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: CialoLekcji }) => {
    const metoda = opcje?.method ?? "GET";
    if (metoda === "GET" && sciezka === "/instructor/courses/4/lessons") return [LEKCJA, DRUGA];
    if (metoda === "PATCH" && sciezka === "/instructor/lessons/21") return { ...LEKCJA, ...opcje?.body };
    if (metoda === "DELETE" && sciezka === "/instructor/lessons/21") return { id: 21, deleted: true };
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
}

function sciezki(): string[] {
  return api.mock.calls.map(([sciezka]) => sciezka as string);
}

function wywolania(metoda: string, sciezka: string) {
  return api.mock.calls.filter(
    ([adres, opcje]) => adres === sciezka && ((opcje as { method?: string } | undefined)?.method ?? "GET") === metoda,
  );
}

async function renderujStrone() {
  ustawApi();
  const wynik = render(<LekcjaEdycja rola="instructor" idLekcji={21} idKursu={4} />);
  await screen.findByLabelText(/^Tytuł lekcji/);
  return wynik;
}

beforeAll(przygotujUkladDlaEdytora);

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  back.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
  uchwytWysylania.porzuc(21);
});

describe("strona lekcji prowadzącego — trasy", () => {
  it("sekcja nagrania prowadzącego jest wyłączona w repozytorium", () => {
    expect(NAGRANIE_PROWADZACEGO).toBe(false);
  });

  it("czyta lekcje kursu trasą prowadzącego; bez administracji, stanu nagrania i listy plików", async () => {
    const { container } = await renderujStrone();

    expect(() => jedenMain(container)).not.toThrow();
    expect(sciezki()).toContain("/instructor/courses/4/lessons");
    expect(sciezki().filter((sciezka) => sciezka.startsWith("/admin/"))).toEqual([]);
    expect(sciezki().filter((sciezka) => sciezka.includes("/video-status"))).toEqual([]);
    expect(sciezki().filter((sciezka) => sciezka.includes("/materials"))).toEqual([]);
  });

  it("zapis lekcji idzie PATCH trasą prowadzącego", async () => {
    const uzytkownik = userEvent.setup();
    await renderujStrone();

    const tytul = screen.getAllByLabelText(/^Tytuł lekcji/).find((element) => element.matches("input"))!;
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Nowy tytuł");
    await uzytkownik.click(screen.getAllByRole("button", { name: "Zapisz lekcję" })[0]);

    await waitFor(() => expect(wywolania("PATCH", "/instructor/lessons/21")).toHaveLength(1));
    const cialo = (wywolania("PATCH", "/instructor/lessons/21")[0][1] as { body: CialoLekcji }).body;
    expect(cialo.title).toBe("Nowy tytuł");
    expect(sciezki().filter((sciezka) => sciezka.startsWith("/admin/"))).toEqual([]);
  });

  it("usunięcie lekcji idzie DELETE trasą prowadzącego i wraca do kursu prowadzącego", async () => {
    const uzytkownik = userEvent.setup();
    await renderujStrone();

    await uzytkownik.click(screen.getByRole("button", { name: "Usunięcie lekcji" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń lekcję" }));
    const okno = await screen.findByRole("dialog");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń lekcję" }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(wywolania("DELETE", "/instructor/lessons/21")).toHaveLength(1);
    expect(push).toHaveBeenCalledWith("/nowy-front/kurs/4");
  });
});

describe("strona lekcji prowadzącego — karty i adresy", () => {
  it("bez kart „Nagranie” i „Pliki do tej lekcji”; treść, dane i usunięcie zostają", async () => {
    const { container } = await renderujStrone();

    const naglowki = (obszar: string) =>
      Array.from(container.querySelectorAll(`[data-obszar="${obszar}"] section[data-karta]`)).map(
        (karta) => document.getElementById(karta.getAttribute("aria-labelledby") ?? "")?.textContent,
      );
    expect(naglowki("glowna")).toEqual(["Tytuł, opis i czas", "Treść lekcji"]);
    expect(naglowki("boczna")).toEqual(["Zapis", "Stan lekcji", "Usunięcie lekcji"]);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText("Nagranie i pliki zapisują się same.")).toBeNull();
  });

  it("trasa robocza: okruszki i sąsiednie lekcje prowadzą adresami prowadzącego", async () => {
    await renderujStrone();

    const okruszki = screen.getByRole("navigation", { name: /okruszki|ścieżka/i });
    expect(within(okruszki).queryByRole("link", { name: "Kursy" })).toBeNull();
    expect(within(okruszki).getByRole("link", { name: "Tematy i lekcje" })).toHaveAttribute(
      "href",
      "/nowy-front/kurs/4",
    );
    const nawigacja = screen.getByRole("navigation", { name: "Nawigacja lekcji" });
    expect(within(nawigacja).getByRole("link", { name: "Następna lekcja: Druga lekcja" })).toHaveAttribute(
      "href",
      "/nowy-front/kurs/4?lekcja=22",
    );
  });

  it("adres z kursem w ścieżce: okruszki niosą nazwę kursu i listę kursów prowadzącego", async () => {
    ustawApi();
    const dawne = api.getMockImplementation()!;
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: CialoLekcji }) => {
      if ((opcje?.method ?? "GET") === "GET" && sciezka === "/instructor/courses/4") {
        return { id: 4, title: "Wywiad psychologiczny" };
      }
      return dawne(sciezka, opcje);
    });
    render(<LekcjaEdycja rola="instructor" idLekcji={21} idKursu={4} zNazwaKursu />);
    await screen.findByLabelText(/^Tytuł lekcji/);

    const okruszki = screen.getByRole("navigation", { name: /okruszki|ścieżka/i });
    expect(within(okruszki).getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/prowadzacy/kursy");
    expect(await within(okruszki).findByRole("link", { name: "Wywiad psychologiczny" })).toHaveAttribute(
      "href",
      "/nowy-front/kurs/4",
    );
    const nawigacja = screen.getByRole("navigation", { name: "Nawigacja lekcji" });
    expect(within(nawigacja).getByRole("link", { name: "Następna lekcja: Druga lekcja" })).toHaveAttribute(
      "href",
      "/prowadzacy/kursy/4/lekcje/22",
    );
    expect(sciezki().filter((sciezka) => sciezka.startsWith("/admin/"))).toEqual([]);
  });
});
