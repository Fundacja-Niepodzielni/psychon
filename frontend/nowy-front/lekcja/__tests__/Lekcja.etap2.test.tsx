import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KURS, LEKCJA } from "./pomoce";

/**
 * Stany spoza siedmiu podstawowych: ostatnia lekcja tematu, ostatnia lekcja
 * kursu (z testem i bez), lekcja po ukończeniu bez następnej w odczycie kursu.
 * Brak internetu, błąd pobrania pliku i wygasły dostęp mają testy przy swoich
 * ekranach: `Lekcja.heartbeat`, `Lekcja.pliki`, `Lekcja.test`.
 */

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return { ...original, pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args), pobierzPytania: async () => [] };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

async function otworz(idLekcji: number, nadpisz: Record<string, unknown>, kurs = KURS) {
  const dane = { ...LEKCJA, id: idLekcji, title: `Lekcja ${idLekcji}`, ...nadpisz };
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane, bezNagrania: true });
  pobierzOdczytKursu.mockResolvedValue(kurs);
  render(<Lekcja id={String(idLekcji)} />);
  await screen.findByRole("heading", { level: 1, name: `Lekcja ${idLekcji}` });
  await screen.findByText(/^\d+ z \d+ lekcji ukończone/);
}

function glowny() {
  const lista = screen
    .getAllByRole("button")
    .filter((b) => b.className.split(/\s+/).some((k) => /(^|_)primary(_|$)/.test(k)));
  expect(lista).toHaveLength(1);
  return lista[0];
}

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  push.mockReset();
});

describe("ostatnia lekcja tematu", () => {
  it("przed ukończeniem: zwykły przycisk ukończenia, postęp „2 z 7 … jesteś w lekcji 7”", async () => {
    await otworz(25, { is_completed: false, video_status: "none" });

    expect(glowny()).toHaveTextContent("Oznacz lekcję jako ukończoną");
    expect(screen.getByText("2 z 7 lekcji ukończone · jesteś w lekcji 7")).toBeInTheDocument();
  });

  it("po ukończeniu: „Przejdź do następnego tematu”, zdanie z tytułem tematu i przejście do jego pierwszej lekcji", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(25, { is_completed: true, video_status: "none" });

    expect(glowny()).toHaveTextContent("Przejdź do następnego tematu");
    expect(screen.getByText("Temat ukończony. Następny: „Rozmowa z osobą w kryzysie”.")).toBeInTheDocument();
    await uzytkownik.click(glowny());
    expect(push).toHaveBeenCalledWith("/panel/lekcje/31?kurs=pierwsza-pomoc-psychologiczna");
  });
});

describe("ostatnia lekcja kursu", () => {
  const OSTATNIA = { is_completed: true, video_status: "none", topic: { id: 8, title: "Rozmowa z osobą w kryzysie", position: 2 } };

  it("z testem: „Przejdź do testu” prowadzi do testu kursu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(31, OSTATNIA);

    expect(glowny()).toHaveTextContent("Przejdź do testu");
    expect(screen.getByText("Wszystkie lekcje ukończone. Został test.")).toBeInTheDocument();
    await uzytkownik.click(glowny());
    expect(push).toHaveBeenCalledWith("/panel/kursy/pierwsza-pomoc-psychologiczna/test");
  });

  it("bez testu: „Wróć do kursu” prowadzi na stronę kursu", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(31, OSTATNIA, { ...KURS, has_test: false });

    expect(glowny()).toHaveTextContent("Wróć do kursu");
    expect(screen.getByText("Wszystkie lekcje ukończone.")).toBeInTheDocument();
    await uzytkownik.click(glowny());
    expect(push).toHaveBeenCalledWith("/panel/kursy/pierwsza-pomoc-psychologiczna");
  });

  it("odczyt kursu bez pola has_test: nie obiecuje testu", async () => {
    const bezPola = { ...KURS } as Partial<typeof KURS>;
    delete bezPola.has_test;
    await otworz(31, OSTATNIA, { ...bezPola, has_test: false } as typeof KURS);

    expect(screen.queryByText("Przejdź do testu")).toBeNull();
  });
});

describe("kurs, w którym nie ma tej lekcji albo nie da się go odczytać", () => {
  it("odczyt kursu zawiódł: po ukończeniu przycisk prowadzi do kursów", async () => {
    const uzytkownik = userEvent.setup();
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: { ...LEKCJA, is_completed: true, course: null }, bezNagrania: true });
    render(<Lekcja id="21" />);
    await screen.findByRole("heading", { level: 1, name: LEKCJA.title });

    expect(glowny()).toHaveTextContent("Wróć do kursu");
    expect(screen.queryByText(/lekcji ukończone/)).toBeNull();
    await uzytkownik.click(glowny());
    expect(push).toHaveBeenCalledWith("/panel/kursy");
  });
});
