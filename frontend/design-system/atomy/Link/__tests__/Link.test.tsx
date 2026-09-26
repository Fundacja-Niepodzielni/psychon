import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Link } from "../Link";

describe("Link", () => {
  it("renderuje się jako <a>, nie <button>", () => {
    render(<Link href="/lekcja">Do lekcji</Link>);
    const el = screen.getByRole("link", { name: "Do lekcji" });
    expect(el.tagName).toBe("A");
  });

  it("nigdy nie ma klasy przycisku ani tła", () => {
    render(<Link href="/lekcja">Do lekcji</Link>);
    const el = screen.getByRole("link");
    expect(el.className).not.toMatch(/przycisk/i);
  });

  it("wariant okruszek ma inne wcięcie pola klikalnego niż treść", () => {
    const { container: tresc } = render(<Link href="#">A</Link>);
    const { container: okruszek } = render(
      <Link href="#" wariant="okruszek">
        A
      </Link>,
    );
    expect(tresc.querySelector("a")?.className).not.toBe(
      okruszek.querySelector("a")?.className,
    );
  });
});
