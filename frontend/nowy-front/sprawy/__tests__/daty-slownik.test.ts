import { describe, expect, it } from "vitest";
import { mapujZgloszenie } from "../dane";

describe("sprawy — data oczekiwania wg słownika", () => {
  it("dzień bez zera, miesiąc słownie, rok; brak daty to „—”", () => {
    const osoba = { id: 44, first_name: "Marta", last_name: "Demo" };
    expect(mapujZgloszenie({ ...osoba, created_at: "2026-09-05T10:00:00Z" }).podpowiedz).toBe("Czeka od 5 września 2026");
    expect(mapujZgloszenie({ ...osoba, created_at: "2026-09-30T22:30:00Z" }).podpowiedz).toBe(
      "Czeka od 1 października 2026",
    );
    expect(mapujZgloszenie({ ...osoba, created_at: null }).podpowiedz).toBe("Czeka od —");
  });
});
