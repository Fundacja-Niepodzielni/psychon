import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Trasa `/admin/uczestniczki/nowa` a rejestr przełączenia (grupa `noweKonto`):
 * wyłączona → to samo co do tej pory pod tym adresem (karta osoby z segmentem
 * `nowa` w miejscu identyfikatora), włączona → ekran „Nowa osoba”.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const ZAWIESZONE = new Promise(() => {});

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  api.mockReset();
  apiPaged.mockReset();
  przywrocRejestr();
});

describe("trasa /admin/uczestniczki/nowa", () => {
  it("grupa wyłączona: ten sam kod HTML co dotychczasowa karta z segmentem „nowa”, bez ekranu nowej osoby", async () => {
    podmienRejestr({});
    api.mockImplementation(() => ZAWIESZONE);
    apiPaged.mockImplementation(() => ZAWIESZONE);
    const { default: Strona, metadata } = await import("../page");
    const { default: Karta } = await import("@/components/h18/AdminUserCard");

    const zeStrony = render(<>{Strona()}</>).container.innerHTML;
    cleanup();
    const zKarty = render(<Karta id={Number("nowa")} />).container.innerHTML;

    expect(zeStrony).toBe(zKarty);
    expect(zeStrony.length).toBeGreaterThan(20);
    expect(zeStrony).not.toContain('data-theme="light"');
    expect(metadata).toEqual({});
  });

  it("grupa włączona: ekran „Nowa osoba” w jasnym motywie, z własnym tytułem karty", async () => {
    podmienRejestr({ noweKonto: true });
    api.mockImplementation(() => ZAWIESZONE);
    apiPaged.mockImplementation(() => ZAWIESZONE);
    const { default: Strona, metadata } = await import("../page");

    const { container } = render(<>{Strona()}</>);

    expect(container.querySelector('[data-theme="light"]')).not.toBeNull();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Nowa osoba/);
    expect(metadata).toEqual({ title: "Nowa osoba — Niepodzielni" });
  });
});
