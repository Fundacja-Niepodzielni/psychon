import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Zapis karty osoby (`PATCH /admin/users/{id}`): żądanie nie niesie
 * `product_group` — zapis danych osoby nie zmienia jej grupy produktowej
 * (przechwycone żądanie, nie atrapa funkcji zapisu).
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { formularzZProfilu, zapiszKarteOsoby } = await import("../dane");

beforeEach(() => {
  api.mockReset().mockResolvedValue({});
});

describe("zapiszKarteOsoby — grupa produktowa", () => {
  it("osoba z grupą „obie”: ciało PATCH nie ma klucza product_group, reszta pól bez zmian", async () => {
    const formularz = formularzZProfilu({
      id: 17,
      first_name: "Marta",
      last_name: "Demo",
      email: "marta@demo.pl",
      role: "volunteer",
      phone: "+48 600 100 200",
      pesel: null,
      address: { street: "Polna 1", city: "Warszawa", zip: "00-001" },
      access_expires_at: null,
      program_completed_at: null,
      product_group: "both",
    });
    await zapiszKarteOsoby(17, formularz);

    expect(api).toHaveBeenCalledTimes(1);
    const [adres, opcje] = api.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(adres).toBe("/admin/users/17");
    expect(opcje.method).toBe("PATCH");
    expect(Object.keys(opcje.body).sort()).toEqual(["address", "email", "first_name", "last_name", "pesel", "phone"]);
  });
});
