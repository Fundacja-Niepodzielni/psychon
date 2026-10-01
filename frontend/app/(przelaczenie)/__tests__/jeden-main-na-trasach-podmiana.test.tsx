import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WNIOSEK } from "@/nowy-front/profil-decyzja/__tests__/atrapy";

/**
 * Cztery trasy grup z podmianą treści (`/admin/profile/[id]`,
 * `/admin/wzory-dokumentow`, `/admin/ekran-startowy`, `/admin/staz`) złożone tak jak robi to
 * router: prawdziwy układ administracji (strażnik ról i powłoka panelu) i
 * prawdziwa strona, czytająca prawdziwy rejestr przełączenia (grupy włączone).
 * Dwa zestawy:
 * - w czterech stanach (ładowanie, dane, błąd sieci, odmowa) dokładnie jeden
 *   `main`, jeden `#tresc` i jeden odnośnik do treści;
 * - odmowa roli: rola spoza administracji dostaje wspólny ekran „Brak dostępu”,
 *   a odpowiedź 401/403 z serwera — stan „brak uprawnień” ekranu; w obu
 *   przypadkach w DOM nie ma żadnego rekordu.
 * Podmieniony jest wyłącznie transport HTTP (`api`, `apiPaged`, `downloadFile`)
 * — w obu modułach klienta: beczce `@/lib/api` i `@/lib/api/klient`.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { ApiError } = await import("@/lib/api/klient");
const { default: UkladAdministracji } = await import("@/app/(administracja)/admin/layout");
const { default: StronaProfilu } = await import("@/app/(administracja)/admin/profile/[id]/page");
const { default: StronaWzorow } = await import("@/app/(administracja)/admin/wzory-dokumentow/page");
const { default: StronaEkranu } = await import("@/app/(administracja)/admin/ekran-startowy/page");
const { default: StronaStazu } = await import("@/app/(administracja)/admin/staz/page");
const { default: PanelShell } = await import("@/components/layout/PanelShell");
const { ProfilDecyzja } = await import("@/nowy-front/profil-decyzja/ProfilDecyzja");
const { WzoryDokumentow } = await import("@/nowy-front/wzory-dokumentow/WzoryDokumentow");
const { EkranStartowy } = await import("@/nowy-front/ekran-startowy/EkranStartowy");
const { StazKolejka } = await import("@/nowy-front/staz-kolejka/StazKolejka");

const STRONA_PUSTA = { data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } };
const BLAD = () => new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." });
const ZAKAZ = (status = 403) => new ApiError({ status, code: "forbidden", message: "Zabronione." });
const ZAWIESZONE = Symbol("zawieszone");

const WZOR = {
  type: "agreement",
  content: "<p>Treść wzoru testowego</p>",
  version: 2,
  updated_at: "2026-09-28T10:00:00Z",
  updated_by: { id: 5, name: "Anna Testowa" },
};
const HISTORIA = [{ version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: { id: 5, name: "Anna Testowa" } }];
const EKRAN = {
  video: { title: "Film powitalny testowy", url: null, caption: null },
  program: { title: "Program testowy", body: "Treść programu testowego." },
  expectations: { title: "Oczekiwania testowe", body: "Treść oczekiwań testowych." },
  updated_at: null,
};

const WPIS_STAZU = {
  id: 91,
  date: "2026-08-27",
  hours: "3.5",
  form: "phone_duty",
  consultations_count: 4,
  description: "Dyżur telefoniczny — bez danych osób.",
  status: "submitted",
  review_comment: null,
  decided_at: null,
  created_at: "2026-08-27T18:00:00Z",
  updated_at: "2026-08-27T18:00:00Z",
  user: { id: 17, first_name: "Marta", last_name: "Demo" },
};
const STRONA_STAZU = { data: [WPIS_STAZU], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 } };

type Odpowiedz = unknown;

/** Atrapa transportu: `/me` z rolą, powiadomienia puste, reszta z mapy tras. */
function transport(rola: string, trasy: Record<string, Odpowiedz>) {
  const odpowiedz = (url: string) => {
    const sciezka = url.split("?")[0];
    if (sciezka === "/me") return Promise.resolve({ role: rola });
    if (sciezka === "/notifications") return Promise.resolve(STRONA_PUSTA);
    if (!(sciezka in trasy)) {
      return Promise.reject(new ApiError({ status: 500, code: "test_unrouted", message: `unrouted: ${sciezka}` }));
    }
    const wartosc = trasy[sciezka];
    if (wartosc === ZAWIESZONE) return new Promise(() => {});
    if (wartosc instanceof Error) return Promise.reject(wartosc);
    return Promise.resolve(wartosc);
  };
  api.mockImplementation(odpowiedz);
  apiPaged.mockImplementation(odpowiedz);
}

function zmierz(container: HTMLElement) {
  return {
    main: container.querySelectorAll("main").length,
    cele: container.querySelectorAll("#tresc").length,
    odnosniki: container.querySelectorAll('a[href="#tresc"]').length,
  };
}
const JEDEN = { main: 1, cele: 1, odnosniki: 1 };

async function trasaProfilu(): Promise<ReactElement> {
  return (await StronaProfilu({ params: Promise.resolve({ id: "12" }) })) as ReactElement;
}

async function zloz(element: ReactElement) {
  let wynik!: ReturnType<typeof render>;
  await act(async () => {
    wynik = render(<UkladAdministracji>{element}</UkladAdministracji>);
  });
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("/admin/profile/[id] w układzie administracji", () => {
  const dane = (show: Odpowiedz) => ({ "/admin/profiles/12": show });

  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAWIESZONE));
    const { container } = await zloz(await trasaProfilu());
    await screen.findByRole("heading", { level: 1, name: "Wczytywanie wniosku" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(WNIOSEK));
    const { container } = await zloz(await trasaProfilu());
    await screen.findByRole("heading", { level: 1, name: /^Wniosek o profil: Ewa Przykładowa/ });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(BLAD()));
    const { container } = await zloz(await trasaProfilu());
    await screen.findByText("Nie udało się wczytać wniosku");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAKAZ()));
    const { container } = await zloz(await trasaProfilu());
    await screen.findByText(/tylko dla administracji/);
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("/admin/wzory-dokumentow w układzie administracji", () => {
  const dane = (wzor: Odpowiedz, historia: Odpowiedz = HISTORIA) => ({
    "/document-templates/agreement": wzor,
    "/document-templates/agreement/versions": historia,
  });

  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAWIESZONE, ZAWIESZONE));
    const { container } = await zloz(<StronaWzorow />);
    await screen.findByRole("heading", { level: 1, name: "Wzory dokumentów" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(WZOR));
    const { container } = await zloz(<StronaWzorow />);
    await screen.findByRole("button", { name: "Zapisz nową wersję" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(BLAD()));
    const { container } = await zloz(<StronaWzorow />);
    await screen.findByText("Nie udało się wczytać wzoru");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 401: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAKAZ(401)));
    const { container } = await zloz(<StronaWzorow />);
    await screen.findByText(/tylko dla administracji/);
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("/admin/ekran-startowy w układzie administracji", () => {
  const dane = (ekran: Odpowiedz) => ({ "/onboarding": ekran });

  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAWIESZONE));
    const { container } = await zloz(<StronaEkranu />);
    await screen.findByRole("heading", { level: 1, name: "Treść ekranu „Zacznij tutaj”" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(EKRAN));
    const { container } = await zloz(<StronaEkranu />);
    await screen.findByRole("button", { name: "Zapisz i opublikuj" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(BLAD()));
    const { container } = await zloz(<StronaEkranu />);
    await screen.findByText("Nie udało się wczytać treści");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAKAZ()));
    const { container } = await zloz(<StronaEkranu />);
    await screen.findByText("Ten ekran redaguje administracja");
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("/admin/staz w układzie administracji", () => {
  const dane = (lista: Odpowiedz) => ({ "/admin/internship/pending": lista });

  it("ładowanie: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAWIESZONE));
    const { container } = await zloz(<StronaStazu />);
    await screen.findByRole("heading", { level: 1, name: "Dyżury do decyzji" });
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("dane: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(STRONA_STAZU));
    const { container } = await zloz(<StronaStazu />);
    await screen.findByText("Marta Demo");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("błąd sieci: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(BLAD()));
    const { container } = await zloz(<StronaStazu />);
    await screen.findByText("Nie udało się wczytać dyżurów");
    expect(zmierz(container)).toEqual(JEDEN);
  });

  it("odmowa 403: jeden main, jeden #tresc, jeden odnośnik", async () => {
    transport("project_manager", dane(ZAKAZ()));
    const { container } = await zloz(<StronaStazu />);
    await screen.findByText(/tylko dla administracji/);
    expect(zmierz(container)).toEqual(JEDEN);
  });
});

describe("kontrola dodatnia: ekran bez dostawcy powłoki", () => {
  it("każdy z czterech ekranów wewnątrz samej powłoki, bez DostawcyPowloki, daje dwa main", async () => {
    transport("project_manager", {
      "/admin/profiles/12": ZAWIESZONE,
      "/document-templates/agreement": ZAWIESZONE,
      "/document-templates/agreement/versions": ZAWIESZONE,
      "/onboarding": ZAWIESZONE,
      "/admin/internship/pending": ZAWIESZONE,
    });
    for (const ekran of [
      <ProfilDecyzja key="p" id="12" />,
      <WzoryDokumentow key="w" />,
      <EkranStartowy key="e" />,
      <StazKolejka key="s" />,
    ]) {
      const { container, unmount } = render(
        <PanelShell panelName="Administracja" menu={[]}>
          {ekran}
        </PanelShell>,
      );
      expect(zmierz(container).main).toBe(2);
      unmount();
    }
  });
});

describe("odmowa roli — rola spoza administracji i odmowa serwera", () => {
  const TRASY = {
    "/admin/profiles/12": WNIOSEK,
    "/document-templates/agreement": WZOR,
    "/document-templates/agreement/versions": HISTORIA,
    "/onboarding": EKRAN,
    "/admin/internship/pending": STRONA_STAZU,
  };

  it.each([
    ["wniosek o profil", "Ewa Przykładowa", trasaProfilu],
    ["wzory dokumentów", "Treść wzoru testowego", async () => <StronaWzorow />],
    ["ekran startowy", "Film powitalny testowy", async () => <StronaEkranu />],
    ["kolejka stażu", "Marta Demo", async () => <StronaStazu />],
  ] as const)(
    "%s: rola prowadzącego dostaje wspólny ekran odmowy, bez rekordów i bez żądań poza /me",
    async (_nazwa, rekord, element) => {
      transport("instructor", TRASY);
      const { container } = await zloz(await element());

      await screen.findByText("Brak dostępu");
      expect(container.textContent ?? "").not.toContain(rekord);
      expect(container.querySelectorAll("main").length).toBe(0);
      const sciezki = [...api.mock.calls, ...apiPaged.mock.calls].map((wywolanie) =>
        String(wywolanie[0]).split("?")[0],
      );
      expect(sciezki.filter((sciezka) => sciezka !== "/me")).toEqual([]);
    },
  );

  it.each([401, 403])(
    "wniosek o profil: odpowiedź %i serwera pokazuje stan brak uprawnień i ani jednego rekordu",
    async (status) => {
      transport("project_manager", { "/admin/profiles/12": ZAKAZ(status) });
      const { container } = await zloz(await trasaProfilu());

      await screen.findByText(/tylko dla administracji/);
      expect(container.textContent ?? "").not.toContain("Ewa Przykładowa");
      expect(container.textContent ?? "").not.toContain("Gdańsk");
      expect(container.textContent ?? "").not.toContain("interwencja kryzysowa");
      expect(screen.queryByRole("button", { name: /^Pobierz załącznik/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Zaakceptuj" })).toBeNull();
    },
  );

  it.each([401, 403])(
    "wzory dokumentów: odpowiedź %i serwera pokazuje stan brak uprawnień i nie pokazuje treści wzoru",
    async (status) => {
      transport("project_manager", {
        "/document-templates/agreement": ZAKAZ(status),
        "/document-templates/agreement/versions": ZAKAZ(status),
      });
      const { container } = await zloz(<StronaWzorow />);

      await screen.findByText(/tylko dla administracji/);
      expect(container.querySelectorAll("textarea")).toHaveLength(0);
      expect(container.textContent ?? "").not.toContain("Treść wzoru testowego");
    },
  );

  it.each([401, 403])(
    "kolejka stażu: odpowiedź %i serwera pokazuje stan brak uprawnień, zero rekordów i zero przycisków decyzji",
    async (status) => {
      transport("project_manager", { "/admin/internship/pending": ZAKAZ(status) });
      const { container } = await zloz(<StronaStazu />);

      await screen.findByText(/tylko dla administracji/);
      expect(container.textContent ?? "").not.toContain("Marta Demo");
      expect(container.textContent ?? "").not.toContain("Dyżur z");
      expect(container.querySelectorAll("ul[aria-label='Dyżury do decyzji']")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Zatwierdź" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Odrzuć dyżur" })).toBeNull();
      expect(zmierz(container)).toEqual(JEDEN);
    },
  );

  it.each([401, 403])(
    "ekran startowy: odpowiedź %i przy odczycie pokazuje stan brak uprawnień i nie pokazuje formularza",
    async (status) => {
      transport("project_manager", { "/onboarding": ZAKAZ(status) });
      const { container } = await zloz(<StronaEkranu />);

      await screen.findByText("Ten ekran redaguje administracja");
      expect(container.querySelectorAll("textarea, input")).toHaveLength(0);
      expect(container.textContent ?? "").not.toContain("Film powitalny testowy");
    },
  );

  it("ekran startowy: odmowa 403 dopiero przy zapisie usuwa formularz i podgląd z DOM", async () => {
    transport("project_manager", { "/onboarding": EKRAN, "/admin/onboarding": ZAKAZ() });
    const { container } = await zloz(<StronaEkranu />);
    const uzytkownik = userEvent.setup();

    const tytul = await screen.findByLabelText(/^Tytuł filmu powitalnego/);
    await uzytkownik.clear(tytul);
    await uzytkownik.type(tytul, "Zmieniony tytuł");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));

    await screen.findByText("Ten ekran redaguje administracja");
    await waitFor(() => expect(container.querySelectorAll("textarea, input")).toHaveLength(0));
    expect(container.textContent ?? "").not.toContain("Treść programu testowego.");
    expect(zmierz(container)).toEqual(JEDEN);
  });
});
