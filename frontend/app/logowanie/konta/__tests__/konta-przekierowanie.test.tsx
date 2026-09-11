import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * `/logowanie/konta` było drugimi drzwiami logowania (konto Niepodzielni,
 * obok hasła lokalnego). PsychON jest teraz wyłącznie SSO — ta trasa zostaje
 * tylko jako przekierowanie dla starych linków, z zachowaniem `?error=`.
 */

const replace = vi.fn();
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace, refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));

const AccountSystemLoginRedirect = (await import("@/app/logowanie/konta/page")).default;

beforeEach(() => {
  replace.mockReset();
  query = "";
});

describe("/logowanie/konta — przekierowanie na /logowanie", () => {
  it("bez ?error=: przekierowuje na samo /logowanie", async () => {
    render(<AccountSystemLoginRedirect />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/logowanie"));
  });

  it("z ?error=: zachowuje go w przekierowaniu", async () => {
    query = "error=OAuthCallbackError";
    render(<AccountSystemLoginRedirect />);
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/logowanie?error=OAuthCallbackError"),
    );
  });

  it("nie ma już linku logowania hasłem", () => {
    render(<AccountSystemLoginRedirect />);
    expect(screen.queryByText(/hasłem/i)).not.toBeInTheDocument();
  });
});
