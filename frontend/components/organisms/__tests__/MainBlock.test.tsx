import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axeViolations } from "../../__tests__/axe-helper";
import MainBlock from "@/components/organisms/MainBlock";

describe("MainBlock", () => {
  it("render w spoczynku: nagłówek i opis", () => {
    render(<MainBlock title="Twój najbliższy krok" description="Dokończ zgłoszenie." />);

    expect(screen.getByRole("heading", { name: "Twój najbliższy krok" })).toBeInTheDocument();
    expect(screen.getByText("Dokończ zgłoszenie.")).toBeInTheDocument();
  });

  it("bez akcji: nie renderuje żadnego przycisku", () => {
    render(<MainBlock title="Twój najbliższy krok" />);

    // MainBlock renderuje przycisk akcji tylko, gdy props action jest
    // podane — render() wyżej bez action kończy się synchronicznie bez tego
    // węzła.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("dokładnie jedna akcja główna, gdy podana (Z-13)", () => {
    render(
      <MainBlock
        title="Twój najbliższy krok"
        action={<button type="button">Dokończ zgłoszenie</button>}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Dokończ zgłoszenie" })).toBeInTheDocument();
  });

  it("nie renderuje drugiej akcji głównej, nawet jako odnośnik stylizowany na przycisk (Z-13)", () => {
    const { container } = render(
      <MainBlock
        title="Twój najbliższy krok"
        action={<button type="button">Dokończ zgłoszenie</button>}
      />,
    );

    const akcje = container.querySelectorAll("button, a[href]");
    expect(akcje).toHaveLength(1);
  });

  it("axe: 0 naruszeń na wyrenderowanym bloku", async () => {
    const { container } = render(
      <MainBlock
        title="Twój najbliższy krok"
        description="Dokończ zgłoszenie."
        action={<button type="button">Dokończ zgłoszenie</button>}
      />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
