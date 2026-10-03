import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PytanieSkrzynki, StronaPytan } from "../dane";

/**
 * Skrzynka pytań na telefonie: wybór widoku stoi w panelu pod wierszem
 * „Pokaż: <wybrany> (N) · Zmień”; wybór widoku zwija panel i oddaje fokus na
 * wiersz.
 */

const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: vi.fn(), apiPaged: (...argumenty: unknown[]) => apiPaged(...argumenty) };
});

const { SkrzynkaPytan } = await import("../SkrzynkaPytan");

const PYTANIE = {
  id: 11,
  lesson_id: 21,
  question: "Jak długo trwa pierwsza rozmowa z osobą zgłaszającą się?",
  answer: null,
  answered_by: null,
  answered_by_name: null,
  answered_at: null,
  created_at: "2026-09-29T10:15:00Z",
  updated_at: "2026-09-29T10:15:00Z",
  user: { id: 17, first_name: "Marta", last_name: "Demo" },
  lesson: { id: 21, title: "Wprowadzenie do wywiadu", course: { id: 3, slug: "wywiad-psychologiczny", title: "Wywiad psychologiczny" } },
} satisfies PytanieSkrzynki;

const DWA = {
  data: [PYTANIE, { ...PYTANIE, id: 12, question: "Czy dyżur można odbyć w parze?" }],
  meta: { current_page: 1, per_page: 25, total: 2, last_page: 1, extra: { unanswered: 2 } },
} satisfies StronaPytan;

const WSZYSTKIE = {
  data: [PYTANIE, { ...PYTANIE, id: 12 }, { ...PYTANIE, id: 13 }],
  meta: { current_page: 1, per_page: 25, total: 3, last_page: 1, extra: { unanswered: 2 } },
} satisfies StronaPytan;

beforeEach(() => {
  apiPaged.mockReset();
  apiPaged.mockImplementation((adres: string) => Promise.resolve(adres.includes("answered=false") ? DWA : WSZYSTKIE));
});

describe("Skrzynka pytań — zwinięte filtry", () => {
  it("wiersz „Pokaż” niesie liczbę pytań widoku, a pole wyboru widoku stoi w jego panelu", async () => {
    render(<SkrzynkaPytan />);
    await screen.findByText(PYTANIE.question);

    const przycisk = screen.getByRole("button", { name: /^Pokaż:/ });
    expect(przycisk).toHaveAccessibleName("Pokaż: Tylko nieodpowiedziane (2) Zmień");
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(przycisk.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByRole("combobox", { name: "Które pytania pokazać" })).toBeInTheDocument();
  });

  it("wybór widoku zwija panel i oddaje fokus na wiersz z nowym widokiem", async () => {
    const uzytkownik = userEvent.setup();
    render(<SkrzynkaPytan />);
    await screen.findByText(PYTANIE.question);

    await uzytkownik.click(screen.getByRole("button", { name: /^Pokaż:/ }));
    await uzytkownik.click(screen.getByRole("combobox", { name: "Które pytania pokazać" }));
    await uzytkownik.click(screen.getByRole("option", { name: "Pokaż wszystkie" }));

    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/instructor/questions?page=1"));
    await screen.findByText("Wszystkie pytania");
    const po = screen.getByRole("button", { name: /^Pokaż:/ });
    expect(po).toHaveAccessibleName("Pokaż: Pokaż wszystkie (3) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
  });
});
