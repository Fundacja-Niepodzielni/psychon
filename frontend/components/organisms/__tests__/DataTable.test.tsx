import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataTable, { type DataTableColumn } from "@/components/organisms/DataTable";
import { axeViolations } from "./axe-helper";

interface Wiersz {
  id: number;
  imie: string;
}

const kolumny: DataTableColumn<Wiersz>[] = [
  { key: "imie", header: "Imię", render: (r) => r.imie, sortable: true },
];

const wiersze: Wiersz[] = [
  { id: 1, imie: "Anna" },
  { id: 2, imie: "Bartek" },
];

describe("DataTable", () => {
  it("stan ładowania renderuje swój komunikat (role=status)", () => {
    render(
      <DataTable columns={kolumny} rows={[]} rowKey={(r) => r.id} stan="loading" />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("stan błędu renderuje swój komunikat", () => {
    render(
      <DataTable
        columns={kolumny}
        rows={[]}
        rowKey={(r) => r.id}
        stan="error"
        komunikatBledu="Nie udało się wczytać listy."
      />,
    );

    expect(screen.getByText("Nie udało się wczytać listy.")).toBeInTheDocument();
  });

  it("stan pusty renderuje swój komunikat", () => {
    render(
      <DataTable
        columns={kolumny}
        rows={[]}
        rowKey={(r) => r.id}
        stan="empty"
        pustyTytul="Brak wpisów"
      />,
    );

    expect(screen.getByRole("heading", { name: "Brak wpisów" })).toBeInTheDocument();
  });

  it("stan odmowy renderuje swój komunikat", () => {
    render(
      <DataTable
        columns={kolumny}
        rows={[]}
        rowKey={(r) => r.id}
        stan="forbidden"
        komunikatBrakUprawnien="Brak uprawnień do tej listy."
      />,
    );

    expect(screen.getByText("Brak uprawnień do tej listy.")).toBeInTheDocument();
  });

  it("stan dane renderuje tabelę z wierszami", () => {
    render(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Bartek")).toBeInTheDocument();
  });

  it("sortowanie klawiaturą zmienia aria-sort na nagłówku", async () => {
    const onSortChange = vi.fn();
    const uzytkownik = userEvent.setup();
    render(
      <DataTable
        columns={kolumny}
        rows={wiersze}
        rowKey={(r) => r.id}
        stan="success"
        sort={null}
        onSortChange={onSortChange}
      />,
    );

    const naglowek = screen.getByRole("columnheader", { name: /Imię/ });
    expect(naglowek).toHaveAttribute("aria-sort", "none");

    await uzytkownik.tab();
    await uzytkownik.keyboard("{Enter}");

    expect(onSortChange).toHaveBeenCalledWith("imie");
  });

  it("aria-sort odzwierciedla kierunek bieżącego sortowania", () => {
    render(
      <DataTable
        columns={kolumny}
        rows={wiersze}
        rowKey={(r) => r.id}
        stan="success"
        sort={{ key: "imie", direction: "asc" }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /Imię/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("axe: 0 naruszeń w stanie dane", async () => {
    const { container } = render(
      <DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });

  it("axe: 0 naruszeń w stanie ładowania", async () => {
    const { container } = render(
      <DataTable columns={kolumny} rows={[]} rowKey={(r) => r.id} stan="loading" />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
