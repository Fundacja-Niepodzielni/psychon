import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PageHeader from "@/components/molecules/PageHeader";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import { axeViolations } from "./axe-helper";

describe("PageHeader ze slotem okruszków (partia P3a)", () => {
  it("renderuje okruszki nad h1, gdy podane w slocie breadcrumbs", () => {
    render(
      <PageHeader
        title="Wprowadzenie do PsychON"
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Panel", href: "/panel" }, { label: "Wprowadzenie do PsychON" }]}
          />
        }
      />,
    );

    expect(screen.getByRole("navigation", { name: "Okruszki nawigacji" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Wprowadzenie do PsychON" }),
    ).toBeInTheDocument();
  });

  it("bez slotu breadcrumbs nie renderuje nav (zgodność wsteczna, K2)", () => {
    render(<PageHeader title="Kursy" />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("axe: 0 naruszeń z okruszkami", async () => {
    const { container } = render(
      <PageHeader
        title="Wprowadzenie do PsychON"
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Panel", href: "/panel" }, { label: "Wprowadzenie do PsychON" }]}
          />
        }
      />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
