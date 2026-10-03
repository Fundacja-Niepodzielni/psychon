import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

const replace = vi.fn();
let zapytanie = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(zapytanie),
}));

const { PrzekierowanieKont } = await import("../PrzekierowanieKont");
let straznik: ReturnType<typeof straznikHostow>;

beforeEach(() => {
  replace.mockReset();
  zapytanie = "";
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("stary adres /logowanie/konta", () => {
  it("bez ?error=: przekierowuje na samo /logowanie; jeden h1", async () => {
    let kontener: HTMLElement | undefined;
    await act(async () => {
      kontener = render(<PrzekierowanieKont />).container;
    });
    expect(replace).toHaveBeenCalledWith("/logowanie");
    expect(kontener!.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Przekierowuję…" })).toBeTruthy();
  });

  it("z ?error=: zachowuje go w przekierowaniu", async () => {
    zapytanie = "error=OAuthCallbackError";
    await act(async () => {
      render(<PrzekierowanieKont />);
    });
    expect(replace).toHaveBeenCalledWith("/logowanie?error=OAuthCallbackError");
  });
});
