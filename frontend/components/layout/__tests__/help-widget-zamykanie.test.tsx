import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zamykanie okna pomocy przez `useCloseOnOutsideOrEscape`
 * (`lib/hooks/useCloseOnOutsideOrEscape.ts`) — klik poza panelem i Escape
 * zamykaja okno, klik wewnatrz panelu NIE zamyka go.
 *
 * Kontrola negatywna: podmiana ciala hooka na sam `return;` w jego
 * `useEffect` gasi ponizsze testy na czerwono — bez tej podmiany przeszlyby
 * nawet na pustym haku, bo okno startuje zamkniete i test klikajacy "poza"
 * nie mialby czego mierzyc.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/start",
}));

const HelpWidget = (await import("@/components/layout/HelpWidget")).default;

describe("HelpWidget — zamykanie", () => {
  it("klik poza panelem zamyka okno pomocy", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <HelpWidget />
        <button type="button">poza panelem</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Pomoc" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "poza panelem" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("klawisz Escape zamyka okno pomocy", async () => {
    const user = userEvent.setup();
    render(<HelpWidget />);

    await user.click(screen.getByRole("button", { name: "Pomoc" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("klik wewnatrz panelu NIE zamyka okna pomocy", async () => {
    const user = userEvent.setup();
    render(<HelpWidget />);

    await user.click(screen.getByRole("button", { name: "Pomoc" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText("Opisz, w czym możemy pomóc"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("odmontowanie okna pomocy zdejmuje nasluch dokumentu — brak wycieku", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HelpWidget />);

    await user.click(screen.getByRole("button", { name: "Pomoc" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const removeSpy = vi.spyOn(document, "removeEventListener");
    unmount();

    const zdjeteTypy = removeSpy.mock.calls.map(([typ]) => typ);
    expect(zdjeteTypy).toContain("mousedown");
    expect(zdjeteTypy).toContain("keydown");

    removeSpy.mockRestore();
  });
});
