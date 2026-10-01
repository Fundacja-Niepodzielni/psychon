import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `pobierzDaneKursuAdministracji` — dane kursu dla ekranu administracji
 * w tym samym kształcie co `pobierzDaneKursu` prowadzącego, ale z tras
 * `/admin/…`. Atrapa stoi na funkcji `api` OBU modułów klienta (`@/lib/api`
 * i `@/lib/api/klient`); próba czyta adres i metodę żądań.
 */

const api = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});

const { pobierzDaneKursuAdministracji } = await import("../dane-administracji");
const { ApiError } = await import("@/lib/api/klient");

const KURS = { id: 4, title: "Kurs", description: null, lessons_count: 1, materials_count: 0 };
const LEKCJA = { id: 21, course_id: 4, title: "Lekcja A", duration_seconds: 600, video_provider_id: null };

function odpowiedzi(kurs: unknown, lekcje: unknown) {
  api.mockImplementation(async (sciezka: string) => {
    const wynik = sciezka.endsWith("/lessons") ? lekcje : kurs;
    if (wynik instanceof Error) throw wynik;
    return wynik;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pobierzDaneKursuAdministracji — trasy i kształt wyniku", () => {
  it("GET /admin/courses/{id} i GET /admin/courses/{id}/lessons, nic więcej i nic z tras prowadzącego", async () => {
    odpowiedzi(KURS, [LEKCJA]);

    const wynik = await pobierzDaneKursuAdministracji("4");

    expect(wynik).toEqual({ status: "ok", dane: { kurs: KURS, lekcje: [LEKCJA] } });
    expect(api.mock.calls.map(([sciezka, opcje]) => [sciezka, opcje?.method ?? "GET"])).toEqual([
      ["/admin/courses/4", "GET"],
      ["/admin/courses/4/lessons", "GET"],
    ]);
  });

  it("kurs bez lekcji i bez materiałów: status „pusty” z danymi kursu", async () => {
    odpowiedzi({ ...KURS, lessons_count: 0 }, []);
    const wynik = await pobierzDaneKursuAdministracji("4");
    expect(wynik.status).toBe("pusty");
    expect(wynik.status === "pusty" && wynik.dane.lekcje).toEqual([]);
  });

  it("odpowiedź 403: brak uprawnień", async () => {
    odpowiedzi(new ApiError({ status: 403, code: "forbidden", message: "Brak uprawnień." }), [LEKCJA]);
    expect(await pobierzDaneKursuAdministracji("4")).toEqual({ status: "brak-uprawnien" });
  });

  it("odpowiedź 401: brak sesji, nie brak uprawnień", async () => {
    odpowiedzi(new ApiError({ status: 401, code: "unauthenticated", message: "Brak ważnego tokenu." }), [LEKCJA]);
    expect(await pobierzDaneKursuAdministracji("4")).toEqual({ status: "brak-sesji" });
  });

  it("błąd odczytu lekcji daje „blad”, nie kurs z pustą listą lekcji", async () => {
    odpowiedzi(KURS, new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }));
    expect(await pobierzDaneKursuAdministracji("4")).toEqual({ status: "blad" });
  });

  it("brak kursu (404): „nie-znaleziono”; wyjątek sieci: „blad”", async () => {
    odpowiedzi(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." }), []);
    expect(await pobierzDaneKursuAdministracji("4")).toEqual({ status: "nie-znaleziono" });
    odpowiedzi(new TypeError("Failed to fetch"), []);
    expect(await pobierzDaneKursuAdministracji("4")).toEqual({ status: "blad" });
  });

  it("identyfikator spoza liczb: „blad” bez żądania", async () => {
    expect(await pobierzDaneKursuAdministracji("4/../5")).toEqual({ status: "blad" });
    expect(api).not.toHaveBeenCalled();
  });
});

describe("pobierzDaneKursuAdministracji — źródła", () => {
  const KATALOG = join(process.cwd(), "nowy-front/kurs-publikacja");
  const zrodlo = readFileSync(join(KATALOG, "dane-administracji.ts"), "utf-8");

  it("obie trasy woła istniejącymi funkcjami sekcji, bez własnego adresu", () => {
    expect(zrodlo).toMatch(/import \{ pobierzLekcjeKursu \} from "@\/nowy-front\/lekcja-edycja\/dane";/);
    expect(zrodlo).toMatch(/import \{[^}]*\bpobierzKurs\b[^}]*\} from "@\/nowy-front\/publikacja-kursu\/dane";/);
    const kod = zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(kod).not.toMatch(/\/admin\//);
    expect(kod).not.toMatch(/\/instructor\//);
    expect(kod).not.toMatch(/\bfetch\(/);
  });

  it("dane prowadzącego zostają bez klienta przeglądarki — strona serwerowa czyta je własnym żądaniem", () => {
    const danePro = readFileSync(join(KATALOG, "dane.ts"), "utf-8");
    expect(existsSync(join(KATALOG, "dane.ts"))).toBe(true);
    expect(danePro).not.toMatch(/from "@\/lib\/api(\/klient)?"/);
    expect(danePro).not.toMatch(/from "\.\/dane-administracji"/);
    expect(danePro).not.toMatch(/next-auth/);
  });
});
