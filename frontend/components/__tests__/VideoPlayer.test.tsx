import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Świadek atrapy odtwarzacza (`components/VideoPlayer.tsx`) — dziś bez
 * żadnej próby. Mierzone jest wyłącznie zachowanie startowej pozycji:
 *
 * - pozycja większa niż długość materiału startuje przycięta do końca,
 * - brak pozycji (`0`, `null`, `undefined`) startuje od zera, nigdy `NaN`,
 * - pozycja startowa jest czytana raz, przy montażu — zmiana propsa po
 *   zamontowaniu nie cofa ani nie przesuwa już trwającego odtwarzania.
 *
 * Odczyt przez `aria-label="Pozycja"` na widocznym tekście czasu i
 * `aria-label="Przewiń materiał"` na suwaku — oba są tym, co ekran
 * rzeczywiście POKAZUJE, nie strukturą znaczników wokół nich.
 */

const { default: VideoPlayer } = await import("@/components/VideoPlayer");

function suwak() {
  return screen.getByLabelText("Przewiń materiał") as HTMLInputElement;
}

function pozycja() {
  return screen.getByLabelText("Pozycja");
}

describe("pozycja większa od długości materiału", () => {
  it("start jest przycięty do końca materiału, nie do wpisanej wartości", () => {
    render(<VideoPlayer durationSeconds={100} initialPositionSeconds={500} />);

    expect(pozycja()).toHaveTextContent("1:40");
    expect(suwak().value).toBe("100");
  });
});

describe("brak pozycji startuje od zera, bez NaN", () => {
  it("position_seconds = 0", () => {
    render(<VideoPlayer durationSeconds={200} initialPositionSeconds={0} />);
    expect(pozycja()).toHaveTextContent("0:00");
    expect(pozycja().textContent).not.toMatch(/NaN/);
  });

  it("position_seconds = null (odpowiedź serwera bez wartości)", () => {
    render(
      <VideoPlayer
        durationSeconds={200}
        initialPositionSeconds={null as unknown as number}
      />,
    );
    expect(pozycja()).toHaveTextContent("0:00");
    expect(pozycja().textContent).not.toMatch(/NaN/);
  });

  it("position_seconds = undefined (prop pominięty)", () => {
    render(<VideoPlayer durationSeconds={200} />);
    expect(pozycja()).toHaveTextContent("0:00");
    expect(pozycja().textContent).not.toMatch(/NaN/);
  });
});

describe("pozycja startowa czytana tylko przy montażu", () => {
  it("zmiana initialPositionSeconds po montażu nie przesuwa już trwającego odtwarzania", () => {
    const { rerender } = render(
      <VideoPlayer durationSeconds={100} initialPositionSeconds={10} />,
    );
    expect(pozycja()).toHaveTextContent("0:10");

    fireEvent.change(suwak(), { target: { value: "50" } });
    expect(pozycja()).toHaveTextContent("0:50");

    rerender(<VideoPlayer durationSeconds={100} initialPositionSeconds={90} />);

    expect(pozycja()).toHaveTextContent("0:50");
  });
});
