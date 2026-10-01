import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WNIOSEK } from "./atrapy";

/**
 * Decyzja o wniosku: trzeci przycisk „Wróć do listy” (słownik §4) prowadzi do listy profili
 * (`/admin/profile`, ten sam adres co pierwszy okruszek), obok „Zatwierdź” i „Poproś o poprawkę”.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});
vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { ProfilDecyzja } = await import("../ProfilDecyzja");

beforeEach(() => {
  push.mockReset();
  api.mockReset().mockResolvedValue(WNIOSEK);
});

describe("Wniosek o profil — „Wróć do listy”", () => {
  it("jest trzecim przyciskiem decyzji i prowadzi do /admin/profile", async () => {
    const uzytkownik = userEvent.setup();
    render(<ProfilDecyzja id="12" />);
    await screen.findByRole("heading", { level: 1, name: /^Wniosek o profil: / });

    const przyciski = ["Zatwierdź", "Poproś o poprawkę", "Wróć do listy"].map((nazwa) =>
      screen.getByRole("button", { name: nazwa }),
    );
    expect(przyciski[2].closest("div")).toBe(przyciski[0].closest("div"));

    await uzytkownik.click(przyciski[2]);
    expect(push).toHaveBeenCalledWith("/admin/profile");
    expect(api).toHaveBeenCalledTimes(1);
  });
});
