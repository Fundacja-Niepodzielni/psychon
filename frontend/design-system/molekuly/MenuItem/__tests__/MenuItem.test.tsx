import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MenuItem } from "../MenuItem";
import { MenuGroup } from "../MenuGroup";

describe("MenuItem — bieżąca pozycja", () => {
  it("bez oznaczenia: bez aria-current", () => {
    render(<MenuItem ikona="inbox" etykieta="Sprawy" href="/admin/sprawy" />);
    expect(screen.getByRole("link", { name: "Sprawy" }).hasAttribute("aria-current")).toBe(false);
  });

  it("bieżąca strona (true): aria-current=\"page\"", () => {
    render(<MenuItem ikona="inbox" etykieta="Sprawy" href="/admin/sprawy" biezaca />);
    expect(screen.getByRole("link", { name: "Sprawy" }).getAttribute("aria-current")).toBe("page");
  });

  it("rodzic bieżącej podstrony („sekcja”): aria-current=\"true\", nie \"page\", z tym samym wyróżnieniem co strona bieżąca", () => {
    const { container } = render(
      <>
        <MenuItem ikona="inbox" etykieta="Sprawy" href="/admin/sprawy" biezaca="sekcja" />
        <MenuItem ikona="home" etykieta="Pulpit" href="/admin" biezaca />
      </>,
    );
    const sekcja = screen.getByRole("link", { name: "Sprawy" });
    const strona = screen.getByRole("link", { name: "Pulpit" });
    expect(sekcja.getAttribute("aria-current")).toBe("true");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(sekcja.className).toBe(strona.className);
  });

  it("w grupie: stan „sekcja” przechodzi do pozycji", () => {
    render(
      <MenuGroup
        naglowek="Codziennie"
        pozycje={[
          { ikona: "inbox", etykieta: "Sprawy", href: "/admin/sprawy", biezaca: "sekcja" },
          { ikona: "users", etykieta: "Uczestnicy", href: "/admin/uczestniczki", biezaca: false },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Sprawy" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Uczestnicy" }).hasAttribute("aria-current")).toBe(false);
  });
});
