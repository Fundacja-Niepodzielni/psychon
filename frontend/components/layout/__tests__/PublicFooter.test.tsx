import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Stopka publiczna — odnośnik do deklaracji dostępności i, od pozycji 28
 * Załącznika 1, odnośniki do dokumentów prawnych (dziś dwa rodzaje, patrz
 * `lib/h22/legal-documents.ts`).
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const PublicFooter = (await import("@/components/layout/PublicFooter")).default;

describe("PublicFooter", () => {
  it("zawiera odnośniki do deklaracji dostępności oraz do obu dokumentów prawnych", () => {
    render(<PublicFooter />);

    expect(
      screen.getByRole("link", { name: "Deklaracja dostępności" }),
    ).toHaveAttribute("href", "/deklaracja-dostepnosci");

    expect(screen.getByRole("link", { name: "Regulamin" })).toHaveAttribute(
      "href",
      "/dokumenty-prawne/regulamin",
    );

    expect(
      screen.getByRole("link", { name: "Polityka prywatności" }),
    ).toHaveAttribute("href", "/dokumenty-prawne/polityka");
  });
});
