import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Dawny adres osobnego ekranu przedłużenia dostępu
 * `/admin/uczestniczki/[id]/przedluzenie`: ekranu już nie ma (datę zmienia okno
 * „Zmień datę” na karcie osoby), a adres nigdy nie kończy się stroną „nie
 * znaleziono” — przekierowuje na kartę osoby albo, przy segmencie innym niż
 * liczba, na listę osób. Strona nie woła API.
 */

const api = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((adres: string) => {
  throw new Error(`NEXT_REDIRECT ${adres}`);
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (adres: string) => redirect(adres),
}));

afterEach(() => {
  api.mockReset();
  notFound.mockClear();
  redirect.mockClear();
});

const PLIK = path.join(process.cwd(), "app", "(przelaczenie)", "admin/uczestniczki/[id]/przedluzenie/page.tsx");

describe("dawny adres /admin/uczestniczki/[id]/przedluzenie", () => {
  it("numer osoby: przekierowanie na kartę tej osoby, bez 404 i bez żądań", async () => {
    const { default: Strona } = await import("../page");
    await expect(Strona({ params: Promise.resolve({ id: "17" }) })).rejects.toThrow("NEXT_REDIRECT /admin/uczestniczki/17");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(notFound).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it.each(["abc", "17a", "-1", "1.5"])("segment „%s” (nie liczba): przekierowanie na listę osób, bez 404", async (id) => {
    const { default: Strona } = await import("../page");
    await expect(Strona({ params: Promise.resolve({ id }) })).rejects.toThrow("NEXT_REDIRECT /admin/uczestniczki");
    expect(redirect).toHaveBeenCalledWith("/admin/uczestniczki");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("strona nie zna już ekranu przedłużenia ani rejestru przełączenia i nie importuje niczego z warstwy components/", () => {
    const zrodlo = readFileSync(PLIK, "utf-8");
    expect(zrodlo).not.toMatch(/przedluzenie-dostepu|PrzedluzenieDostepu|przedluzenieDostepu/);
    expect(zrodlo).not.toMatch(/notFound/);
    expect(zrodlo).not.toMatch(/from "@\/components\//);
    expect(zrodlo).toMatch(/redirect\(/);
  });
});
