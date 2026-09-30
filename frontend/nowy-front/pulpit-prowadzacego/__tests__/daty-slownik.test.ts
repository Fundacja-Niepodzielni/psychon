import { describe, expect, it } from "vitest";
import { formatujTermin } from "../dane";

describe("pulpit prowadzącego — data terminu wg słownika", () => {
  it("data z godziną: dzień bez zera, miesiąc słownie, rok, godzina 24 h, strefa Europe/Warsaw", () => {
    expect(formatujTermin("2026-09-25T15:05:00Z")).toBe("25 września 2026, 17:05");
    expect(formatujTermin("2026-12-05T08:12:00Z")).toBe("5 grudnia 2026, 09:12");
  });
});
