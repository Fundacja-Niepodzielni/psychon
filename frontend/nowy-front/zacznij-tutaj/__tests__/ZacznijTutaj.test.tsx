import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Ekran „Zacznij tutaj”: wczytywanie, błąd z ponowieniem, treść uczestnika bez
 * narzędzi administracji, film według reguły pokazania (odtwarzacz YouTube w
 * piaskownicy, inny adres https tylko jako odnośnik, reszta nic), brak filmu, administracja
 * (data zmiany, odnośnik do edycji), ukończony program — te same odczyty co
 * stara strona (`/onboarding`, `/me`).
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/panel/start",
}));

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));

const { ZacznijTutaj } = await import("../ZacznijTutaj");

const EKRAN = {
  video: { title: "Powitanie", url: "https://youtu.be/demo123", caption: "Krótkie powitanie od zespołu." },
  program: { title: "Jak przebiega program", body: "Etap pierwszy.\nEtap drugi." },
  expectations: { title: "Czego oczekujemy", body: "Regularnej nauki." },
  updated_at: "2026-09-30T18:50:00Z",
};
const UCZESTNIK = { role: "volunteer", program_completed_at: null };

let straznik: ReturnType<typeof straznikHostow>;

function odpowiedzi(onboarding: unknown, me: unknown) {
  api.mockImplementation((sciezka: string) => {
    const wynik = sciezka === "/onboarding" ? onboarding : me;
    return wynik instanceof Error ? Promise.reject(wynik) : Promise.resolve(wynik);
  });
}

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<ZacznijTutaj />);
  });
  return wynik!;
}

beforeEach(() => {
  api.mockReset();
  back.mockReset();
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("zacznij tutaj — stany", () => {
  it("wczytywanie: nagłówek, status, jeden main i jeden h1", async () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();
    expect(screen.getByRole("heading", { level: 1, name: "Zacznij tutaj" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Wczytywanie ekranu startowego…" })).toBeTruthy();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(() => jedenMain(container)).not.toThrow();
    expect(api).toHaveBeenCalledWith("/onboarding");
    expect(api).toHaveBeenCalledWith("/me");
  });

  it("błąd /onboarding: komunikat i ponowienie, które pyta ponownie", async () => {
    odpowiedzi(new Error("500"), UCZESTNIK);
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain(
      "Nie udało się wczytać ekranu. Sprawdź połączenie i spróbuj ponownie.",
    );
    odpowiedzi(EKRAN, UCZESTNIK);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(api.mock.calls.filter(([s]) => s === "/onboarding")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "Powitanie" })).toBeTruthy();
  });

  it("uczestnik: trzy sekcje, film przez regułę osadzenia, bez narzędzi administracji", async () => {
    odpowiedzi(EKRAN, UCZESTNIK);
    const { container } = await pokaz();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Powitanie",
      "Jak przebiega program",
      "Czego oczekujemy",
    ]);
    const ramka = container.querySelector("iframe");
    expect(ramka?.getAttribute("src")).toBe("https://www.youtube.com/embed/demo123");
    expect(ramka?.getAttribute("title")).toBe("Powitanie");
    expect(screen.getByText("Krótkie powitanie od zespołu.")).toBeTruthy();
    expect(screen.getByText(/Etap pierwszy\.\s+Etap drugi\./)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edytuj treść" })).toBeNull();
    expect(screen.queryByText(/Ostatnia zmiana treści/)).toBeNull();
  });

  it("odtwarzacz YouTube stoi w piaskownicy i wysyła tylko pochodzenie strony", async () => {
    odpowiedzi(EKRAN, UCZESTNIK);
    const { container } = await pokaz();
    const ramki = container.querySelectorAll("iframe");
    expect(ramki).toHaveLength(1);
    expect(ramki[0].getAttribute("src")).toBe("https://www.youtube.com/embed/demo123");
    expect(ramki[0].getAttribute("sandbox")?.split(/\s+/).sort()).toEqual([
      "allow-popups",
      "allow-presentation",
      "allow-same-origin",
      "allow-scripts",
    ]);
    expect(ramki[0].getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(screen.queryByRole("link", { name: "Otwórz film w nowej karcie" })).toBeNull();
  });

  it("uprawnienia odtwarzacza: czujniki ruchu, autoodtwarzanie, zaszyfrowane media i obraz w obrazie — bez zapisu do schowka", async () => {
    odpowiedzi(EKRAN, UCZESTNIK);
    const { container } = await pokaz();
    const ramka = container.querySelector("iframe");
    expect(ramka?.getAttribute("allow")?.split(/;\s*/)).toEqual([
      "accelerometer",
      "autoplay",
      "encrypted-media",
      "gyroscope",
      "picture-in-picture",
    ]);
  });

  it.each([
    "https://evilyoutube.com/watch?v=x",
    "https://youtube.com.example.com/watch?v=x",
    "https://player.vimeo.com/video/1",
  ])("adres https spoza YouTube (%s): tylko odnośnik w nowej karcie, nigdy ramka", async (url) => {
    odpowiedzi({ ...EKRAN, video: { ...EKRAN.video, url } }, UCZESTNIK);
    const { container } = await pokaz();
    expect(container.querySelector("iframe")).toBeNull();
    const odnosnik = screen.getByRole("link", { name: "Otwórz film w nowej karcie" });
    expect(odnosnik.getAttribute("href")).toBe(url);
    expect(odnosnik.getAttribute("target")).toBe("_blank");
    expect(odnosnik.getAttribute("rel")?.split(/\s+/).sort()).toEqual(["noopener", "noreferrer"]);
    expect(screen.getByText("Krótkie powitanie od zespołu.")).toBeTruthy();
  });

  it.each(["http://youtu.be/demo123", "http://example.com/film.mp4", "javascript:alert(1)", "nie adres"])(
    "adres bez https albo nieczytelny (%s): ani ramki, ani odnośnika, ani błędu",
    async (url) => {
      odpowiedzi({ ...EKRAN, video: { ...EKRAN.video, url } }, UCZESTNIK);
      const { container } = await pokaz();
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.queryByRole("link", { name: "Otwórz film w nowej karcie" })).toBeNull();
      expect(container.querySelector(`a[href="${url}"]`)).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
        "Powitanie",
        "Jak przebiega program",
        "Czego oczekujemy",
      ]);
    },
  );

  it("brak filmu: podpis albo zdanie domyślne, bez ramki", async () => {
    odpowiedzi({ ...EKRAN, video: { title: "Powitanie", url: null, caption: null } }, UCZESTNIK);
    const { container } = await pokaz();
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("Film pojawi się tutaj wkrótce.")).toBeTruthy();
  });

  it("treść jeszcze niewypełniona (puste tytuły i teksty z serwera): ekran działa jak dawny — bez pustych nagłówków i akapitów, z polem na film", async () => {
    odpowiedzi(
      {
        video: { title: "", url: null, caption: null },
        program: { title: "", body: "" },
        expectations: { title: " ", body: "  " },
        updated_at: null,
      },
      UCZESTNIK,
    );
    const { container } = await pokaz();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Zacznij tutaj" })).toBeTruthy();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.getByText("Film pojawi się tutaj wkrótce.")).toBeTruthy();
    const puste = Array.from(container.querySelectorAll("p, h2")).filter((el) => (el.textContent ?? "").trim() === "");
    expect(puste).toHaveLength(0);
  });

  it("pusty podpis bez filmu i podpis z samych spacji pod filmem: bez pustego akapitu, bez błędu", async () => {
    odpowiedzi({ ...EKRAN, video: { title: "Powitanie", url: null, caption: "" } }, UCZESTNIK);
    const { container, unmount } = await pokaz();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Film pojawi się tutaj wkrótce.")).toBeNull();
    expect(Array.from(container.querySelectorAll("p")).filter((el) => (el.textContent ?? "").trim() === "")).toHaveLength(0);
    unmount();

    odpowiedzi({ ...EKRAN, video: { ...EKRAN.video, caption: "   " } }, UCZESTNIK);
    const drugi = await pokaz();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(drugi.container.querySelector("iframe")).not.toBeNull();
    expect(Array.from(drugi.container.querySelectorAll("p")).filter((el) => (el.textContent ?? "").trim() === "")).toHaveLength(0);
  });

  it("błąd /me nie psuje ekranu (bez roli — bez narzędzi administracji)", async () => {
    odpowiedzi(EKRAN, new Error("401"));
    await pokaz();
    expect(screen.getByRole("heading", { level: 2, name: "Powitanie" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edytuj treść" })).toBeNull();
  });

  it("administracja: data ostatniej zmiany i odnośnik do edycji treści", async () => {
    odpowiedzi(EKRAN, { role: "project_manager", program_completed_at: null });
    await pokaz();
    expect(screen.getByText("Ostatnia zmiana treści: 30 września 2026, 20:50")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edytuj treść" }).getAttribute("href")).toBe("/admin/ekran-startowy");
  });

  it("program ukończony: data i odnośnik do ekranu po programie", async () => {
    odpowiedzi(EKRAN, { role: "volunteer", program_completed_at: "2026-10-01T08:00:00Z" });
    await pokaz();
    expect(screen.getByText(/Program ukończony 1 października 2026, 10:00\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Przejdź do ekranu po programie" }).getAttribute("href")).toBe(
      "/panel/po-programie",
    );
  });

  it("„Wstecz” poza ramką panelu woła router.back", async () => {
    odpowiedzi(EKRAN, UCZESTNIK);
    await pokaz();
    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
