import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Sekcja „Sprawy zgłoszone przez prowadzących” ekranu A-02 na prawdziwym
 * module danych; atrapą jest wyłącznie transport (`apiPaged`). Kolejka
 * decyzji dostaje puste strony, żeby sekcja była jedyną treścią do oceny.
 */

const apiPaged = vi.fn();

class ApiErrorAtrapa extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Ekran bierze odczyty i `ApiError` z beczki `@/lib/api`, a moduł danych z `@/lib/api/klient`,
// więc podmieniamy oba moduły na te same atrapy (także funkcję dziedzinową spraw prowadzących).
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError: ApiErrorAtrapa,
  fetchAdminSupervisionCases: () =>
    apiPaged("/admin/supervision/cases").then(({ data }: { data: unknown[] }) => ({ data })),
}));

vi.mock("@/lib/api/klient", () => ({
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError: ApiErrorAtrapa,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { Sprawy } = await import("../Sprawy");

const STRONA_PUSTA = { data: [], meta: { current_page: 1, per_page: 100, total: 0, last_page: 1 } };
const TRASA_SPRAW = "/admin/supervision/cases";

const SPRAWY = [
  {
    id: 7,
    subject: "Nieobecność na dyżurze",
    body: "Pierwszy wiersz treści.\nDrugi wiersz treści.",
    created_at: "2026-09-01T10:00:00Z",
    reporter: { id: 5, first_name: "Joanna", last_name: "Prowadząca" },
    volunteer: { id: 9, first_name: "Marta", last_name: "Demo" },
  },
  {
    id: 8,
    subject: "Sprawa bez wskazania osoby",
    body: "Treść sprawy ogólnej.",
    created_at: "2026-09-02T10:00:00Z",
    volunteer: null,
  },
];

function atrapa(odpowiedzSpraw: () => Promise<unknown>) {
  apiPaged.mockImplementation((sciezka: string) =>
    String(sciezka).startsWith(TRASA_SPRAW) ? odpowiedzSpraw() : Promise.resolve(STRONA_PUSTA),
  );
}

function odczytyKolejki(): number {
  return apiPaged.mock.calls.filter(([sciezka]) => !String(sciezka).startsWith(TRASA_SPRAW)).length;
}

beforeEach(() => {
  apiPaged.mockReset();
});

/** Rozwija sprawę jej przyciskiem „Otwórz” (temat i treść stoją dopiero w rozwiniętej sprawie). */
function otworzSprawe(sprawa: HTMLElement) {
  fireEvent.click(within(sprawa).getByRole("button", { name: /^Otwórz sprawę od prowadzącego/ }));
}

describe("Sprawy zgłoszone przez prowadzących — zwinięty wiersz i „Otwórz”", () => {
  it("zwinięty wiersz: tylko rodzaj, osoba i czas czekania — bez tematu i treści", async () => {
    atrapa(() => Promise.resolve({ data: SPRAWY }));
    render(<Sprawy />);

    const pierwsza = await screen.findByTestId("sprawa-prowadzacego-7");
    expect(pierwsza.textContent).toContain("Sprawa od prowadzącego");
    expect(pierwsza.textContent).toContain("Marta Demo");
    expect(pierwsza.textContent).toMatch(/czeka /);
    expect(pierwsza.textContent).not.toContain("Nieobecność na dyżurze");
    expect(pierwsza.textContent).not.toContain("Pierwszy wiersz treści");
    expect(pierwsza.textContent).not.toContain("Zgłoszone przez: Joanna Prowadząca");
    expect(within(pierwsza).queryByRole("heading")).toBeNull();
    const przycisk = within(pierwsza).getByRole("button", { name: "Otwórz sprawę od prowadzącego: Marta Demo" });
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
  });

  it("„Otwórz” rozwija sprawę w miejscu i stawia fokus na jej temacie; „Zwiń” ją chowa", async () => {
    atrapa(() => Promise.resolve({ data: SPRAWY }));
    render(<Sprawy />);

    const pierwsza = await screen.findByTestId("sprawa-prowadzacego-7");
    otworzSprawe(pierwsza);

    const temat = within(pierwsza).getByRole("heading", { level: 3, name: "Nieobecność na dyżurze" });
    await waitFor(() => expect(temat).toHaveFocus());
    expect(temat).toHaveAttribute("tabindex", "-1");
    const zwin = within(pierwsza).getByRole("button", { name: "Zwiń sprawę od prowadzącego: Marta Demo" });
    expect(zwin).toHaveAttribute("aria-expanded", "true");
    expect(zwin).toHaveAttribute("aria-controls", "sprawa-prowadzacego-tresc-7");
    // Druga sprawa zostaje zwinięta.
    expect(screen.getByTestId("sprawa-prowadzacego-8").textContent).not.toContain("Sprawa bez wskazania osoby");

    // Klawiatura: fokus przechodzi z tematu na „Zwiń” (Shift+Tab), potem Enter.
    zwin.focus();
    fireEvent.click(zwin);
    expect(pierwsza.textContent).not.toContain("Nieobecność na dyżurze");
    expect(within(pierwsza).getByRole("button", { name: /^Otwórz sprawę od prowadzącego/ })).toHaveFocus();
  });
});

describe("Sprawy zgłoszone przez prowadzących — dane", () => {
  it("pokazuje temat, datę, zgłaszającego, osobę i treść każdej sprawy oraz trzy teksty zastępcze", async () => {
    atrapa(() => Promise.resolve({ data: SPRAWY }));
    render(<Sprawy />);

    const pierwsza = await screen.findByTestId("sprawa-prowadzacego-7");
    otworzSprawe(pierwsza);
    expect(within(pierwsza).getByRole("heading", { level: 3, name: "Nieobecność na dyżurze" })).toBeInTheDocument();
    expect(pierwsza.textContent).toContain("1 września 2026");
    expect(pierwsza.textContent).toContain("Zgłoszone przez: Joanna Prowadząca");
    expect(pierwsza.textContent).toContain("Marta Demo");
    // Podział wierszy zostaje w tekście; pokazuje go `white-space: pre-wrap` z modułu CSS.
    expect(within(pierwsza).getByText(/Pierwszy wiersz treści/).textContent).toBe(
      "Pierwszy wiersz treści.\nDrugi wiersz treści.",
    );

    const druga = screen.getByTestId("sprawa-prowadzacego-8");
    otworzSprawe(druga);
    expect(druga.textContent).toContain("Autor zgłoszenia nieznany");
    expect(druga.textContent).toContain("Sprawa ogólna — bez wskazania osoby");

    expect(screen.getByRole("heading", { level: 2, name: "Sprawy zgłoszone przez prowadzących" })).toBeInTheDocument();
  });

  it("treść z <script> jest tekstem, nie znacznikiem", async () => {
    const zlosliwa = '<script>window.__zlamane = true</script><img src=x onerror="1">';
    atrapa(() => Promise.resolve({ data: [{ ...SPRAWY[1], body: zlosliwa }] }));
    const { container } = render(<Sprawy />);

    const sprawa = await screen.findByTestId("sprawa-prowadzacego-8");
    otworzSprawe(sprawa);
    expect(within(sprawa).getByText(zlosliwa)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("jedyny main, a kolejka decyzji stoi obok sekcji", async () => {
    atrapa(() => Promise.resolve({ data: SPRAWY }));
    const { container } = render(<Sprawy />);

    await screen.findByTestId("sprawa-prowadzacego-7");
    expect(() => jedenMain(container)).not.toThrow();
    expect(screen.getByRole("heading", { level: 1, name: "Sprawy do decyzji" })).toBeInTheDocument();
    expect(await screen.findByText("Brak spraw do decyzji")).toBeInTheDocument();
  });
});

describe("Sprawy zgłoszone przez prowadzących — ładowanie, pusto, błąd", () => {
  it("ładowanie: szkielet sekcji, bez rekordów", () => {
    atrapa(() => new Promise(() => {}));
    render(<Sprawy />);

    const sekcja = screen.getByRole("region", { name: "Sprawy zgłoszone przez prowadzących" });
    expect(sekcja.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(sekcja).queryByRole("listitem")).toBeNull();
  });

  it("pusto: „Brak spraw zgłoszonych przez prowadzących.”", async () => {
    atrapa(() => Promise.resolve({ data: [] }));
    render(<Sprawy />);

    expect(await screen.findByText("Brak spraw zgłoszonych przez prowadzących.")).toBeInTheDocument();
  });

  it("błąd: komunikat i „Spróbuj ponownie” ponawia wyłącznie sprawy prowadzących", async () => {
    let wywolania = 0;
    atrapa(() => {
      wywolania += 1;
      return wywolania === 1
        ? Promise.reject(new ApiErrorAtrapa(500, "server_error", "Serwer nie odpowiada."))
        : Promise.resolve({ data: [SPRAWY[0]] });
    });
    render(<Sprawy />);

    expect(await screen.findByText("Serwer nie odpowiada.")).toBeInTheDocument();
    expect(screen.getByText("Nie udało się wczytać spraw zgłoszonych przez prowadzących")).toBeInTheDocument();
    const odczytyPrzed = odczytyKolejki();

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByTestId("sprawa-prowadzacego-7")).toBeInTheDocument();
    expect(screen.queryByText("Serwer nie odpowiada.")).toBeNull();
    expect(wywolania).toBe(2);
    expect(odczytyKolejki()).toBe(odczytyPrzed);
  });

  it("błąd sieci bez ApiError: komunikat domyślny", async () => {
    atrapa(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<Sprawy />);

    expect(
      await screen.findByText("Nie udało się wczytać zgłoszonych spraw. Spróbuj ponownie."),
    ).toBeInTheDocument();
  });

  it("błąd sekcji nie zasłania kolejki decyzji", async () => {
    atrapa(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<Sprawy />);

    expect(await screen.findByText("Brak spraw do decyzji")).toBeInTheDocument();
    await screen.findByText("Nie udało się wczytać spraw zgłoszonych przez prowadzących");
  });
});

describe("Sprawy zgłoszone przez prowadzących — odmowa", () => {
  it.each([401, 403])(
    "%i na sprawach prowadzących: cały ekran w stanie brak uprawnień, zero rekordów obu części",
    async (status) => {
      apiPaged.mockImplementation((sciezka: string) =>
        String(sciezka).startsWith(TRASA_SPRAW)
          ? Promise.reject(new ApiErrorAtrapa(status, status === 403 ? "forbidden" : "unauthenticated", "Odmowa."))
          : Promise.resolve({
              data: [{ id: 1, first_name: "Marta", last_name: "Demo", created_at: "2026-01-01T00:00:00Z" }],
              meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 },
            }),
      );
      const { container } = render(<Sprawy />);

      await screen.findByRole("heading", { name: "Nie masz dostępu do tego ekranu" });
      await waitFor(() =>
        expect(screen.queryByRole("heading", { name: "Sprawy zgłoszone przez prowadzących" })).toBeNull(),
      );
      expect(screen.queryAllByRole("link", { name: "Otwórz sprawę" })).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeNull();
      expect(container.textContent).not.toContain("Marta Demo");
      expect(container.querySelectorAll('[data-testid^="sprawa-prowadzacego-"]')).toHaveLength(0);
      expect(() => jedenMain(container)).not.toThrow();
    },
  );

  it("403 na kolejce przy udanych sprawach prowadzących: te sprawy też znikają z drzewa", async () => {
    apiPaged.mockImplementation((sciezka: string) =>
      String(sciezka).startsWith(TRASA_SPRAW)
        ? Promise.resolve({ data: SPRAWY })
        : Promise.reject(new ApiErrorAtrapa(403, "forbidden", "Brak uprawnień.")),
    );
    const { container } = render(<Sprawy />);

    await screen.findByRole("heading", { name: "Nie masz dostępu do tego ekranu" });
    await new Promise((rozwiaz) => setTimeout(rozwiaz, 20));
    expect(container.textContent).not.toContain("Nieobecność na dyżurze");
    expect(container.querySelectorAll('[data-testid^="sprawa-prowadzacego-"]')).toHaveLength(0);
  });
});
