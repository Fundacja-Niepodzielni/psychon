import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("pokazuje inicjały z imienia i nazwiska", () => {
    render(<Avatar imie="Anna" nazwisko="Kowalska" />);
    expect(screen.getByText("AK")).toBeInTheDocument();
  });

  it("bez imienia nigdy nie renderuje pustego kółka", () => {
    render(<Avatar imie="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("samo imię bez nazwiska nadal daje jeden znak", () => {
    render(<Avatar imie="Jan" />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });
});
