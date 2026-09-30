import { describe, expect, it } from "vitest";
import { rokProgramuZEdycji } from "../admin/PowlokaAdministracji";

/** Rok programu w górnym pasku nowej ramki administracji, z dat `GET /admin/edition`. */
describe("rokProgramuZEdycji", () => {
  it("program przez przełom roku: „2026/27”", () => {
    expect(rokProgramuZEdycji({ starts_at: "2026-09-01", ends_at: "2027-06-30" })).toBe("2026/27");
  });

  it("program w jednym roku albo bez końca: sam rok początku", () => {
    expect(rokProgramuZEdycji({ starts_at: "2026-01-10", ends_at: "2026-12-20" })).toBe("2026");
    expect(rokProgramuZEdycji({ starts_at: "2026-01-10", ends_at: null })).toBe("2026");
  });

  it("brak danych albo błędne daty: null (pasek bez roku)", () => {
    expect(rokProgramuZEdycji(null)).toBeNull();
    expect(rokProgramuZEdycji(undefined)).toBeNull();
    expect(rokProgramuZEdycji({})).toBeNull();
    expect(rokProgramuZEdycji({ starts_at: "nieznana" })).toBeNull();
  });
});
