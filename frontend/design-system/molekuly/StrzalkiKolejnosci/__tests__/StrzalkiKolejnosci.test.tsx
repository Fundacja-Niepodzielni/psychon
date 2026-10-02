import { useRef, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrzalkiKolejnosci } from "../StrzalkiKolejnosci";
import { CZAS_RUCHU_MS, useRuchWierszy } from "../ruch";
import { zdanieRuchuGrupy, zdanieRuchuMiedzyGrupami, zdanieRuchuWiersza } from "../zdania";

/**
 * Próby molekuły kolejności: nazwy i stan strzałek, fokus na tej samej
 * strzałce po zamianie (także gdy wiersz zostaje przemontowany w innej grupie),
 * zdania dla czytnika oraz ruch wierszy (przekształcenie CSS z położeń przed i
 * po, 200 ms, brak ruchu przy „ogranicz ruch” i przy zmianie bez zapowiedzi).
 * Położeń w jsdom nie ma, więc próba podstawia je z kolejności w DOM.
 */

const WYSOKOSC_WIERSZA = 40;

interface Grupa {
  id: string;
  tytul: string;
  wiersze: string[];
}

const START: Grupa[] = [
  { id: "g1", tytul: "Wprowadzenie", wiersze: ["Alfa", "Beta", "Gamma"] },
  { id: "g2", tytul: "Praktyka", wiersze: ["Delta"] },
];

function Lista({ zPrzyciskiemOdwrotu = false }: { zPrzyciskiemOdwrotu?: boolean }) {
  const [stan, ustaw] = useState<Grupa[]>(START);
  const [zdanie, ustawZdanie] = useState("");
  const korzen = useRef<HTMLDivElement>(null);
  useRuchWierszy(korzen);

  function przenies(indeksGrupy: number, indeks: number, kierunek: -1 | 1) {
    const kopia = stan.map((grupa) => ({ ...grupa, wiersze: [...grupa.wiersze] }));
    const zrodlo = kopia[indeksGrupy];
    const [wiersz] = zrodlo.wiersze.splice(indeks, 1);
    const cel = indeks + kierunek;
    if (cel >= 0 && cel <= zrodlo.wiersze.length) {
      zrodlo.wiersze.splice(cel, 0, wiersz);
      ustawZdanie(zdanieRuchuWiersza(wiersz, cel + 1, zrodlo.wiersze.length));
    } else {
      const sasiad = kopia[indeksGrupy + kierunek];
      const miejsce = kierunek === -1 ? sasiad.wiersze.length : 0;
      sasiad.wiersze.splice(miejsce, 0, wiersz);
      ustawZdanie(zdanieRuchuMiedzyGrupami(wiersz, sasiad.tytul, miejsce + 1, sasiad.wiersze.length));
    }
    ustaw(kopia);
  }

  return (
    <div ref={korzen} data-testid="korzen">
      {stan.map((grupa, ig) => (
        <section key={grupa.id} data-ruch-klucz={`grupa-${grupa.id}`}>
          <h3>{grupa.tytul}</h3>
          <ol>
            {grupa.wiersze.map((wiersz, i) => (
              <li key={wiersz} data-ruch-klucz={`wiersz-${wiersz}`}>
                <StrzalkiKolejnosci
                  tytul={wiersz}
                  mozeWyzej={ig > 0 || i > 0}
                  mozeNizej={ig < stan.length - 1 || i < grupa.wiersze.length - 1}
                  onWyzej={() => przenies(ig, i, -1)}
                  onNizej={() => przenies(ig, i, 1)}
                />
                <span>{wiersz}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {zPrzyciskiemOdwrotu && (
        <button
          type="button"
          onClick={() => ustaw((poprzednio) => poprzednio.map((g) => ({ ...g, wiersze: [...g.wiersze].reverse() })))}
        >
          Odwróć bez zapowiedzi
        </button>
      )}
      <p role="status" aria-live="polite" data-ogloszenia>
        {zdanie}
      </p>
    </div>
  );
}

function kolejnosc(): string[] {
  return Array.from(document.querySelectorAll("li span:last-child")).map((el) => el.textContent ?? "");
}

function strzalka(tytul: string, kierunek: "wyżej" | "niżej") {
  return screen.getByRole("button", { name: `Przenieś „${tytul}” ${kierunek}` });
}

/** Położenie z kolejności w DOM: wiersz i grupa wg indeksu wśród elementów kluczowanych. */
function podstawPolozenia() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    let y = 0;
    if (this.hasAttribute("data-ruch-klucz")) {
      y = Array.from(document.querySelectorAll("[data-ruch-klucz]")).indexOf(this) * WYSOKOSC_WIERSZA;
    }
    return { x: 0, y, left: 0, top: y, right: 100, bottom: y + WYSOKOSC_WIERSZA, width: 100, height: WYSOKOSC_WIERSZA } as DOMRect;
  });
}

function ograniczRuch(wlaczone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (zapytanie: string) => ({
      matches: wlaczone && zapytanie.includes("prefers-reduced-motion"),
      media: zapytanie,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

/** Zbiera przekształcenia, które wiersze dostały w trakcie działania (z poprzednich wartości atrybutu `style`). */
function nasluchujPrzeksztalcen(korzen: HTMLElement) {
  const zebrane: string[] = [];
  const dodaj = (rekordy: MutationRecord[]) => {
    for (const rekord of rekordy) {
      const znalezione = (rekord.oldValue ?? "").match(/translate\([^)]*\)/g);
      if (znalezione) zebrane.push(...znalezione);
    }
  };
  const obserwator = new MutationObserver(dodaj);
  obserwator.observe(korzen, { attributes: true, attributeFilter: ["style"], attributeOldValue: true, subtree: true });
  return {
    pobierz: () => {
      dodaj(obserwator.takeRecords());
      return zebrane;
    },
    zakoncz: () => obserwator.disconnect(),
  };
}

beforeEach(() => {
  ograniczRuch(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StrzalkiKolejnosci — nazwy i stan", () => {
  it("dwie strzałki z nazwą niosącą tytuł wiersza, jedna pod drugą, bez atrybutu disabled", () => {
    render(<Lista />);
    const wyzej = strzalka("Beta", "wyżej");
    const nizej = strzalka("Beta", "niżej");
    expect(wyzej.tagName).toBe("BUTTON");
    expect(wyzej).toHaveAttribute("type", "button");
    expect(wyzej).not.toBeDisabled();
    expect(nizej).not.toBeDisabled();
    expect(wyzej).not.toHaveAttribute("aria-disabled");
    expect(wyzej.compareDocumentPosition(nizej) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wyzej.parentElement).toBe(nizej.parentElement);
  });

  it("strzałki stoją w wierszu przed tytułem", () => {
    render(<Lista />);
    const wiersz = strzalka("Beta", "wyżej").closest("li")!;
    expect(wiersz.firstElementChild!.contains(strzalka("Beta", "wyżej"))).toBe(true);
    expect(wiersz.lastElementChild!.textContent).toBe("Beta");
  });

  it("skrajne strzałki mają aria-disabled=true, zostają w kolejności fokusu i nic nie wołają", async () => {
    const onWyzej = vi.fn();
    const onNizej = vi.fn();
    render(<StrzalkiKolejnosci tytul="Jedyna" mozeWyzej={false} mozeNizej={false} onWyzej={onWyzej} onNizej={onNizej} />);
    const wyzej = strzalka("Jedyna", "wyżej");
    const nizej = strzalka("Jedyna", "niżej");
    for (const przycisk of [wyzej, nizej]) {
      expect(przycisk).toHaveAttribute("aria-disabled", "true");
      expect(przycisk).not.toBeDisabled();
      expect(przycisk.tabIndex).toBe(0);
    }
    await userEvent.tab();
    expect(wyzej).toHaveFocus();
    await userEvent.tab();
    expect(nizej).toHaveFocus();
    await userEvent.click(wyzej);
    await userEvent.click(nizej);
    expect(onWyzej).not.toHaveBeenCalled();
    expect(onNizej).not.toHaveBeenCalled();
  });

  it("czynna strzałka woła tylko swoje wywołanie", async () => {
    const onWyzej = vi.fn();
    const onNizej = vi.fn();
    render(<StrzalkiKolejnosci tytul="Wiersz" mozeWyzej mozeNizej onWyzej={onWyzej} onNizej={onNizej} />);
    await userEvent.click(strzalka("Wiersz", "niżej"));
    expect(onNizej).toHaveBeenCalledTimes(1);
    expect(onWyzej).not.toHaveBeenCalled();
  });
});

describe("StrzalkiKolejnosci — zamiana wierszy i fokus", () => {
  it("klik zmienia kolejność, a fokus zostaje na tej samej strzałce przeniesionego wiersza", async () => {
    render(<Lista />);
    await userEvent.click(strzalka("Beta", "wyżej"));
    expect(kolejnosc()).toEqual(["Beta", "Alfa", "Gamma", "Delta"]);
    expect(strzalka("Beta", "wyżej")).toHaveFocus();
  });

  it("wiersz doszedł do brzegu: fokus zostaje na tej samej, teraz wyłączonej strzałce", async () => {
    render(<Lista />);
    await userEvent.click(strzalka("Beta", "wyżej"));
    await userEvent.click(strzalka("Beta", "wyżej"));
    const wyzej = strzalka("Beta", "wyżej");
    expect(wyzej).toHaveAttribute("aria-disabled", "true");
    expect(wyzej).toHaveFocus();
    expect(kolejnosc()).toEqual(["Beta", "Alfa", "Gamma", "Delta"]);
  });

  it("przejście do innego tematu przemontowuje wiersz, a fokus wraca na tę samą strzałkę", async () => {
    render(<Lista />);
    const stara = strzalka("Gamma", "niżej");
    await userEvent.click(stara);
    expect(stara.isConnected).toBe(false);
    expect(strzalka("Gamma", "niżej")).toHaveFocus();
    expect(document.querySelectorAll("section")[1].textContent).toContain("Gamma");
  });

  it("strzałka „wyżej” po przejściu między tematami też odzyskuje fokus", async () => {
    render(<Lista />);
    await userEvent.click(strzalka("Delta", "wyżej"));
    expect(strzalka("Delta", "wyżej")).toHaveFocus();
  });
});

describe("StrzalkiKolejnosci — zdania dla czytnika", () => {
  it("w obrębie listy: „Przeniesiono „…” na miejsce 2 z 3.”", async () => {
    render(<Lista />);
    await userEvent.click(strzalka("Alfa", "niżej"));
    expect(screen.getByRole("status")).toHaveTextContent("Przeniesiono „Alfa” na miejsce 2 z 3.");
  });

  it("między grupami zdanie niesie nazwę tematu docelowego i miejsce w nim", async () => {
    render(<Lista />);
    await userEvent.click(strzalka("Gamma", "niżej"));
    expect(screen.getByRole("status")).toHaveTextContent("Przeniesiono „Gamma” do tematu „Praktyka”, miejsce 1 z 2.");
  });

  it("obszar ma aria-live=polite, więc nie przerywa czytnikowi", () => {
    render(<Lista />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("składanie zdań: wiersz, przejście między grupami, temat", () => {
    expect(zdanieRuchuWiersza("Wywiad", 2, 3)).toBe("Przeniesiono „Wywiad” na miejsce 2 z 3.");
    expect(zdanieRuchuMiedzyGrupami("Wywiad", "Praktyka", 1, 4)).toBe("Przeniesiono „Wywiad” do tematu „Praktyka”, miejsce 1 z 4.");
    expect(zdanieRuchuGrupy("Praktyka", 2, 3)).toBe("Przeniesiono temat „Praktyka” na miejsce 2 z 3.");
  });
});

describe("StrzalkiKolejnosci — ruch wierszy", () => {
  it("zamiana dwóch wierszy: każdy leci ze starego miejsca (±40 px) przejściem 200 ms", async () => {
    podstawPolozenia();
    render(<Lista />);
    const podglad = nasluchujPrzeksztalcen(screen.getByTestId("korzen"));
    await userEvent.click(strzalka("Beta", "wyżej"));
    const przeksztalcenia = podglad.pobierz();
    podglad.zakoncz();

    expect(przeksztalcenia).toContain("translate(0px, 40px)"); // Beta: była niżej
    expect(przeksztalcenia).toContain("translate(0px, -40px)"); // Alfa: była wyżej
    const beta = strzalka("Beta", "wyżej").closest("li") as HTMLElement;
    expect(beta.style.transition).toBe("transform 200ms ease");
    expect(beta.style.transform).toBe("");
    expect(CZAS_RUCHU_MS).toBe(200);
  });

  it("po zakończeniu przejścia wiersz nie nosi śladu stylu przejścia", async () => {
    podstawPolozenia();
    render(<Lista />);
    await userEvent.click(strzalka("Beta", "wyżej"));
    const beta = strzalka("Beta", "wyżej").closest("li") as HTMLElement;
    act(() => {
      beta.dispatchEvent(new Event("transitionend"));
    });
    expect(beta.style.transition).toBe("");
  });

  it("„ogranicz ruch”: zamiana natychmiastowa, żaden wiersz nie dostaje przekształcenia ani przejścia", async () => {
    ograniczRuch(true);
    podstawPolozenia();
    render(<Lista />);
    const podglad = nasluchujPrzeksztalcen(screen.getByTestId("korzen"));
    await userEvent.click(strzalka("Beta", "wyżej"));
    expect(podglad.pobierz()).toEqual([]);
    podglad.zakoncz();
    expect(kolejnosc()).toEqual(["Beta", "Alfa", "Gamma", "Delta"]);
    for (const wiersz of document.querySelectorAll<HTMLElement>("li")) {
      expect(wiersz.style.transition).toBe("");
      expect(wiersz.style.transform).toBe("");
    }
    expect(strzalka("Beta", "wyżej")).toHaveFocus();
  });

  it("zmiana kolejności bez zapowiedzi (powrót po odmowie zapisu) odbywa się bez ruchu", async () => {
    podstawPolozenia();
    render(<Lista zPrzyciskiemOdwrotu />);
    const podglad = nasluchujPrzeksztalcen(screen.getByTestId("korzen"));
    await userEvent.click(screen.getByRole("button", { name: "Odwróć bez zapowiedzi" }));
    expect(kolejnosc()).toEqual(["Gamma", "Beta", "Alfa", "Delta"]);
    expect(podglad.pobierz()).toEqual([]);
    podglad.zakoncz();
    for (const wiersz of document.querySelectorAll<HTMLElement>("li")) expect(wiersz.style.transition).toBe("");
  });

  it("kliknięcie wyłączonej strzałki niczego nie zapowiada: późniejsza zmiana bez zapowiedzi nie rusza wierszy", async () => {
    podstawPolozenia();
    render(<Lista zPrzyciskiemOdwrotu />);
    await userEvent.click(strzalka("Alfa", "wyżej"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const podglad = nasluchujPrzeksztalcen(screen.getByTestId("korzen"));
    await userEvent.click(screen.getByRole("button", { name: "Odwróć bez zapowiedzi" }));
    expect(podglad.pobierz()).toEqual([]);
    podglad.zakoncz();
  });

  it("ruch jest lokalny: kolejność w DOM zmienia się od razu po kliknięciu, bez żadnego oczekiwania", async () => {
    podstawPolozenia();
    render(<Lista />);
    await userEvent.click(strzalka("Alfa", "niżej"));
    expect(kolejnosc().slice(0, 2)).toEqual(["Beta", "Alfa"]);
  });
});
