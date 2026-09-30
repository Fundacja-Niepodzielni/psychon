import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { kursZeSchematu } from "./pomocnicy";

/**
 * Ekran „Publikacja kursu” (`PublikacjaKursu`) — stany w obszarze treści
 * `FormTemplate`, zapis publikacji i cofnięcia, brak zapisu przy `422`,
 * usunięcie z potwierdzeniem. Atrapa na poziomie `fetch`: próba widzi
 * dokładnie te żądania, które poszłyby do serwera.
 */

const back = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { PublikacjaKursu } = await import("../PublikacjaKursu");

interface OdpowiedzAtrapy {
  status: number;
  cialo: unknown;
}

type Trasa = OdpowiedzAtrapy | (() => Promise<OdpowiedzAtrapy>) | "siec";

/** Serwer atrapy: klucz `METODA` → odpowiedź; każde żądanie do API trafia do dziennika. */
function serwer(trasy: Partial<Record<"GET" | "PATCH" | "DELETE", Trasa>>) {
  const dziennik: { metoda: string; adres: string; cialo: unknown }[] = [];
  const fetchMock = vi.fn(async (adres: RequestInfo | URL, opcje?: RequestInit) => {
    if (String(adres).includes("/api/auth/session")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: "token-test", expiresAt: Date.now() + 600_000 }),
      };
    }
    const metoda = (opcje?.method ?? "GET").toUpperCase() as "GET" | "PATCH" | "DELETE";
    dziennik.push({
      metoda,
      adres: String(adres),
      cialo: typeof opcje?.body === "string" ? JSON.parse(opcje.body) : undefined,
    });
    const trasa = trasy[metoda];
    if (trasa === "siec" || trasa === undefined) throw new TypeError("Failed to fetch");
    const odpowiedz = typeof trasa === "function" ? await trasa() : trasa;
    return {
      ok: odpowiedz.status >= 200 && odpowiedz.status < 300,
      status: odpowiedz.status,
      json: async () => odpowiedz.cialo,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    dziennik,
    zapisy: () => dziennik.filter((wpis) => wpis.metoda !== "GET"),
  };
}

function kurs(nadpisania: Record<string, unknown> = {}) {
  return { status: 200, cialo: { data: kursZeSchematu(nadpisania) } };
}

function blad(status: number, code: string, message: string, reason?: Record<string, unknown>) {
  return { status, cialo: { error: { status, code, message, reason } } };
}

function wyrenderuj(id = "5") {
  return render(<PublikacjaKursu idKursu={id} />);
}

function przyciskiGlowne(kontener: HTMLElement): HTMLElement[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("button")).filter((przycisk) =>
    przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function znacznikSzablonu(kontener: HTMLElement) {
  return kontener.querySelector("main")?.getAttribute("data-style-id");
}

function stanPublikacji(kontener: HTMLElement) {
  return kontener.querySelector("[data-stan-publikacji]")?.getAttribute("data-stan-publikacji");
}

beforeEach(() => {
  back.mockClear();
  push.mockClear();
  vi.unstubAllGlobals();
});

describe("stany ekranu w szablonie formularza", () => {
  it("ładowanie: jeden main, znacznik szablonu, szkielet", async () => {
    serwer({ GET: () => new Promise(() => undefined) });
    const { container } = wyrenderuj();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
  });

  it("kurs nieopublikowany: przycisk główny „Opublikuj kurs”, plakietka Szkic", async () => {
    serwer({ GET: kurs({ is_published: false }) });
    const { container } = wyrenderuj();
    expect(await screen.findByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
    expect(stanPublikacji(container)).toBe("szkic");
    expect(screen.getByText("Szkic")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Wywiad psychologiczny" })).toBeInTheDocument();
    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Opublikuj kurs");
  });

  it("kurs opublikowany: „Cofnij publikację” jest w DOM bez interakcji, drugorzędny, brak przycisku głównego", async () => {
    serwer({ GET: kurs({ is_published: true }) });
    const { container } = wyrenderuj();
    await screen.findByText("Opublikowany");
    expect(stanPublikacji(container)).toBe("opublikowany");
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
    const cofnij = screen.getByRole("button", { name: "Cofnij publikację" });
    expect(cofnij.className).not.toMatch(/(^|_)primary(_|$)/);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Usuń kurs" })).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("403: komunikat o braku dostępu, jeden main, znacznik szablonu", async () => {
    serwer({ GET: blad(403, "forbidden", "Nie masz dostępu do tego zasobu.") });
    const { container } = wyrenderuj();
    expect(await screen.findByText(/tylko dla administracji/)).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
  });

  it("404: komunikat „Nie znaleziono kursu”, jeden main, znacznik szablonu", async () => {
    serwer({ GET: blad(404, "not_found", "Nie znaleziono zasobu.") });
    const { container } = wyrenderuj();
    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
  });

  it("identyfikator niebędący liczbą: 404 bez żadnego żądania", async () => {
    const s = serwer({ GET: kurs() });
    const { container } = wyrenderuj("abc");
    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(s.dziennik).toHaveLength(0);
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
  });

  it("błąd sieci: Notice z ponowieniem, po ponowieniu wraca kurs", async () => {
    const uzytkownik = userEvent.setup();
    const s = serwer({ GET: "siec" });
    const { container } = wyrenderuj();
    expect(await screen.findByText("Nie udało się wczytać kursu")).toBeInTheDocument();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
    expect(() => jedenMain(container)).not.toThrow();
    serwer({ GET: kurs() });
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
    expect(s.zapisy()).toHaveLength(0);
  });
});

describe("opublikowanie", () => {
  it("klik „Opublikuj kurs” wysyła jedno PATCH z {is_published:true}, potem stan opublikowany i powiadomienie", async () => {
    const uzytkownik = userEvent.setup();
    const s = serwer({
      GET: kurs({ is_published: false }),
      PATCH: kurs({ is_published: true }),
    });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    await waitFor(() => expect(stanPublikacji(container)).toBe("opublikowany"));
    const zapisy = s.zapisy();
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].metoda).toBe("PATCH");
    expect(zapisy[0].adres).toMatch(/\/api\/v1\/admin\/courses\/5$/);
    expect(zapisy[0].cialo).toEqual({ is_published: true });
    expect(screen.getByRole("status")).toHaveTextContent("Kurs został opublikowany.");
    expect(screen.getByText("Opublikowany")).toBeInTheDocument();
    expect(() => jedenMain(container)).not.toThrow();
  });

  it("dwa szybkie kliknięcia w czasie zapisu nie dają drugiego żądania", async () => {
    const uzytkownik = userEvent.setup();
    let dokoncz: (o: OdpowiedzAtrapy) => void = () => undefined;
    const s = serwer({
      GET: kurs({ is_published: false }),
      PATCH: () => new Promise<OdpowiedzAtrapy>((rozwiaz) => (dokoncz = rozwiaz)),
    });
    wyrenderuj();
    const przycisk = await screen.findByRole("button", { name: "Opublikuj kurs" });
    await uzytkownik.click(przycisk);
    await uzytkownik.click(przycisk);
    expect(s.zapisy()).toHaveLength(1);
    await act(async () => dokoncz(kurs({ is_published: true })));
  });

  it("kontrola dodatnia: atrapa zwracająca kurs nadal nieopublikowany nie zmienia stanu w DOM", async () => {
    const uzytkownik = userEvent.setup();
    serwer({ GET: kurs({ is_published: false }), PATCH: kurs({ is_published: false }) });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    await screen.findByRole("status");
    expect(stanPublikacji(container)).toBe("szkic");
  });
});

describe("cofnięcie publikacji", () => {
  it("klik „Cofnij publikację” wysyła jedno PATCH z {is_published:false}", async () => {
    const uzytkownik = userEvent.setup();
    const s = serwer({
      GET: kurs({ is_published: true }),
      PATCH: kurs({ is_published: false }),
    });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Cofnij publikację" }));
    await waitFor(() => expect(stanPublikacji(container)).toBe("szkic"));
    const zapisy = s.zapisy();
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].cialo).toEqual({ is_published: false });
    expect(screen.getByRole("status")).toHaveTextContent("Publikacja kursu została cofnięta.");
    expect(await screen.findByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
  });
});

describe("odmowa publikacji", () => {
  it("422 conditions_not_met: lista braków z reason.missing, stan kursu bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    serwer({
      GET: kurs({ is_published: false, lessons_count: 0 }),
      PATCH: blad(422, "conditions_not_met", "Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.", {
        missing: ["lessons"],
      }),
    });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    const panel = await screen.findByRole("region", { name: "Braki przed publikacją" });
    const odnosnik = within(panel).getByRole("link", { name: "Dodaj co najmniej jedną lekcję" });
    expect(odnosnik).toHaveAttribute("href", "/nowy-front/kurs/5");
    expect(stanPublikacji(container)).toBe("szkic");
    expect(screen.getByText("Szkic")).toBeInTheDocument();
    expect(screen.queryByText("Opublikowany")).toBeNull();
    expect(screen.getByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
    expect(przyciskiGlowne(container)).toHaveLength(1);
  });

  it("panel braków zamyka się przyciskiem Zamknij", async () => {
    const uzytkownik = userEvent.setup();
    serwer({
      GET: kurs({ lessons_count: 0 }),
      PATCH: blad(422, "conditions_not_met", "Brak lekcji.", { missing: ["lessons"] }),
    });
    wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    const panel = await screen.findByRole("region", { name: "Braki przed publikacją" });
    await uzytkownik.click(within(panel).getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByRole("region", { name: "Braki przed publikacją" })).toBeNull();
  });

  it("403 przy zapisie: Notice o braku uprawnień, stan bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    serwer({ GET: kurs(), PATCH: blad(403, "forbidden", "Nie masz dostępu do tego zasobu.") });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    expect(await screen.findByText(zdanieOdmowyRoli("administracji"))).toBeInTheDocument();
    expect(stanPublikacji(container)).toBe("szkic");
  });

  it("404 przy zapisie: ekran „Nie znaleziono kursu”", async () => {
    const uzytkownik = userEvent.setup();
    serwer({ GET: kurs(), PATCH: blad(404, "not_found", "Nie znaleziono zasobu.") });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
  });

  it("błąd sieci przy zapisie: Notice, stan bez zmian, przycisk nadal dostępny", async () => {
    const uzytkownik = userEvent.setup();
    const s = serwer({ GET: kurs(), PATCH: "siec" });
    const { container } = wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Opublikuj kurs" }));
    expect(await screen.findByText("Nie udało się opublikować kursu")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia z serwerem");
    expect(stanPublikacji(container)).toBe("szkic");
    expect(s.zapisy()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Opublikuj kurs" })).toBeInTheDocument();
  });
});

describe("usunięcie kursu", () => {
  async function otworzOknoUsuniecia() {
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(await screen.findByRole("button", { name: /Usunięcie kursu/ }));
    const usun = screen.getByRole("button", { name: "Usuń kurs" });
    expect(usun.className).not.toMatch(/(^|_)primary(_|$)/);
    await uzytkownik.click(usun);
    return { uzytkownik, okno: await screen.findByRole("dialog") };
  }

  it("bez potwierdzenia nie wysyła DELETE; Anuluj zamyka okno", async () => {
    const s = serwer({ GET: kurs(), DELETE: { status: 200, cialo: { data: { id: 5, deleted: true } } } });
    wyrenderuj();
    const { uzytkownik, okno } = await otworzOknoUsuniecia();
    expect(s.zapisy()).toHaveLength(0);
    await uzytkownik.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.zapisy()).toHaveLength(0);
  });

  it("potwierdzenie: jedno DELETE, potem komunikat z odnośnikiem do listy, bez 404", async () => {
    const s = serwer({ GET: kurs(), DELETE: { status: 200, cialo: { data: { id: 5, deleted: true } } } });
    const { container } = wyrenderuj();
    const { uzytkownik, okno } = await otworzOknoUsuniecia();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń kurs" }));
    expect(await screen.findByText("Kurs został usunięty")).toBeInTheDocument();
    const zapisy = s.zapisy();
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].metoda).toBe("DELETE");
    expect(zapisy[0].adres).toMatch(/\/api\/v1\/admin\/courses\/5$/);
    expect(screen.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/admin/kursy");
    expect(screen.queryByText("Nie znaleziono kursu")).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();
    expect(znacznikSzablonu(container)).toBe("szablon-formularz");
  });

  it("422 conditions_not_met przy usuwaniu: komunikat serwera w oknie, kurs zostaje", async () => {
    serwer({
      GET: kurs(),
      DELETE: blad(422, "conditions_not_met", "Ten kurs jest prerekwizytem kolejnych etapów ścieżki.", {
        blocking_course_ids: [7],
      }),
    });
    const { container } = wyrenderuj();
    const { uzytkownik, okno } = await otworzOknoUsuniecia();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń kurs" }));
    expect(await within(await screen.findByRole("dialog")).findByText(/prerekwizytem/)).toBeInTheDocument();
    expect(stanPublikacji(container)).toBe("szkic");
  });

  it("403 przy usuwaniu: w oknie pełne zdanie odmowy z rolą, kurs zostaje", async () => {
    const s = serwer({ GET: kurs(), DELETE: blad(403, "forbidden", "Nie masz dostępu do tego zasobu.") });
    const { container } = wyrenderuj();
    const { uzytkownik, okno } = await otworzOknoUsuniecia();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń kurs" }));
    expect(await within(await screen.findByRole("dialog")).findByText(zdanieOdmowyRoli("administracji"))).toBeInTheDocument();
    expect(s.zapisy()).toHaveLength(1);
    expect(stanPublikacji(container)).toBe("szkic");
    expect(screen.queryByText("Kurs został usunięty")).toBeNull();
  });

  it("Escape w oknie zamyka okno i nie przenosi na inny ekran", async () => {
    serwer({ GET: kurs() });
    wyrenderuj();
    const { uzytkownik } = await otworzOknoUsuniecia();
    await uzytkownik.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("nawigacja", () => {
  it("„Wróć do kursu” prowadzi do ekranu tematów i lekcji", async () => {
    const uzytkownik = userEvent.setup();
    serwer({ GET: kurs() });
    wyrenderuj();
    await uzytkownik.click(await screen.findByRole("button", { name: "Wróć do kursu" }));
    expect(push).toHaveBeenCalledWith("/nowy-front/kurs/5");
  });
});
