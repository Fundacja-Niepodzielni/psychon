import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "../Icon";

describe("Icon", () => {
  it("renderuje glif z aria-hidden — nigdy jedyny nośnik znaczenia", () => {
    const { container } = render(<Icon nazwa="home" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("rozmiar domyślny to 18, można ustawić 16 albo 26", () => {
    const { container: domyslny } = render(<Icon nazwa="home" />);
    const { container: maly } = render(<Icon nazwa="home" rozmiar={16} />);
    expect(domyslny.querySelector("svg")).toHaveAttribute("width", "18");
    expect(maly.querySelector("svg")).toHaveAttribute("width", "16");
  });

  it("każda z 13 nazw z mapy renderuje inny glif", () => {
    const nazwy: Array<Parameters<typeof Icon>[0]["nazwa"]> = [
      "home", "book", "clock", "users", "file", "award", "chat",
      "inbox", "chart", "cog", "help", "user", "out",
    ];
    expect(nazwy.length).toBe(13);
    const html = nazwy.map((n) => render(<Icon nazwa={n} />).container.innerHTML);
    expect(new Set(html).size).toBe(13);
  });

  it("„menu”: ścieżka z makiety, aria-hidden, rozmiar i kreska jak pozostałe glify", () => {
    const { container } = render(<Icon nazwa="menu" rozmiar={16} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "1.8");
    expect(svg?.querySelector("path")).toHaveAttribute("d", "M3 6h18M3 12h18M3 18h18");
    const inne = render(<Icon nazwa="home" rozmiar={16} />).container.innerHTML;
    expect(container.innerHTML).not.toBe(inne);
  });
});
