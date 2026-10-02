import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { ListaKursow, zdanieZamknietegoKursu } from "../ListaKursow";
import type { KursSciezki } from "../dane";

/**
 * Wiersz kursu zamkniętego mówi, co go otworzy: tytuł poprzedniego kursu
 * ścieżki z danych listy, a gdy tych danych nie ma — zdanie bez tytułu.
 * Kursy otwarte zachowują swoją podlinię.
 */

afterEach(cleanup);

function kurs(id: number, numer: number | null, status: string, title = `Kurs ${id}`): KursSciezki {
  return { id, slug: `kurs-${id}`, title, sequence_order: numer, status, progress_percent: 0 } as unknown as KursSciezki;
}

function renderuj(kursy: KursSciezki[]) {
  return render(
    <ListaKursow
      tytul="Twoja ścieżka"
      kursy={kursy}
      podpowiedz={(k) => `Kurs ${k.sequence_order} · ${k.progress_percent}% ukończone`}
      pusty={{ naglowek: "Brak", tresc: "Brak", przycisk: { etykieta: "Odśwież", onClick: vi.fn() } }}
    />,
  );
}

describe("zdanie w wierszu zamkniętego kursu", () => {
  it("z tytułem poprzedniego kursu ścieżki, gdy lista go ma", () => {
    const kursy = [kurs(1, 1, "completed", "Podstawy pomocy"), kurs(2, 2, "in_progress", "Wywiad psychologiczny"), kurs(3, 3, "locked")];
    const { container } = renderuj(kursy);
    const wiersz = container.querySelector<HTMLElement>('[data-kurs-stan="locked"]')!;

    expect(within(wiersz).getByText("Otworzy się po ukończeniu kursu „Wywiad psychologiczny”.")).toBeInTheDocument();
    expect(wiersz.textContent).not.toContain("% ukończone");
  });

  it("poprzedni to najbliższy niższy numer, także przy luce w numeracji i innej kolejności listy", () => {
    const kursy = [kurs(9, 7, "locked"), kurs(1, 1, "completed", "Pierwszy"), kurs(4, 4, "in_progress", "Czwarty")];
    expect(zdanieZamknietegoKursu(kursy[0], kursy)).toBe("Otworzy się po ukończeniu kursu „Czwarty”.");
  });

  it("bez tytułu, gdy poprzedniego kursu nie ma na liście", () => {
    const kursy = [kurs(3, 3, "locked")];
    const { container } = renderuj(kursy);
    const wiersz = container.querySelector<HTMLElement>('[data-kurs-stan="locked"]')!;

    expect(within(wiersz).getByText("Otworzy się po ukończeniu poprzedniego kursu.")).toBeInTheDocument();
  });

  it("bez tytułu, gdy kurs nie ma numeru w ścieżce albo poprzedni ma pusty tytuł", () => {
    const bezNumeru = [kurs(1, 1, "completed", "Pierwszy"), kurs(2, null, "locked")];
    expect(zdanieZamknietegoKursu(bezNumeru[1], bezNumeru)).toBe("Otworzy się po ukończeniu poprzedniego kursu.");

    const pustyTytul = [kurs(1, 1, "completed", "   "), kurs(2, 2, "locked")];
    expect(zdanieZamknietegoKursu(pustyTytul[1], pustyTytul)).toBe("Otworzy się po ukończeniu poprzedniego kursu.");
  });

  it("kursy otwarte zachowują podlinię z postępem", () => {
    const kursy = [kurs(1, 1, "completed", "Pierwszy"), kurs(2, 2, "locked")];
    const { container } = renderuj(kursy);
    const otwarty = container.querySelector<HTMLElement>('[data-kurs-stan="completed"]')!;

    expect(within(otwarty).getByText("Kurs 1 · 0% ukończone")).toBeInTheDocument();
    expect(otwarty.textContent).not.toContain("Otworzy się");
  });
});
