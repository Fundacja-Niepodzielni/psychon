import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TwoColumnDetail from "@/components/templates/TwoColumnDetail";

describe("TwoColumnDetail", () => {
  it("pozytyw: renderuje treść kolumny głównej i bocznej", () => {
    render(
      <TwoColumnDetail
        main={<div>Treść główna</div>}
        sidebar={<div>Panel boczny</div>}
      />,
    );

    expect(screen.getByText("Treść główna")).toBeInTheDocument();
    expect(screen.getByText("Panel boczny")).toBeInTheDocument();
  });

  it("pozytyw (U-1): domyślna szerokość kolumny bocznej to 260px (--psy-sidebar-width)", () => {
    render(
      <TwoColumnDetail
        main={<div>Treść główna</div>}
        sidebar={<div>Panel boczny</div>}
      />,
    );

    const siatka = screen.getByText("Treść główna").closest(
      "div[style]",
    ) as HTMLElement;

    expect(siatka.style.gridTemplateColumns).toBe("minmax(0, 1fr) 260px");
  });

  it("pozytyw: przyjmuje niestandardową szerokość kolumny bocznej", () => {
    render(
      <TwoColumnDetail
        main={<div>Treść główna</div>}
        sidebar={<div>Panel boczny</div>}
        sidebarWidth={320}
      />,
    );

    const siatka = screen.getByText("Treść główna").closest(
      "div[style]",
    ) as HTMLElement;

    expect(siatka.style.gridTemplateColumns).toBe("minmax(0, 1fr) 320px");
  });
});
