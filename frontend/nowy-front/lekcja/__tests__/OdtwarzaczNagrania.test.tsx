import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OdtwarzaczNagrania } from "../odtwarzacz/OdtwarzaczNagrania";

/** Jeden punkt odtwarzacza: ten sam zestaw właściwości, które dostanie ramka dostawcy. */

function zloz(nadpisz: { czasTrwaniaSekund?: number; pozycjaStartowaSekundy?: number } = {}) {
  const wlasciwosci = {
    czasTrwaniaSekund: 1200,
    pozycjaStartowaSekundy: 0,
    onZmianaOdtwarzania: vi.fn<(odtwarza: boolean) => void>(),
    onSekunda: vi.fn<(pozycjaSekund: number) => void>(),
    onZmianaPozycji: vi.fn<(pozycjaSekund: number) => void>(),
    onKoniec: vi.fn<() => void>(),
    ...nadpisz,
  };
  const wynik = render(<OdtwarzaczNagrania {...wlasciwosci} />);
  return { ...wynik, wlasciwosci };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OdtwarzaczNagrania — start i sterowanie", () => {
  it("od początku: duży przycisk „Odtwórz nagranie”, czas 00:00 / 20:00, bez zdania o wznowieniu", () => {
    zloz();

    expect(screen.getByRole("button", { name: "Odtwórz nagranie" })).toBeInTheDocument();
    expect(screen.getByText("00:00 / 20:00")).toBeInTheDocument();
    expect(screen.queryByText(/Ostatnio zatrzymano/)).toBeNull();
  });

  it("z pozycją startową: szeroki przycisk, zdanie o miejscu i czas od tej pozycji", () => {
    const { container } = zloz({ pozycjaStartowaSekundy: 720 });

    expect(screen.getByRole("button", { name: "Odtwórz od 12. minuty" })).toBeInTheDocument();
    expect(screen.getByText("Ostatnio zatrzymano w 12. minucie.")).toBeInTheDocument();
    expect(screen.getByText("12:00 / 20:00")).toBeInTheDocument();
    expect(container.querySelector("[data-pozycja-startowa]")).toHaveAttribute("data-pozycja-startowa", "720");
  });

  it("odtwarzanie zgłasza jedną sekundę na sekundę z pozycją bezwzględną i jedno zdarzenie gry", () => {
    const { wlasciwosci } = zloz({ pozycjaStartowaSekundy: 100 });

    fireEvent.click(screen.getByRole("button", { name: "Odtwórz od 1. minuty" }));
    expect(wlasciwosci.onZmianaOdtwarzania).toHaveBeenCalledTimes(1);
    expect(wlasciwosci.onZmianaOdtwarzania).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(wlasciwosci.onSekunda.mock.calls.map(([pozycja]) => pozycja)).toEqual([101, 102, 103]);
    expect(screen.getByText("01:43 / 20:00")).toBeInTheDocument();
  });

  it("pauza zatrzymuje zegar i zgłasza koniec gry raz", () => {
    const { wlasciwosci } = zloz();

    fireEvent.click(screen.getByRole("button", { name: "Odtwórz" }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Zatrzymaj" }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(wlasciwosci.onSekunda).toHaveBeenCalledTimes(2);
    expect(wlasciwosci.onZmianaOdtwarzania.mock.calls.map(([gra]) => gra)).toEqual([true, false]);
  });

  it("„Odtwórz od początku” zeruje pozycję, zgłasza skok, zaczyna grać i oddaje fokus małemu przyciskowi", () => {
    const { wlasciwosci } = zloz({ pozycjaStartowaSekundy: 720 });

    fireEvent.click(screen.getByRole("button", { name: "Odtwórz od początku" }));

    expect(wlasciwosci.onZmianaPozycji).toHaveBeenCalledWith(0);
    expect(wlasciwosci.onZmianaOdtwarzania).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText(/Ostatnio zatrzymano/)).toBeNull();
    expect(screen.getByRole("button", { name: "Zatrzymaj" })).toHaveFocus();
  });

  it("dojście do końca zatrzymuje grę i woła onKoniec", () => {
    const { wlasciwosci } = zloz({ czasTrwaniaSekund: 3, pozycjaStartowaSekundy: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Odtwórz od 1. minuty" }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(wlasciwosci.onKoniec).toHaveBeenCalledTimes(1);
    expect(wlasciwosci.onSekunda).toHaveBeenCalledTimes(2);
    expect(wlasciwosci.onZmianaOdtwarzania.mock.calls.map(([gra]) => gra)).toEqual([true, false]);
  });
});

describe("OdtwarzaczNagrania — przewijanie", () => {
  it("suwak ma wartość i opis w minutach; strzałki przewijają o 15 s, Home i End skaczą", () => {
    const { wlasciwosci } = zloz({ pozycjaStartowaSekundy: 720 });
    const suwak = screen.getByRole("slider", { name: "Miejsce w nagraniu" });

    expect(suwak).toHaveAttribute("aria-valuenow", "720");
    expect(suwak).toHaveAttribute("aria-valuemax", "1200");
    expect(suwak).toHaveAttribute("aria-valuetext", "12. minuta z 20");

    fireEvent.keyDown(suwak, { key: "ArrowRight" });
    expect(wlasciwosci.onZmianaPozycji).toHaveBeenLastCalledWith(735);
    fireEvent.keyDown(suwak, { key: "ArrowLeft" });
    expect(wlasciwosci.onZmianaPozycji).toHaveBeenLastCalledWith(720);
    fireEvent.keyDown(suwak, { key: "Home" });
    expect(wlasciwosci.onZmianaPozycji).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(suwak, { key: "End" });
    expect(wlasciwosci.onZmianaPozycji).toHaveBeenLastCalledWith(1200);
    fireEvent.keyDown(suwak, { key: "a" });
    expect(wlasciwosci.onZmianaPozycji).toHaveBeenCalledTimes(4);
  });

  it("przewinięcie zdejmuje zdanie o wznowieniu", () => {
    zloz({ pozycjaStartowaSekundy: 720 });

    fireEvent.keyDown(screen.getByRole("slider", { name: "Miejsce w nagraniu" }), { key: "ArrowRight" });

    expect(screen.queryByText(/Ostatnio zatrzymano/)).toBeNull();
  });
});

describe("OdtwarzaczNagrania — dźwięk i pełny ekran", () => {
  it("przycisk dźwięku przełącza nazwę, pełny ekran jest przyciskiem z nazwą", () => {
    zloz();

    fireEvent.click(screen.getByRole("button", { name: "Wycisz dźwięk" }));
    expect(screen.getByRole("button", { name: "Włącz dźwięk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pełny ekran" })).toBeInTheDocument();
  });

  it("odmowa pełnego ekranu przez przeglądarkę nie wywraca ramki", () => {
    const { container } = zloz();
    const ramka = container.firstElementChild as HTMLElement;
    ramka.requestFullscreen = vi.fn().mockRejectedValue(new Error("odmowa"));

    fireEvent.click(screen.getByRole("button", { name: "Pełny ekran" }));

    expect(ramka.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Odtwórz nagranie" })).toBeInTheDocument();
  });
});
