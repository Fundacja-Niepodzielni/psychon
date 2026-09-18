import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek ekranu warunków certyfikatu (H13, pozycja 19 Załącznika 1
 * „Warunki certyfikatu"):
 * (1) każda liczba, którą API już zwraca osobno (internship, supervision),
 *     renderuje się jako osobny licznik, a brakujące pole pokazuje „brak
 *     danych", nigdy fałszywe 0 — `courses` scala etapy z testami po
 *     stronie API (backend/app/Support/H13/CertificateConditions.php:29-43,
 *     ProgressAggregator.php:52 — jedno pole `courses_done`); rozbicie na
 *     osobną liczbę zaliczonych testów wymaga zmiany backendu (poza
 *     zakresem tego zadania — patrz raport);
 * (2) każda liczba prowadzi do ekranu źródłowego: courses→/panel/kursy,
 *     internship→/panel/staz, supervision→/panel/superwizja; `workshop`
 *     nie ma ekranu źródłowego dla uczestniczki (warsztat odhacza wyłącznie
 *     AdminWorkshopController), więc nie dostaje linku.
 */

const fetchCertificateConditions = vi.fn();

vi.mock("@/lib/pulpit/data", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/pulpit/data")>();
  return {
    ...actual,
    fetchCertificateConditions: (...args: unknown[]) => fetchCertificateConditions(...args),
  };
});

const { default: CertificatePage } = await import("@/app/(uczestnik)/panel/certyfikat/page");

const pelneWarunki = {
  eligible: false,
  conditions: [
    { key: "courses" as const, label: "Wszystkie etapy i testy", done: 1, required: 10, met: false },
    { key: "internship" as const, label: "Godziny stażu", done: "41.5", required: "72", met: false },
    { key: "supervision" as const, label: "Obecności na superwizjach", done: 5, required: 6, met: false },
    { key: "workshop" as const, label: "Warsztat stacjonarny", met: false },
  ],
};

beforeEach(() => {
  fetchCertificateConditions.mockReset();
});

describe("CertificatePage — liczniki i przejście do źródła (poz. 19)", () => {
  it("liczniki renderują się osobno z poprawnymi wartościami i linkiem do ekranu źródłowego", async () => {
    fetchCertificateConditions.mockResolvedValue(pelneWarunki);
    render(<CertificatePage />);

    await waitFor(() => expect(screen.getByText("1 / 10")).toBeInTheDocument());

    const kursy = screen.getByRole("link", {
      name: "Wszystkie etapy i testy: 1 / 10 — przejdź do listy kursów i testów",
    });
    expect(kursy).toHaveAttribute("href", "/panel/kursy");

    const staz = screen.getByRole("link", {
      name: "Godziny stażu: 41.5 / 72 — przejdź do dziennika stażu",
    });
    expect(staz).toHaveAttribute("href", "/panel/staz");

    const superwizja = screen.getByRole("link", {
      name: "Obecności na superwizjach: 5 / 6 — przejdź do terminów superwizji",
    });
    expect(superwizja).toHaveAttribute("href", "/panel/superwizja");

    // workshop ma tylko etykietę i status, bez osobnej liczby.
    expect(screen.getByText("Warsztat stacjonarny")).toBeInTheDocument();
  });

  it("noga negatywna: brakujące pole liczbowe pokazuje „brak danych”, nie 0", async () => {
    fetchCertificateConditions.mockResolvedValue({
      eligible: false,
      conditions: [
        { key: "courses" as const, label: "Wszystkie etapy i testy", met: false },
        ...pelneWarunki.conditions.slice(1),
      ],
    });
    render(<CertificatePage />);

    await waitFor(() =>
      expect(
        screen.getByRole("link", {
          name: "Wszystkie etapy i testy: brak danych — przejdź do listy kursów i testów",
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("0 / undefined", { exact: false })).not.toBeInTheDocument();
  });

  it("noga negatywna: warunek bez ekranu źródłowego dla roli (workshop) nie dostaje linku", async () => {
    fetchCertificateConditions.mockResolvedValue(pelneWarunki);
    render(<CertificatePage />);

    await waitFor(() => expect(screen.getByText("Warsztat stacjonarny")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Warsztat stacjonarny/ })).not.toBeInTheDocument();
  });
});
