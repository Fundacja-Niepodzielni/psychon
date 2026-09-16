import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "@/components/molecules/Pagination";
import { axeViolations } from "./axe-helper";

describe("Pagination", () => {
  it("pierwsza strona: „Poprzednia” wyłączona, „Następna” aktywna", () => {
    render(<Pagination strona={1} ostatniaStrona={5} onZmien={() => {}} />);

    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Następna" })).toBeEnabled();
  });

  it("ostatnia strona: „Następna” wyłączona, „Poprzednia” aktywna", () => {
    render(<Pagination strona={5} ostatniaStrona={5} onZmien={() => {}} />);

    expect(screen.getByRole("button", { name: "Następna" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeEnabled();
  });

  it('pokazuje „Strona X z Y” słowem', () => {
    render(<Pagination strona={3} ostatniaStrona={7} onZmien={() => {}} />);

    expect(screen.getByText("Strona 3 z 7")).toBeInTheDocument();
  });

  it("kliknięcie „Następna” na stronie środkowej wywołuje onZmien z kolejną stroną", async () => {
    const onZmien = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<Pagination strona={3} ostatniaStrona={7} onZmien={onZmien} />);

    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));

    expect(onZmien).toHaveBeenCalledWith(4);
  });

  it("axe: 0 naruszeń", async () => {
    const { container } = render(<Pagination strona={3} ostatniaStrona={7} onZmien={() => {}} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
