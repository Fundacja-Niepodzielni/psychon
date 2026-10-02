import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/uczestniczki/[id]/przedluzenie` a rejestr przełączenia (grupa
 * `przedluzenieDostepu`): wyłączona → adres nie istnieje, jak do tej pory
 * (`notFound`), włączona → ekran przedłużenia dostępu dla osoby z adresu.
 * Ramkę nowego frontu daje układ grupy tras `(przelaczenie)`, nie strona.
 */

const api = vi.fn();
const ZAWIESZONE = new Promise(() => {});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  api.mockReset();
  notFound.mockClear();
  przywrocRejestr();
});

describe("trasa /admin/uczestniczki/[id]/przedluzenie", () => {
  it("grupa wyłączona: adres nie istnieje i żadne żądanie nie wychodzi", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");

    await expect(Strona({ params: Promise.resolve({ id: "17" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
  });

  it("grupa włączona: ekran przedłużenia czyta osobę z adresu, z własnym tytułem karty", async () => {
    podmienRejestr({ przedluzenieDostepu: true });
    api.mockImplementation(() => ZAWIESZONE);
    const { default: Strona, metadata } = await import("../page");

    render(await Strona({ params: Promise.resolve({ id: "17" }) }));

    expect(notFound).not.toHaveBeenCalled();
    expect(api.mock.calls.some(([sciezka]) => String(sciezka).includes("/admin/users/17"))).toBe(true);
    expect(metadata).toEqual({ title: "Przedłużenie dostępu — Niepodzielni" });
  });

  it("plik strony leży w grupie tras z ramką nowego frontu i nie importuje niczego z warstwy components/", () => {
    const zrodlo = readFileSync(
      path.join(process.cwd(), "app", "(przelaczenie)", "admin/uczestniczki/[id]/przedluzenie/page.tsx"),
      "utf-8",
    );
    expect(zrodlo).not.toMatch(/from "@\/components\//);
    expect(zrodlo).toMatch(/czyNowaTrasaDostepna\(GRUPY\.przedluzenieDostepu\)/);
  });
});
