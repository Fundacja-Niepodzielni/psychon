import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "../../__tests__/axe-helper";
import NotificationList from "@/components/organisms/NotificationList";
import type { NotificationItem } from "@/lib/notifications/types";

const pozycje: NotificationItem[] = [
  {
    id: 1,
    type: "info",
    title: "Nowy kurs dostępny",
    body: "Sprawdź program.",
    link: null,
    read_at: null,
    created_at: "2026-09-16T10:00:00Z",
  },
  {
    id: 2,
    type: "info",
    title: "Egzamin zaliczony",
    body: null,
    link: null,
    read_at: "2026-09-15T09:00:00Z",
    created_at: "2026-09-14T10:00:00Z",
  },
];

describe("NotificationList", () => {
  it("render w spoczynku: lista pozycji z tytułami", () => {
    render(<NotificationList items={pozycje} />);

    expect(screen.getByText("Nowy kurs dostępny")).toBeInTheDocument();
    expect(screen.getByText("Egzamin zaliczony")).toBeInTheDocument();
  });

  it("przeczytane / nieprzeczytane oznaczone słowem, nie tylko kolorem", () => {
    render(<NotificationList items={pozycje} />);

    expect(screen.getByText("Nieprzeczytane")).toBeInTheDocument();
    expect(screen.getByText("Przeczytane")).toBeInTheDocument();
  });

  it("stan pusty: EmptyState, gdy brak pozycji", () => {
    render(<NotificationList items={[]} />);

    expect(screen.getByRole("heading", { name: "Brak powiadomień" })).toBeInTheDocument();
  });

  it("stan ładowania: role='status'", () => {
    render(<NotificationList items={[]} loading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("stan błędu: ErrorState zamiast listy", () => {
    render(<NotificationList items={pozycje} error="Nie udało się wczytać powiadomień." />);

    expect(screen.getByText("Nie udało się wczytać powiadomień.")).toBeInTheDocument();
    // NotificationList z props error renderuje ErrorState zamiast listy
    // synchronicznie w tym samym render() wyżej — pozycje z items nie trafiają
    // do drzewa w tej gałęzi.
    expect(screen.queryByText("Nowy kurs dostępny")).not.toBeInTheDocument();
  });

  it("kliknięcie pozycji wywołuje onItemClick z pozycją", async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();
    render(<NotificationList items={pozycje} onItemClick={onItemClick} />);

    await user.click(screen.getByText("Nowy kurs dostępny"));

    expect(onItemClick).toHaveBeenCalledWith(pozycje[0]);
  });

  it("axe: 0 naruszeń na wyrenderowanej liście", async () => {
    const { container } = render(<NotificationList items={pozycje} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
