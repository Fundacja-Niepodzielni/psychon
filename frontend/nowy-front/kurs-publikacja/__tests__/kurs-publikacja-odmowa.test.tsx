import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KursPublikacja } from "../KursPublikacja";

/**
 * Odmowa z powodu roli na ekranie publikacji kursu: wspólny wzór odmowy
 * z rolą docelową, jeden przycisk wyjścia i brak przycisku „Opublikuj kurs”.
 */

const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a) };
});

beforeEach(() => {
  back.mockReset();
  api.mockReset().mockRejectedValue(new Error("bez konta w próbie"));
});

describe("KursPublikacja — odmowa z powodu roli", () => {
  it("brak-uprawnien: wspólny wzór odmowy z rolą docelową, wyjście, bez przycisku publikacji", async () => {
    const uzytkownik = userEvent.setup();
    render(<KursPublikacja idKursu="4" wynik={{ status: "brak-uprawnien" }} />);

    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText(/Ten ekran jest dla prowadzących\./)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
    expect(api.mock.calls.filter(([sciezka]) => sciezka !== "/me")).toHaveLength(0);

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("kontrola dodatnia: stan blad nie pokazuje odmowy", () => {
    render(<KursPublikacja idKursu="4" wynik={{ status: "blad" }} />);

    expect(screen.queryByRole("heading", { name: "Nie masz dostępu do tego ekranu" })).toBeNull();
    expect(screen.queryByText(/Ten ekran jest dla prowadzących\./)).toBeNull();
  });
});
