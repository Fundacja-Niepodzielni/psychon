import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { ListaKursow } from "../ListaKursow";
import type { KursSciezki } from "../dane";

/**
 * Wiersz listy kursów uczestnika i studenta to `ListRow`: plakietka (małą
 * literą) przed tytułem w jednym nagłówku, podlinia, akcja. Kurs zamknięty —
 * nieaktywny przycisk z kłódką, bez odnośnika; pozostałe — odnośnik, którego
 * nazwa dostępna zaczyna się od widocznego słowa („Otwórz kurs: <tytuł>”).
 */

afterEach(cleanup);

const KURSY = [
  { id: 1, slug: "podstawy", title: "Podstawy pomocy", sequence_order: 1, status: "completed", progress_percent: 100 },
  { id: 2, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2, status: "in_progress", progress_percent: 40 },
  { id: 3, slug: "interwencja", title: "Interwencja kryzysowa", sequence_order: 3, status: "locked", progress_percent: 0 },
] as unknown as KursSciezki[];

function renderuj() {
  return render(
    <ListaKursow
      tytul="Twoja ścieżka"
      kursy={KURSY}
      podpowiedz={(k) => `Kurs ${k.sequence_order} · ${k.progress_percent}% ukończone`}
      pusty={{ naglowek: "Brak", tresc: "Brak", przycisk: { etykieta: "Odśwież", onClick: vi.fn() } }}
    />,
  );
}

function wiersz(container: HTMLElement, stan: string) {
  const w = container.querySelector<HTMLElement>(`[data-kurs-stan="${stan}"]`);
  if (!w) throw new Error(`brak wiersza ${stan}`);
  return w;
}

describe("ListaKursow — wiersz na ListRow", () => {
  it.each([
    ["completed", "ukończony", "Podstawy pomocy", "Kurs 1 · 100% ukończone"],
    ["in_progress", "w toku", "Wywiad psychologiczny", "Kurs 2 · 40% ukończone"],
    ["locked", "zamknięty", "Interwencja kryzysowa", "Kurs 3 · 0% ukończone"],
  ])("%s: plakietka „%s” przed tytułem w jednym nagłówku, podlinia", (stan, plakietka, tytul, podlinia) => {
    const { container } = renderuj();
    const w = wiersz(container, stan);
    expect(w.querySelector('[data-wariant="ze-stanem"]')).not.toBeNull();
    const p = within(w).getByText(plakietka);
    const t = within(w).getByText(tytul);
    expect(p.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(p.closest("div")?.contains(t)).toBe(true);
    expect(within(w).getByText(podlinia)).toBeInTheDocument();
  });

  it("kurs zamknięty: nieaktywny przycisk „Zamknięty” z kłódką, bez odnośnika", () => {
    const { container } = renderuj();
    const w = wiersz(container, "locked");
    const przycisk = within(w).getByRole("button", { name: "Zamknięty" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk.querySelector("svg")).not.toBeNull();
    expect(w.querySelector("a")).toBeNull();
  });

  it.each([
    ["completed", "Podstawy pomocy", "podstawy"],
    ["in_progress", "Wywiad psychologiczny", "wywiad"],
  ])("%s: odnośnik „Otwórz kurs: %s”, nazwa zaczyna się od widocznego słowa", (stan, tytul, slug) => {
    const { container } = renderuj();
    const w = wiersz(container, stan);
    const odnosnik = within(w).getByRole("link", { name: `Otwórz kurs: ${tytul}` });
    expect(odnosnik).toHaveAttribute("href", `/panel/kursy/${slug}`);
    const widoczne = (odnosnik.textContent ?? "").replace("›", "").trim();
    expect(widoczne).toBe("Otwórz");
    expect(`Otwórz kurs: ${tytul}`.startsWith(widoczne)).toBe(true);
    expect(within(w).queryByRole("button")).toBeNull();
  });
});
