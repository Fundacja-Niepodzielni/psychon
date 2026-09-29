import { StrictMode, act } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LessonPlayer } from "../LessonPlayer";

const nic = () => {};

const PUSTY = {
  naglowek: "Ta lekcja nie ma jeszcze treści",
  tresc: "Nagranie, tekst i materiały pojawią się tu, gdy prowadząca opublikuje lekcję.",
  przycisk: { etykieta: "Wróć do listy lekcji", onClick: nic },
};

const WSPOLNE = {
  id: "test-lekcja",
  tytul: "Wprowadzenie do wywiadu",
  tresc: "Wywiad psychologiczny to rozmowa strukturalna.",
  krokiZrobione: 2,
  krokiRazem: 7,
  materialy: [],
  pytania: [],
  onZadajPytanie: nic,
  czasTrwaniaSekund: 1200,
  obejrzaneSekundy: 480,
  procentAktywnegoCzasu: 40,
  progUkonczenia: 60,
  braki: [],
  pusty: PUSTY,
};

describe("LessonPlayer — zdarzenie zmiany odtwarzania", () => {
  it("montowanie nie woła onZmianaOdtwarzania", () => {
    const onZmianaOdtwarzania = vi.fn();
    render(<LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(0);
  });

  it("start odtwarzania woła onZmianaOdtwarzania(true) dokładnie raz", async () => {
    const onZmianaOdtwarzania = vi.fn();
    render(<LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    await userEvent.click(screen.getByRole("button", { name: "Odtwórz" }));
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(1);
    expect(onZmianaOdtwarzania).toHaveBeenCalledWith(true);
  });

  it("pauza po starcie woła onZmianaOdtwarzania(false)", async () => {
    const onZmianaOdtwarzania = vi.fn();
    render(<LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    const przycisk = screen.getByRole("button", { name: "Odtwórz" });
    await userEvent.click(przycisk);
    await userEvent.click(screen.getByRole("button", { name: "Zatrzymaj" }));
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(2);
    expect(onZmianaOdtwarzania).toHaveBeenNthCalledWith(1, true);
    expect(onZmianaOdtwarzania).toHaveBeenNthCalledWith(2, false);
  });

  it("ponowny render z tym samym stanem i nowymi właściwościami nie woła dodatkowo", async () => {
    const onZmianaOdtwarzania = vi.fn();
    const { rerender } = render(<LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    await userEvent.click(screen.getByRole("button", { name: "Odtwórz" }));
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(1);

    // Nowe właściwości (inny tytuł), ten sam stan `odtwarzane` — bez dodatkowego wywołania.
    rerender(<LessonPlayer {...WSPOLNE} tytul="Inny tytuł lekcji" onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(1);
  });

  it("brak właściwości nie powoduje błędu i zostawia ten sam DOM co przed zmianą", async () => {
    const { container: bez, unmount: odmontujBez } = render(<LessonPlayer {...WSPOLNE} />);
    const domBezPrzedKlikiem = bez.innerHTML;
    await userEvent.click(screen.getByRole("button", { name: "Odtwórz" }));
    expect(screen.getByRole("button", { name: "Zatrzymaj" })).toBeInTheDocument();
    odmontujBez();

    const onZmianaOdtwarzania = vi.fn();
    const { container: z } = render(<LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    expect(z.innerHTML).toEqual(domBezPrzedKlikiem);
    expect(onZmianaOdtwarzania).not.toHaveBeenCalled();
  });

  it("(w1) bez właściwości, dwa kliknięcia w jednym akcie kończą na „Odtwórz”", () => {
    render(<LessonPlayer {...WSPOLNE} />);
    const przycisk = screen.getByRole("button", { name: "Odtwórz" });
    act(() => {
      fireEvent.click(przycisk);
      fireEvent.click(przycisk);
    });
    expect(screen.getByRole("button", { name: "Odtwórz" })).toBeInTheDocument();
  });

  it("(w2) z właściwością, dwa kliknięcia w jednym akcie: „Odtwórz”, ostatnia zgłoszona wartość false, bez dwóch kolejnych równych", () => {
    const onZmianaOdtwarzania = vi.fn();
    render(<LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />);
    const przycisk = screen.getByRole("button", { name: "Odtwórz" });
    act(() => {
      fireEvent.click(przycisk);
      fireEvent.click(przycisk);
    });
    expect(screen.getByRole("button", { name: "Odtwórz" })).toBeInTheDocument();
    const wartosci = onZmianaOdtwarzania.mock.calls.map((wywolanie) => wywolanie[0]);
    if (wartosci.length > 0) {
      expect(wartosci[wartosci.length - 1]).toBe(false);
    }
    for (let i = 1; i < wartosci.length; i += 1) {
      expect(wartosci[i]).not.toBe(wartosci[i - 1]);
    }
  });

  it("(w3) w StrictMode: montaż nie woła, jedno kliknięcie woła dokładnie raz z true", async () => {
    const onZmianaOdtwarzania = vi.fn();
    render(
      <StrictMode>
        <LessonPlayer {...WSPOLNE} onZmianaOdtwarzania={onZmianaOdtwarzania} />
      </StrictMode>,
    );
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(0);
    await userEvent.click(screen.getByRole("button", { name: "Odtwórz" }));
    expect(onZmianaOdtwarzania).toHaveBeenCalledTimes(1);
    expect(onZmianaOdtwarzania).toHaveBeenCalledWith(true);
  });
});
