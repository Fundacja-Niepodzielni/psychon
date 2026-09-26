import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Probe for row 7.4.1 (b) of `docs/bezpieczenstwo/przeglad-asvs-dostep.md`:
 * when the account-system logout address cannot be read, `PanelShell` ends
 * only the local session and returns to `/logowanie`; the single sign-on
 * session is never ended. The probe asserts that behaviour, so it turns red
 * once the fallback also ends the account-system session — then invert it
 * and update the table row.
 */

const push = vi.fn();
const endSession = vi.fn();
const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/start",
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    endSession: (...args: unknown[]) => endSession(...args),
    apiPaged: (...args: unknown[]) => apiPaged(...args),
  };
});

const PanelShell = (await import("@/components/layout/PanelShell")).default;

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  push.mockReset();
  endSession.mockReset().mockResolvedValue(undefined);
  apiPaged.mockReset().mockResolvedValue({ data: [], meta: undefined });
  assign = vi.fn();
  prawdziwaLokalizacja = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, origin: "https://platforma.example.org" },
  });
});

afterEach(() => {
  if (prawdziwaLokalizacja) Object.defineProperty(window, "location", prawdziwaLokalizacja);
  vi.unstubAllGlobals();
});

describe("ASVS 7.4.1 (b) — wylogowanie bez adresu systemu kont", () => {
  it("luka 7.4.1 b (przeglad-asvs-dostep.md, wiersz 7.4.1): kończy tylko sesję lokalną, sesja SSO trwa", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PanelShell panelName="Panel testowy" menu={[]}>
        <p>treść</p>
      </PanelShell>,
    );
    await userEvent.click(screen.getByRole("button", { name: /wyloguj się/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/logowanie"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/end-session-url");
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });
});
