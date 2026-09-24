import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FilterBar from "@/components/molecules/FilterBar";
import { axeViolations } from "../../__tests__/axe-helper";

describe("FilterBar", () => {
  it("grupuje kontrolki filtrów jako role=group z etykietą domyślną", () => {
    render(
      <FilterBar>
        <label htmlFor="status">Status</label>
        <select id="status">
          <option>Wszystkie</option>
        </select>
      </FilterBar>,
    );

    expect(screen.getByRole("group", { name: "Filtry" })).toBeInTheDocument();
  });

  it("przyjmuje własną etykietę zamiast domyślnej", () => {
    render(
      <FilterBar label="Filtry kursu">
        <span>kontrolka</span>
      </FilterBar>,
    );

    expect(screen.getByRole("group", { name: "Filtry kursu" })).toBeInTheDocument();
  });

  it("renderuje wszystkie przekazane kontrolki", () => {
    render(
      <FilterBar>
        <span>Pierwszy filtr</span>
        <span>Drugi filtr</span>
      </FilterBar>,
    );

    expect(screen.getByText("Pierwszy filtr")).toBeInTheDocument();
    expect(screen.getByText("Drugi filtr")).toBeInTheDocument();
  });

  it("axe: 0 naruszeń", async () => {
    const { container } = render(
      <FilterBar label="Filtry kursu">
        <label htmlFor="status2">Status</label>
        <select id="status2">
          <option>Wszystkie</option>
        </select>
      </FilterBar>,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
