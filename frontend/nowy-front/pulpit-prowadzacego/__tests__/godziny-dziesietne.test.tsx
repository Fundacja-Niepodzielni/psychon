import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { grupa } from "./atrapy";
import { formatujDziesietny } from "../formatuj-dziesietny";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { SekcjaGrupy } = await import("../sekcje");

describe("pulpit prowadzącego — liczby dziesiętne z API", () => {
  it("godziny stażu osoby w grupie mają przecinek, nie kropkę (kontrola dodatnia: atrapa niesie „41.5”)", () => {
    const dane = grupa(1);
    expect(dane.members[0].progress.hours_accepted).toBe("41.5");

    render(<SekcjaGrupy sekcja={{ stan: "ok", dane }} onOdswiez={() => undefined} />);
    expect(screen.getByText(/staż: 41,5 godz\./)).toBeInTheDocument();
    expect(screen.queryByText(/41\.5/)).not.toBeInTheDocument();
  });

  it("pomocnik: przecinek według pl-PL, napis niebędący liczbą bez zmian", () => {
    expect(formatujDziesietny("41.5")).toBe("41,5");
    expect(formatujDziesietny("72")).toBe("72");
    expect(formatujDziesietny("brak")).toBe("brak");
  });
});
