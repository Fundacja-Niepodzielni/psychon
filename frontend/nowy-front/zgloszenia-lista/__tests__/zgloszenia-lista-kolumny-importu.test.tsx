import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Panel importu zgłoszeń z pliku CSV podaje wymagane nazwy kolumn dokładnie tak, jak czyta je zaplecze
 * (`ApplicationCsvImporter`: `$required`). Nazwy bierzemy z kodu zaplecza w próbie, nie z pamięci: gdy zaplecze
 * zmieni listę, ta próba czerwieni się, zanim osoba z administracji dostanie plik, którego import nie przyjmie.
 */

const apiPaged = vi.fn();
const api = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

const dane = await import("../dane");
const { ZgloszeniaLista } = await import("../ZgloszeniaLista");

/** Wymagane kolumny wprost z kodu importu w zapleczu: `$required = ['first_name', ...]`. */
function kolumnyWymaganeZaplecza(): string[] {
  const zrodlo = readFileSync(join(process.cwd(), "..", "backend/app/Services/H03/ApplicationCsvImporter.php"), "utf-8");
  const dopasowanie = zrodlo.match(/\$required\s*=\s*\[([^\]]*)\]/);
  if (dopasowanie === null) throw new Error("Brak listy wymaganych kolumn w ApplicationCsvImporter.");
  return [...dopasowanie[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } });
});

describe("Import zgłoszeń z pliku — nazwy kolumn jak w zapleczu", () => {
  it("kontrola próby: zaplecze wymaga dokładnie trzech kolumn, w tej kolejności", () => {
    expect(kolumnyWymaganeZaplecza()).toEqual(["first_name", "last_name", "email"]);
  });

  it("stała ekranu z wymaganymi kolumnami jest równa liście z kodu zaplecza", () => {
    expect([...dane.KOLUMNY_IMPORTU_WYMAGANE]).toEqual(kolumnyWymaganeZaplecza());
  });

  it("panel importu wymienia każdą wymaganą kolumnę pod nazwą, którą czyta zaplecze", async () => {
    const uzytkownik = userEvent.setup();
    render(<ZgloszeniaLista />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Importuj z pliku CSV" }));

    const panel = screen.getByRole("region", { name: "Import zgłoszeń z pliku" });
    for (const kolumna of kolumnyWymaganeZaplecza()) {
      expect(panel.textContent ?? "", `kolumna ${kolumna}`).toContain(kolumna);
    }
    expect(panel.textContent ?? "").toContain("Wymagane kolumny: first_name (imię), last_name (nazwisko) i email (adres e-mail).");
  });

  it("raport brakujących kolumn wymienia te same nazwy, które czyta zaplecze", () => {
    expect(dane.powodPominiecia("missing_headers:first_name,email")).toBe(
      "W pierwszym wierszu pliku brakuje wymaganych kolumn: first_name, email.",
    );
  });
});
