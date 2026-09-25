import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ExpandableTable from "@/components/molecules/ExpandableTable";
import type { Column } from "@/components/ui/Table";

interface Wiersz {
  id: number;
  nazwa: string;
}

const wiersze: Wiersz[] = [
  { id: 1, nazwa: "Pierwszy" },
  { id: 2, nazwa: "Drugi" },
];

const kolumny: Column<Wiersz>[] = [
  { key: "nazwa", header: "Nazwa", render: (row) => row.nazwa },
];

describe("ExpandableTable", () => {
  it("pozytyw: renderuje wiersze płasko, bez własnej rozwijanej treści domyślnie", () => {
    render(
      <ExpandableTable
        columns={kolumny}
        rows={wiersze}
        rowKey={(row) => row.id}
        caption="Świadek"
      />,
    );

    expect(screen.getByText("Pierwszy")).toBeInTheDocument();
    expect(screen.getByText("Drugi")).toBeInTheDocument();
    // Bez `onReorder` nie ma kolumny uchwytu.
    expect(screen.queryByText("Uchwyt przeciągania")).not.toBeInTheDocument();
  });

  it("pozytyw (U-4/U-8): rozwinięcie renderuje się w wierszu TUŻ POD wskazanym kluczem", () => {
    render(
      <ExpandableTable
        columns={kolumny}
        rows={wiersze}
        rowKey={(row) => row.id}
        caption="Świadek"
        expandedRowKey={1}
        renderExpanded={(row) => <div>Formularz dla {row.nazwa}</div>}
      />,
    );

    const wierszPierwszy = screen.getByText("Pierwszy").closest("tr");
    const nastepnyWiersz = wierszPierwszy?.nextElementSibling as HTMLElement;

    expect(
      within(nastepnyWiersz).getByText("Formularz dla Pierwszy"),
    ).toBeInTheDocument();
    // Drugi wiersz nie ma rozwinięcia — klucz się nie zgadza.
    expect(screen.queryByText("Formularz dla Drugi")).not.toBeInTheDocument();
  });

  it("pozytyw (U-9): przeciągnięcie wiersza 0 i upuszczenie na wiersz 1 woła onReorder(0, 1)", () => {
    const onReorder = vi.fn();
    render(
      <ExpandableTable
        columns={kolumny}
        rows={wiersze}
        rowKey={(row) => row.id}
        caption="Świadek"
        onReorder={onReorder}
      />,
    );

    // Z onReorder dochodzi kolumna uchwytu (a11y: ukryta wizualnie etykieta).
    expect(screen.getByText("Uchwyt przeciągania")).toBeInTheDocument();

    const wierszDrugi = screen.getByText("Drugi").closest("tr") as HTMLElement;
    const uchwyty = document.querySelectorAll("[draggable='true']");
    const dataTransfer = { effectAllowed: "", setData: vi.fn(), getData: vi.fn() };

    fireEvent.dragStart(uchwyty[0], { dataTransfer });
    fireEvent.dragOver(wierszDrugi, { dataTransfer });
    fireEvent.drop(wierszDrugi, { dataTransfer });

    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });
});
