import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordList from "@/components/organisms/RecordList";
import { axeViolations } from "../../molecules/__tests__/axe-helper";

interface Wiersz {
  id: number;
  imie: string;
}

const wiersze: Wiersz[] = [
  { id: 1, imie: "Anna" },
  { id: 2, imie: "Bartek" },
];

describe("RecordList", () => {
  it("renderuje listę kart z danymi", () => {
    render(
      <RecordList rows={wiersze} rowKey={(r) => r.id} renderItem={(r) => <span>{r.imie}</span>} />,
    );

    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Bartek")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("stan pusty renderuje komunikat zamiast listy", () => {
    render(
      <RecordList rows={[]} rowKey={(r: Wiersz) => r.id} renderItem={(r: Wiersz) => r.imie} emptyMessage="Brak wpisów" />,
    );

    expect(screen.getByText("Brak wpisów")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("stan pusty renderuje akcję, gdy wywołujący ją poda (Z-6)", () => {
    render(
      <RecordList
        rows={[]}
        rowKey={(r: Wiersz) => r.id}
        renderItem={(r: Wiersz) => r.imie}
        emptyMessage="Brak wpisów"
        emptyAction={<button type="button">Dodaj pierwszy wpis</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Dodaj pierwszy wpis" })).toBeInTheDocument();
  });

  it("renderuje najwyżej jedną akcję na kartę, gdy podana", async () => {
    const onAction = vi.fn();
    const uzytkownik = userEvent.setup();
    render(
      <RecordList
        rows={wiersze}
        rowKey={(r) => r.id}
        renderItem={(r) => <span>{r.imie}</span>}
        renderAction={(r) => (
          <button type="button" onClick={() => onAction(r.id)}>
            Otwórz
          </button>
        )}
      />,
    );

    const akcje = screen.getAllByRole("button", { name: "Otwórz" });
    expect(akcje).toHaveLength(2);
    await uzytkownik.click(akcje[0]);
    expect(onAction).toHaveBeenCalledWith(1);
  });

  it("axe: 0 naruszeń", async () => {
    const { container } = render(
      <RecordList rows={wiersze} rowKey={(r) => r.id} renderItem={(r) => <span>{r.imie}</span>} />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });

  it("axe: 0 naruszeń w stanie pustym", async () => {
    const { container } = render(
      <RecordList rows={[]} rowKey={(r: Wiersz) => r.id} renderItem={(r: Wiersz) => r.imie} />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
