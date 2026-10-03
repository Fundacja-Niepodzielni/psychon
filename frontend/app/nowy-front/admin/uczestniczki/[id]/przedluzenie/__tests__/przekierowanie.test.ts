import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Dawny adres osobnego ekranu przedłużenia dostępu pod segmentem nowego frontu
 * (`/nowy-front/admin/uczestniczki/[id]/przedluzenie`) przekierowuje na kartę
 * osoby pod tym samym segmentem, a przy segmencie innym niż liczba — na listę
 * osób. Nigdy 404.
 */

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((adres: string) => {
  throw new Error(`NEXT_REDIRECT ${adres}`);
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (adres: string) => redirect(adres),
}));

afterEach(() => {
  notFound.mockClear();
  redirect.mockClear();
});

describe("dawny adres /nowy-front/admin/uczestniczki/[id]/przedluzenie", () => {
  it("numer osoby: przekierowanie na kartę osoby nowego frontu", async () => {
    const { default: Strona } = await import("../page");
    await expect(Strona({ params: Promise.resolve({ id: "17" }) })).rejects.toThrow(
      "NEXT_REDIRECT /nowy-front/admin/uczestniczki/17",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("segment inny niż liczba: przekierowanie na listę osób", async () => {
    const { default: Strona } = await import("../page");
    await expect(Strona({ params: Promise.resolve({ id: "x" }) })).rejects.toThrow("NEXT_REDIRECT /nowy-front/admin/uczestniczki");
    expect(redirect).toHaveBeenCalledWith("/nowy-front/admin/uczestniczki");
  });

  it("strona nie wstawia już ekranu przedłużenia", () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app/nowy-front/admin/uczestniczki/[id]/przedluzenie/page.tsx"), "utf-8");
    expect(zrodlo).not.toMatch(/przedluzenie-dostepu|PrzedluzenieDostepu/);
    expect(zrodlo).toMatch(/redirect\(/);
  });
});
