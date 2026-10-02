import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Probe for row 7.6.2 of `docs/bezpieczenstwo/przeglad-asvs-dostep.md`:
 * `/logowanie` without a session and without `?error=` starts single sign-on
 * by itself, before any user action. With a live SSO session that creates an
 * application session with no interaction. The probe asserts that behaviour,
 * so it turns red once sign-in waits for a click — then invert it and update
 * the table row.
 */

const getSession = vi.fn();
const signIn = vi.fn();

vi.mock("next-auth/react", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  signIn: (...args: unknown[]) => signIn(...args),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const LoginPage = (await import("@/app/logowanie/page")).default;

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  signIn.mockReset();
});

describe("ASVS 7.6.2 — utworzenie sesji bez działania użytkownika", () => {
  it("luka 7.6.2 (przeglad-asvs-dostep.md, wiersz 7.6.2): /logowanie woła signIn bez kliknięcia", async () => {
    render(<LoginPage />);

    await vi.waitFor(() => expect(signIn).toHaveBeenCalledWith("keycloak", { callbackUrl: "/logowanie" }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
