import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/panel` — server component with no UI of its own: it only redirects to
 * the participant start screen. There is no heading, loading, error or API
 * state to render, so the suite pins the redirect target and that nothing
 * else is fetched on the way.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const apiMock = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { default: PanelIndexPage } = await import("@/app/(uczestnik)/panel/page");

beforeEach(() => {
  redirect.mockClear();
  apiMock.mockReset();
});

describe("PanelIndexPage", () => {
  it("redirects to /panel/start", () => {
    expect(() => PanelIndexPage()).toThrow("NEXT_REDIRECT:/panel/start");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/panel/start");
  });

  it("does not call the API before redirecting", () => {
    // PanelIndexPage() above throws synchronously (redirect() throws before
    // any return) — there is no async gap in which apiMock could still be
    // invoked later, so no await is needed here.
    expect(() => PanelIndexPage()).toThrow();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
