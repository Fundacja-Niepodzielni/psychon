import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/uczestniczki/[id]/przedluzenie` a rejestr przełączenia (grupa
 * `przedluzenieDostepu`): wyłączona → adres nie istnieje, jak do tej pory
 * (`notFound`), włączona → ekran przedłużenia dostępu dla osoby z adresu.
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
    const { default: Strona, metadata } = await import("../page");

    await expect(Strona({ params: Promise.resolve({ id: "17" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
    expect(metadata).toEqual({});
  });

  it("grupa włączona: ekran przedłużenia czyta osobę z adresu, w jasnym motywie, z własnym tytułem karty", async () => {
    podmienRejestr({ przedluzenieDostepu: true });
    api.mockImplementation(() => ZAWIESZONE);
    const { default: Strona, metadata } = await import("../page");

    const { container } = render(await Strona({ params: Promise.resolve({ id: "17" }) }));

    expect(notFound).not.toHaveBeenCalled();
    expect(container.querySelector('[data-theme="light"]')).not.toBeNull();
    expect(api.mock.calls.some(([sciezka]) => String(sciezka).includes("/admin/users/17"))).toBe(true);
    expect(metadata).toEqual({ title: "Przedłużenie dostępu — Niepodzielni" });
  });
});
