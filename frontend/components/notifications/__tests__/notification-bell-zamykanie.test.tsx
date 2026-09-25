import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationItem } from "@/lib/notifications/types";

/**
 * Zamykanie listy powiadomień przez `useCloseOnOutsideOrEscape`
 * (`lib/hooks/useCloseOnOutsideOrEscape.ts`) — klik poza panelem i Escape
 * zamykaja liste, klik wewnatrz panelu NIE zamyka go.
 *
 * Kontrola negatywna: podmiana ciala hooka na sam `return;` w jego
 * `useEffect` gasi ponizsze testy na czerwono.
 *
 * `apiPaged` — atrapa, zeby test mierzyl wylacznie zamykanie panelu, nie
 * prawdziwe zadanie sieciowe (`lib/api/klient.ts`).
 */

const pozycje: NotificationItem[] = [
  {
    id: 1,
    type: "info",
    title: "Nowy kurs dostępny",
    body: null,
    link: null,
    read_at: null,
    created_at: "2026-09-16T10:00:00Z",
  },
];

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiPaged: vi.fn().mockResolvedValue({ data: pozycje, meta: undefined }),
  };
});

const NotificationBell = (
  await import("@/components/notifications/NotificationBell")
).default;

async function otworzListe(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Powiadomienia" }));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
}

describe("NotificationBell — zamykanie", () => {
  it("klik poza panelem zamyka liste powiadomien", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <NotificationBell />
        <button type="button">poza panelem</button>
      </div>,
    );

    await otworzListe(user);

    fireEvent.mouseDown(screen.getByRole("button", { name: "poza panelem" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("klawisz Escape zamyka liste powiadomien", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await otworzListe(user);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("klik wewnatrz panelu NIE zamyka listy powiadomien", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await otworzListe(user);

    fireEvent.mouseDown(screen.getByText("Nowy kurs dostępny"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("odmontowanie dzwonka zdejmuje nasluch dokumentu — brak wycieku", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<NotificationBell />);

    await otworzListe(user);

    const removeSpy = vi.spyOn(document, "removeEventListener");
    unmount();

    const zdjeteTypy = removeSpy.mock.calls.map(([typ]) => typ);
    expect(zdjeteTypy).toContain("mousedown");
    expect(zdjeteTypy).toContain("keydown");

    removeSpy.mockRestore();
  });
});
