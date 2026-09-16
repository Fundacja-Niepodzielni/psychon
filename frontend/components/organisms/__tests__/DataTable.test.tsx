import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataTable, { type DataTableColumn } from "@/components/organisms/DataTable";
import { axeViolations } from "../../molecules/__tests__/axe-helper";
import { wywolajResizeObserver } from "../../../__tests__/setup";

// Zaślepka `ResizeObserver` (działająca, nie pusta) mieszka we wspólnym
// `__tests__/setup.ts` — kontener tabeli mierzy nim własne przepełnienie
// (Z-10). Przepełnienie niżej wymuszamy albo zdarzeniem `resize` okna, albo
// bezpośrednim wywołaniem obserwatora przez `wywolajResizeObserver`.

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

  it("stan odmowy renderuje ForbiddenState, nie wygląda jak awaria (Z-6)", () => {
    render(
      <DataTable
        columns={kolumny}
        rows={[]}
        rowKey={(r) => r.id}
        stan="forbidden"
        komunikatBrakUprawnien="Brak uprawnień do tej listy."
      />,
    );

    expect(screen.getByText("Brak dostępu")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spróbuj ponownie/ })).not.toBeInTheDocument();
  });

  it("stan błędu z onRetry pokazuje przycisk ponowienia i woła go po kliknięciu", async () => {
    const onPonow = vi.fn();
    const uzytkownik = userEvent.setup();
    render(
      <DataTable
        columns={kolumny}
        rows={[]}
        rowKey={(r) => r.id}
        stan="error"
        komunikatBledu="Nie udało się wczytać listy."
        onPonow={onPonow}
      />,
    );

    const przycisk = screen.getByRole("button", { name: /Spróbuj ponownie/ });
    await uzytkownik.click(przycisk);

    expect(onPonow).toHaveBeenCalledOnce();
  });

  it("stan błędu bez onRetry nie pokazuje przycisku ponowienia", () => {
    render(
      <DataTable
        columns={kolumny}
        rows={[]}
        rowKey={(r) => r.id}
        stan="error"
        komunikatBledu="Nie udało się wczytać listy."
      />,
    );

    expect(screen.queryByRole("button", { name: /Spróbuj ponownie/ })).not.toBeInTheDocument();
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

  it("przycisk sortowania ma klasę pola dotyku min-h-11 (Z-10; jsdom nie liczy px, mierzy tylko przeglądarka)", () => {
    render(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    const przycisk = screen.getByRole("button", { name: /Imię/ });
    expect(przycisk.className).toMatch(/\bmin-h-11\b/);
  });

  it("pokazuje oznaczenie przewijania, gdy kontener tabeli się przepełnia (Z-10)", () => {
    render(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    const kontener = screen.getByRole("table").parentElement as HTMLElement;
    Object.defineProperty(kontener, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(kontener, "clientWidth", { value: 300, configurable: true });
    fireEvent(window, new Event("resize"));

    expect(screen.getByText(/Przewiń w bok/)).toBeInTheDocument();
  });

  it("nie pokazuje oznaczenia przewijania, gdy kontener tabeli się mieści (Z-10)", () => {
    render(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    const kontener = screen.getByRole("table").parentElement as HTMLElement;
    Object.defineProperty(kontener, "scrollWidth", { value: 300, configurable: true });
    Object.defineProperty(kontener, "clientWidth", { value: 300, configurable: true });
    fireEvent(window, new Event("resize"));

    expect(screen.queryByText(/Przewiń w bok/)).not.toBeInTheDocument();
  });

  it("oznaczenie przewijania pojawia się po przejściu ładowanie → dane, przy tych samych tablicach kolumn i wierszy (Z-10)", () => {
    const { rerender } = render(
      <DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="loading" />,
    );
    rerender(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    const kontener = screen.getByRole("table").parentElement as HTMLElement;
    Object.defineProperty(kontener, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(kontener, "clientWidth", { value: 300, configurable: true });
    fireEvent(window, new Event("resize"));

    expect(screen.getByText(/Przewiń w bok/)).toBeInTheDocument();
  });

  it("oznaczenie przewijania pojawia się po przejściu błąd → dane, przy tych samych tablicach kolumn i wierszy (Z-10)", () => {
    const { rerender } = render(
      <DataTable
        columns={kolumny}
        rows={wiersze}
        rowKey={(r) => r.id}
        stan="error"
        komunikatBledu="Nie udało się wczytać listy."
      />,
    );
    rerender(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    const kontener = screen.getByRole("table").parentElement as HTMLElement;
    Object.defineProperty(kontener, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(kontener, "clientWidth", { value: 300, configurable: true });
    fireEvent(window, new Event("resize"));

    expect(screen.getByText(/Przewiń w bok/)).toBeInTheDocument();
  });

  it("oznaczenie przewijania pojawia się po zgłoszeniu przez ResizeObserver, bez zdarzenia resize okna", () => {
    render(<DataTable columns={kolumny} rows={wiersze} rowKey={(r) => r.id} stan="success" />);

    const kontener = screen.getByRole("table").parentElement as HTMLElement;
    Object.defineProperty(kontener, "scrollWidth", { value: 400, configurable: true });
    Object.defineProperty(kontener, "clientWidth", { value: 300, configurable: true });
    wywolajResizeObserver(kontener);

    expect(screen.getByText(/Przewiń w bok/)).toBeInTheDocument();
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
