import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Przycisk główny „Dodaj osobę” listy osób: stoi w stałym miejscu przycisku
 * głównego nagłówka, prowadzi pod adres ekranu zakładania konta podany przez
 * stronę i nie pojawia się, gdy strona adresu nie podała albo rola nie ma
 * dostępu do listy.
 */

const apiPaged = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, apiPaged: (...args: unknown[]) => apiPaged(...args) };
});

vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { ApiError } = await import("@/lib/api/klient");
const { OsobyLista } = await import("../OsobyLista");

const ADRES = "/nowy-front/admin/osoby/nowa";

const ODPOWIEDZ = {
  data: [
    {
      id: 1,
      first_name: "Marta",
      last_name: "Demo",
      email: "marta@demo.pl",
      role: "volunteer",
      status: "active",
      product_group: "psychon",
      access_expires_at: "2027-02-01T00:00:00Z",
      created_at: "2026-09-01T10:00:00Z",
    },
  ],
  meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
};

beforeEach(() => {
  apiPaged.mockReset();
  push.mockReset();
});

describe("OsobyLista — przycisk główny „Dodaj osobę”", () => {
  it("stoi w miejscu przycisku głównego nagłówka, jest przyciskiem głównym i prowadzi na ekran zakładania konta", async () => {
    apiPaged.mockResolvedValue(ODPOWIEDZ);
    render(<OsobyLista adresNowejOsoby={ADRES} />);

    await screen.findByText("Marta Demo");
    const miejsce = screen.getByTestId("pageheader-przycisk-glowny");
    const przycisk = within(miejsce).getByRole("button", { name: "Dodaj osobę" });
    expect(przycisk.className).toMatch(/primary/);

    await userEvent.click(przycisk);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(ADRES);
  });

  it("bez adresu ekranu zakładania konta lista nie pokazuje przycisku", async () => {
    apiPaged.mockResolvedValue(ODPOWIEDZ);
    render(<OsobyLista />);

    await screen.findByText("Marta Demo");
    expect(screen.queryByRole("button", { name: "Dodaj osobę" })).not.toBeInTheDocument();
  });

  it("przy odmowie roli przycisku nie ma", async () => {
    apiPaged.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak dostępu." }));
    render(<OsobyLista adresNowejOsoby={ADRES} />);

    await screen.findByRole("button", { name: "Wróć" });
    expect(screen.queryByRole("button", { name: "Dodaj osobę" })).not.toBeInTheDocument();
  });
});
