import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "../../../../components/__tests__/axe-helper";
import { ETYKIETA_ZAMKNIECIA_PASKA, PasekPotwierdzenia, usePasekPotwierdzenia } from "../PasekPotwierdzenia";

function Ekran() {
  const pasek = usePasekPotwierdzenia();
  return (
    <main>
      <h1>Ekran próbny</h1>
      <PasekPotwierdzenia komunikat={pasek.komunikat} onZamknij={pasek.ukryj} />
      <button type="button" onClick={() => pasek.powodzenie("Zapisano zmiany.")}>
        Zapisz
      </button>
      <button type="button" onClick={() => pasek.niepowodzenie("Nie zapisano zmian.")}>
        Zapisz z błędem
      </button>
      <button type="button" onClick={pasek.ukryj}>
        Następna akcja
      </button>
    </main>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PasekPotwierdzenia", () => {
  it("bez komunikatu nic nie renderuje", () => {
    render(<Ekran />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("powodzenie: role status, jedno zdanie, bez roli alert", async () => {
    render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(screen.getByRole("status")).toHaveTextContent("Zapisano zmiany.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("niepowodzenie: role alert, bez roli status", async () => {
    render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz z błędem" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nie zapisano zmian.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("przycisk zamknięcia ma nazwę dostępną i zamyka pasek, a fokus wraca na nagłówek ekranu", async () => {
    render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(ETYKIETA_ZAMKNIECIA_PASKA).toBe("Zamknij komunikat");
    await userEvent.click(screen.getByRole("button", { name: "Zamknij komunikat" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Ekran próbny" }));
  });

  it("własne miejsce powrotu fokusu ma pierwszeństwo przed nagłówkiem", async () => {
    const wroc = vi.fn();
    render(
      <PasekPotwierdzenia
        komunikat={{ wariant: "powodzenie", tresc: "Wysłano pytanie.", numer: 1 }}
        onZamknij={() => undefined}
        poZamknieciu={wroc}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Zamknij komunikat" }));
    expect(wroc).toHaveBeenCalledTimes(1);
  });

  it("nie znika po czasie: po godzinie z przesuniętym zegarem komunikat nadal jest", async () => {
    vi.useFakeTimers();
    render(<Ekran />);
    await act(async () => {
      screen.getByRole("button", { name: "Zapisz" }).click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Zapisano zmiany.");
  });

  it("kolejna akcja zastępuje poprzedni komunikat (powodzenie, potem niepowodzenie)", async () => {
    render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz z błędem" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Nie zapisano zmian.");
  });

  it("ten sam tekst po kolejnej akcji jest nowym elementem (ogłaszany ponownie)", async () => {
    render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    const pierwszy = screen.getByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(screen.getByRole("status")).not.toBe(pierwszy);
  });

  it("ukryj zdejmuje komunikat (początek następnej akcji formularza)", async () => {
    render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    await userEvent.click(screen.getByRole("button", { name: "Następna akcja" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("axe: bez naruszeń w obu wariantach", async () => {
    const { container } = render(<Ekran />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(await axeViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz z błędem" }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("PasekPotwierdzenia — wygląd", () => {
  const css = readFileSync(resolve(__dirname, "../PasekPotwierdzenia.module.css"), "utf8");

  it("cel dotyku przycisku zamknięcia ma 44 px z tokenu", () => {
    const blok = css.slice(css.indexOf(".zamknij {"), css.indexOf("}", css.indexOf(".zamknij {")));
    expect(blok).toContain("min-height: var(--hit-min)");
    expect(blok).toContain("min-width: var(--hit-min)");
  });

  it("kolory i odstępy wyłącznie ze zmiennych wzornictwa, bez animacji", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css.replaceAll("4px solid", "")).not.toMatch(/\d+px/);
    expect(css).not.toMatch(/animation|transition/);
  });
});
