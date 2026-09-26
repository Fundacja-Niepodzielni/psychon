import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Ekran raportu (H20) z prawdziwym `fetchReports` i prawdziwą listą osób
 * (H18) — podmieniony jest wyłącznie transport HTTP (`@/lib/api/klient`)
 * i nawigacja Nexta. Dzięki temu próby czytają to, co ekran pokazał, a nie
 * to, co jest w atrapie albo w atrybucie `href`.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

/** Adres, pod którym „stoi" przeglądarka; lista osób czyta z niego parametry. */
let biezacyAdres = new URL("http://localhost/admin/raport");

vi.mock("next/navigation", () => ({
  usePathname: () => biezacyAdres.pathname,
  useSearchParams: () => new URLSearchParams(biezacyAdres.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: ReportView } = await import("@/components/h20/ReportView");
const { default: UsersPage } = await import("@/app/(administracja)/admin/uczestniczki/page");

/**
 * Odpowiedź `GET /admin/reports` w kształcie, który zwraca zaplecze
 * (`backend/app/Services/H20/ReportSummary.php`, `build()`). Klucze
 * `summary` są niżej porównywane z plikiem zaplecza, więc atrapa nie może
 * po cichu odjechać od tego, co zaplecze naprawdę wysyła.
 *
 * `people_with_passed_test` (2 osoby: Marta i Ola) celowo różni się od sumy
 * `people[].tests_passed` (1 + 3 + 0 + 0 = 4) — kafelek ma pokazać liczbę
 * osób, a nie liczbę testów.
 */
const ODPOWIEDZ_ZAPLECZA = {
  summary: {
    admitted: 4,
    active: 3,
    completed: 1,
    hours_accepted_total: "113.5",
    hours_accepted_average: "37.8",
    consultations_total: 101,
    certificates_issued: 1,
    people_with_passed_test: 2,
  },
  people: [
    osoba(1, "Marta", "active", "kurs", 1, false),
    osoba(2, "Ola", "active", "certyfikat", 3, true),
    osoba(3, "Filip", "blocked", "staz", 0, false),
    osoba(4, "Kasia", "active", "kurs", 0, false),
  ],
};

function osoba(
  id: number,
  imie: string,
  status: "active" | "blocked",
  stage: string,
  testsPassed: number,
  certyfikat: boolean,
) {
  return {
    id,
    first_name: imie,
    last_name: "Demo",
    role: "volunteer",
    status,
    hours_accepted: "0",
    consultations: 0,
    certificate_issued: certyfikat,
    stage,
    stage_label: stage,
    tests_passed: testsPassed,
  };
}

/**
 * Konta w bazie widziane przez `GET /admin/users`: cztery osoby z raportu
 * i jedna osoba z administracji (lista osób pokazuje wszystkie role).
 */
const KONTA = [
  ...ODPOWIEDZ_ZAPLECZA.people.map((o) => ({
    id: o.id,
    first_name: o.first_name,
    last_name: o.last_name,
    email: `${o.first_name.toLowerCase()}@demo.pl`,
    role: o.role,
    status: o.status,
    product_group: "psychon",
    access_expires_at: null,
    program_completed_at: null,
    created_at: null,
  })),
  {
    id: 9,
    first_name: "Joanna",
    last_name: "Demo",
    email: "joanna@demo.pl",
    role: "project_manager",
    status: "active",
    product_group: "psychon",
    access_expires_at: null,
    program_completed_at: null,
    created_at: null,
  },
];

/**
 * Zaplecze listy osób zna wyłącznie `role`, `status`, `search` i `sort`
 * (`backend/app/Queries/AdminUserQuery.php`); każdy inny parametr jest
 * pomijany. Zaślepka robi to samo — inaczej próba mierzyłaby filtr, którego
 * zaplecze nie ma.
 */
function odpowiedzListy(sciezka: string) {
  const adres = new URL(sciezka, "http://localhost");
  const role = adres.searchParams.get("role") ?? "";
  const status = adres.searchParams.get("status") ?? "";
  const search = (adres.searchParams.get("search") ?? "").toLowerCase();
  const data = KONTA.filter(
    (k) =>
      (role === "" || k.role === role) &&
      (status === "" || k.status === status) &&
      (search === "" || `${k.first_name} ${k.last_name} ${k.email}`.toLowerCase().includes(search)),
  );
  return { data, meta: { current_page: 1, per_page: 25, total: data.length, last_page: 1 } };
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  biezacyAdres = new URL("http://localhost/admin/raport");
  api.mockImplementation(async (sciezka: string) => {
    if (sciezka.startsWith("/admin/reports")) return ODPOWIEDZ_ZAPLECZA;
    throw new Error(`Nieoczekiwane zapytanie: ${sciezka}`);
  });
  apiPaged.mockImplementation(async (sciezka: string) => {
    if (sciezka.startsWith("/admin/users")) return odpowiedzListy(sciezka);
    throw new Error(`Nieoczekiwane zapytanie: ${sciezka}`);
  });
});

/** Kafelki podsumowania: tytuł, pokazana wartość i ewentualny odnośnik. */
const TYTULY_KAFELKOW = [
  "Osoby przyjęte",
  "Osoby aktywne",
  "Programy ukończone",
  "Certyfikaty wydane",
  "Zaliczone testy",
] as const;

function odczytajKafelek(tytul: string) {
  // Tytuł kafelka to akapit; nagłówek kolumny tabeli o tej samej treści to `th`.
  const naglowek = screen.getByText(tytul, { selector: "p" });
  const wartosc = naglowek.nextElementSibling as HTMLElement | null;
  const odnosnik = wartosc?.querySelector("a") ?? null;
  return {
    tytul,
    wartosc: wartosc?.textContent ?? "",
    href: odnosnik?.getAttribute("href") ?? null,
  };
}

async function wczytanyRaport() {
  render(<ReportView />);
  await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/reports"));
  // Raport wczytany: wiersz osoby z odpowiedzi jest na ekranie.
  await screen.findByText("Marta Demo");
}

describe("ReportView — kafelek czyta pole, które zwraca zaplecze", () => {
  it("klucze summary w atrapie są dokładnie kluczami summary z ReportSummary::build()", () => {
    const katalog = path.dirname(fileURLToPath(import.meta.url));
    const zrodlo = readFileSync(
      path.resolve(katalog, "../../../../backend/app/Services/H20/ReportSummary.php"),
      "utf8",
    );
    const build = zrodlo.slice(zrodlo.indexOf("public static function build("));
    const blok = build.match(/'summary' => \[([\s\S]*?)\n\s{12}\],/);
    expect(blok, "Nie znaleziono tablicy summary w build()").not.toBeNull();
    const kluczeZaplecza = [...(blok?.[1] ?? "").matchAll(/^\s{16}'(\w+)' =>/gm)].map((m) => m[1]);

    expect(kluczeZaplecza.length).toBeGreaterThan(0);
    expect([...kluczeZaplecza].sort()).toEqual(Object.keys(ODPOWIEDZ_ZAPLECZA.summary).sort());
  });

  it("kafelek „Zaliczone testy” pokazuje summary.people_with_passed_test, a nie sumę testów z wierszy", async () => {
    await wczytanyRaport();

    expect(odczytajKafelek("Zaliczone testy").wartosc).toBe("2");
  });

  it("pozostałe kafelki pokazują swoje pola z koperty zaplecza", async () => {
    await wczytanyRaport();

    expect(odczytajKafelek("Osoby przyjęte").wartosc).toBe("4");
    expect(odczytajKafelek("Osoby aktywne").wartosc).toBe("3");
    expect(odczytajKafelek("Programy ukończone").wartosc).toBe("1");
    expect(odczytajKafelek("Certyfikaty wydane").wartosc).toBe("1");
  });
});

describe("ReportView — odnośnik z kafelka prowadzi do listy, która daje tę liczbę", () => {
  it("każdy kafelek będący odnośnikiem do listy osób otwiera listę z dokładnie tyloma osobami, ile pokazuje", async () => {
    await wczytanyRaport();

    const kafelki = TYTULY_KAFELKOW.map(odczytajKafelek);
    // Wszystkie kafelki mają wartość — próba nie przechodzi na pustym ekranie.
    expect(kafelki.map((k) => k.wartosc)).toEqual(["4", "3", "1", "1", "2"]);

    const doListy = kafelki.filter((k) => k.href?.startsWith("/admin/uczestniczki"));
    const niezgodne: string[] = [];

    for (const kafelek of doListy) {
      cleanup();
      apiPaged.mockClear();
      biezacyAdres = new URL(kafelek.href as string, "http://localhost");
      render(<UsersPage />);

      // Lista wczytana: zapytanie poszło i stan ładowania zniknął. Pusta lista
      // (filtr bez wyników) jest poprawnym wynikiem — wtedy tabeli nie ma.
      await waitFor(() => expect(apiPaged).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText("Wczytywanie listy…")).toBeNull());
      const tabela = screen.queryByRole("table", { name: "Lista osób w programie" });
      const pusto = screen.queryByText("Brak osób spełniających kryteria.");
      expect(tabela ?? pusto, `Lista pod ${kafelek.href} nie pokazała wyniku`).not.toBeNull();
      const wiersze = tabela
        ? within(tabela)
            .queryAllByRole("link")
            .filter((a) => /^\/admin\/uczestniczki\/\d+$/.test(a.getAttribute("href") ?? ""))
        : [];

      if (String(wiersze.length) !== kafelek.wartosc) {
        niezgodne.push(
          `${kafelek.tytul}: kafelek ${kafelek.wartosc}, lista pod ${kafelek.href} pokazuje ${wiersze.length}`,
        );
      }
    }

    expect(niezgodne).toEqual([]);
  });
});
