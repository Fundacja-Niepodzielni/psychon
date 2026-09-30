import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Szósty stan ekranu A-12: ładowanie TRASY (`app/nowy-front/kurs/[id]/loading.tsx`)
 * — pierwsze, co osoba widzi, zanim serwerowy `pobierzDaneKursu` odpowie.
 * Ten sam szablon co ekran po wczytaniu: jeden `main` z `id="tresc"` (cel
 * linku skoku z układu), znacznik szablonu w DOM, szkielet w obszarze treści.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const { default: LadowanieKursu } = await import("@/app/nowy-front/kurs/[id]/loading");

describe("A-12 — ładowanie trasy w szablonie DetailTemplate", () => {
  it("jeden main z id=tresc, znacznik szablonu i szkielet w obszarze treści", () => {
    const { container } = render(<LadowanieKursu />);

    expect(() => jedenMain(container)).not.toThrow();
    const main = container.querySelector("main")!;
    expect(main.getAttribute("data-style-id")).toBe("szablon-szczegol");
    expect(container.querySelector("#tresc")).toBe(main);

    const glowna = container.querySelector<HTMLElement>("[data-obszar='glowna']")!;
    const szkielet = container.querySelector<HTMLElement>("[aria-busy='true']")!;
    expect(szkielet).toBeTruthy();
    expect(glowna.contains(szkielet)).toBe(true);
  });
});
