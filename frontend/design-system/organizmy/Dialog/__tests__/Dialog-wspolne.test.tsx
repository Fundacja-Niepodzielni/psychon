import { readFileSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, oglosWPanelu } from "../Dialog";
import { ATRYBUT_OBSZARU, OPOZNIENIE_OGLOSZENIA_MS } from "../obszarOgloszen";
import { OSTRZEZENIE_ZAGNIEZDZENIA, liczbaOtwartychOkien } from "../stosOkien";
import { Field } from "../../../molekuly/Field/Field";
import { wywolajResizeObserver } from "../../../../__tests__/setup";

/**
 * Wzmocnienia wspólne dla obu wariantów okna: natywny `<dialog>` otwierany
 * modalnie, blokada przewijania strony, opis przez `aria-describedby`, układ
 * (środek przewijany, przyciski zawsze widoczne, pełny ekran poniżej 600 px,
 * klawiatura telefonu), Escape na liście pola wyboru, okno w oknie, fokus po
 * zamknięciu na element zastępczy i stały obszar ogłoszeń.
 */

function Potwierdzenie({ onWycofaj = () => {}, tytul = "Usunąć wpis?" }: { onWycofaj?: () => void; tytul?: string }) {
  return (
    <Dialog tytul={tytul} etykietaWycofania="Anuluj" etykietaPotwierdzenia="Usuń" onWycofaj={onWycofaj} onPotwierdz={() => {}}>
      Tej operacji nie można cofnąć.
    </Dialog>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("natywne okno modalne i blokada przewijania", () => {
  it("okno jest elementem `<dialog>` otwieranym przez showModal(), gdy przeglądarka go zna", () => {
    const pokaz = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const prototyp = HTMLDialogElement.prototype as unknown as { showModal?: () => void };
    const poprzednie = prototyp.showModal;
    prototyp.showModal = pokaz;
    try {
      render(<Potwierdzenie />);
      const okno = screen.getByRole("dialog", { name: "Usunąć wpis?" });
      expect(okno.tagName).toBe("DIALOG");
      expect(pokaz).toHaveBeenCalledTimes(1);
      expect(okno).toHaveAttribute("aria-modal", "true");
    } finally {
      prototyp.showModal = poprzednie;
    }
  });

  it("bez showModal() okno dostaje atrybut `open` i ten sam układ", () => {
    render(<Potwierdzenie />);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("strona pod otwartym oknem się nie przewija; po zamknięciu wraca poprzednia wartość", () => {
    document.documentElement.style.overflow = "clip";
    const { unmount } = render(<Potwierdzenie />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("clip");
    document.documentElement.style.overflow = "";
  });
});

describe("opis okna (aria-describedby)", () => {
  it("potwierdzenie: treść okna jest jego opisem dostępnym", () => {
    render(<Potwierdzenie />);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Tej operacji nie można cofnąć.");
  });

  it("formularz bez opisu nie czyta wszystkich pól jako opisu", () => {
    render(
      <Dialog wariant="formularz" tytul="Nowy temat" etykietaWycofania="Anuluj" etykietaPotwierdzenia="Dodaj" onWycofaj={() => {}} onPotwierdz={() => {}}>
        <Field id="opis-pole" etykieta="Nazwa tematu" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });
});

describe("układ: środek przewijany, przyciski zawsze widoczne", () => {
  const css = readFileSync(path.join(process.cwd(), "design-system/organizmy/Dialog/Dialog.module.css"), "utf8");
  const regula = (selektor: string, zrodlo = css) => {
    const poczatek = zrodlo.indexOf(`${selektor} {`);
    expect(poczatek, selektor).toBeGreaterThanOrEqual(0);
    return zrodlo.slice(poczatek, zrodlo.indexOf("}", poczatek));
  };

  it("nagłówek, środek i stopka są osobnymi pasami; przewija się wyłącznie środek", () => {
    render(<Potwierdzenie />);
    const okno = screen.getByRole("dialog");
    const ramka = okno.firstElementChild as HTMLElement;
    expect(ramka.children).toHaveLength(3);
    expect(within(ramka.children[0] as HTMLElement).getByRole("heading", { name: "Usunąć wpis?" })).toBeInTheDocument();
    expect(within(ramka.children[2] as HTMLElement).getByRole("button", { name: "Usuń" })).toBeInTheDocument();

    expect(regula(".srodek")).toMatch(/overflow-y: auto/);
    expect(regula(".srodek")).toMatch(/min-height: 0/);
    expect(regula(".glowa")).toMatch(/flex: none/);
    expect(regula(".stopka")).toMatch(/flex: none/);
  });

  it("szerzej niż 600 px okno ma ograniczoną wysokość względem ekranu (także przy powiększeniu)", () => {
    expect(regula(".okno")).toMatch(/max-height: min\(720px, calc\(100dvh - 32px\)\)/);
  });

  it("poniżej 600 px okno wypełnia ekran — a przy klawiaturze telefonu jego widoczną część", () => {
    const zapytanie = css.slice(css.indexOf("@media (max-width: 599.98px)"));
    const waski = regula(".okno[data-wariant=\"formularz\"]", zapytanie);
    expect(waski).toMatch(/width: 100%/);
    expect(waski).toMatch(/height: var\(--wysokosc-widoku, 100dvh\)/);
    expect(waski).toMatch(/max-height: none/);
    expect(waski).toMatch(/border-radius: 0/);
  });

  it("zmiana widocznej części ekranu (klawiatura telefonu) ustawia wysokość okna i dosuwa pole z fokusem", () => {
    const widok = Object.assign(new EventTarget(), { height: 640, offsetTop: 0 });
    const poprzedniWidok = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", { value: widok, configurable: true });
    const dosun = vi.fn();
    const prototyp = HTMLElement.prototype as unknown as { scrollIntoView?: () => void };
    const poprzednie = prototyp.scrollIntoView;
    prototyp.scrollIntoView = dosun;
    try {
      render(
        <Dialog wariant="formularz" tytul="Powód" etykietaWycofania="Anuluj" etykietaPotwierdzenia="Zapisz" onWycofaj={() => {}} onPotwierdz={() => {}}>
          <Field id="widok-pole" etykieta="Powód" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
        </Dialog>,
      );
      const okno = screen.getByRole("dialog");
      expect(okno.style.getPropertyValue("--wysokosc-widoku")).toBe("640px");
      dosun.mockClear();

      act(() => {
        Object.assign(widok, { height: 320, offsetTop: 40 });
        widok.dispatchEvent(new Event("resize"));
      });
      expect(okno.style.getPropertyValue("--wysokosc-widoku")).toBe("320px");
      expect(okno.style.getPropertyValue("--przesuniecie-widoku")).toBe("40px");
      expect(dosun).toHaveBeenCalled();
      expect(dosun.mock.contexts.at(-1)).toBe(screen.getByRole("textbox", { name: "Powód" }));
    } finally {
      prototyp.scrollIntoView = poprzednie;
      if (poprzedniWidok) Object.defineProperty(window, "visualViewport", poprzedniWidok);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    }
  });

  it("środek, który się przewija, jest osiągalny klawiaturą i oddzielony kreską od przycisków", () => {
    const wysokosc = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    const widoczna = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
    render(<Potwierdzenie />);
    const okno = screen.getByRole("dialog");
    const srodek = screen.getByRole("region", { name: "Usunąć wpis?" });
    expect(srodek).toHaveAttribute("tabindex", "0");
    expect(okno).toHaveAttribute("data-przewijany");
    expect(regula(".okno[data-przewijany] .stopka")).toBeDefined();
    expect(css).toMatch(/\.okno\[data-przewijany\] \.stopka \{\s*border-top/);

    wysokosc.mockReturnValue(300);
    wywolajResizeObserver(srodek);
    expect(okno).not.toHaveAttribute("data-przewijany");
    expect(screen.queryByRole("region")).toBeNull();
    widoczna.mockRestore();
  });

  it("fokus na polu w środku dosuwa to pole do widoku", async () => {
    const dosun = vi.fn();
    const prototyp = HTMLElement.prototype as unknown as { scrollIntoView?: () => void };
    const poprzednie = prototyp.scrollIntoView;
    prototyp.scrollIntoView = dosun;
    try {
      render(
        <Dialog wariant="formularz" tytul="Dwa pola" etykietaWycofania="Anuluj" etykietaPotwierdzenia="Zapisz" onWycofaj={() => {}} onPotwierdz={() => {}}>
          <Field id="pole-a" etykieta="Pierwsze" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
          <Field id="pole-b" etykieta="Drugie" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
        </Dialog>,
      );
      dosun.mockClear();
      await userEvent.tab();
      expect(dosun.mock.contexts).toContain(screen.getByRole("textbox", { name: "Drugie" }));
    } finally {
      prototyp.scrollIntoView = poprzednie;
    }
  });
});

describe("Escape na liście pola wyboru w oknie", () => {
  it("pierwszy Escape zamyka tylko listę, drugi dociera do okna", async () => {
    const onWycofaj = vi.fn();
    render(
      <Dialog wariant="formularz" tytul="Grupa" etykietaWycofania="Anuluj" etykietaPotwierdzenia="Zapisz" onWycofaj={onWycofaj} onPotwierdz={() => {}}>
        <Field
          id="okno-wybor"
          etykieta="Grupa produktowa"
          rodzaj="wybor"
          opcje={[
            { wartosc: "psychon", etykieta: "PsychON" },
            { wartosc: "dobrostan", etykieta: "Dobrostan" },
          ]}
          wartosc="psychon"
          onZmiana={() => {}}
        />
      </Dialog>,
    );
    const wybor = screen.getByRole("combobox");
    expect(wybor).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(wybor).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");
    expect(wybor).toHaveAttribute("aria-expanded", "false");
    expect(onWycofaj).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });
});

describe("okno w oknie", () => {
  it("drugie okno otwarte na pierwszym ostrzega w konsoli trybu deweloperskiego", () => {
    const ostrzezenie = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <>
        <Potwierdzenie tytul="Pierwsze" />
        <Potwierdzenie tytul="Drugie" />
      </>,
    );
    expect(ostrzezenie).toHaveBeenCalledWith(OSTRZEZENIE_ZAGNIEZDZENIA);
  });

  it("jedno okno nie ostrzega", () => {
    const ostrzezenie = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<Potwierdzenie />);
    expect(ostrzezenie).not.toHaveBeenCalled();
  });

  it("klawisze dostaje wyłącznie okno na wierzchu: Escape zamyka tylko drugie", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pierwsze = vi.fn();
    const drugie = vi.fn();
    render(
      <>
        <Potwierdzenie tytul="Pierwsze" onWycofaj={pierwsze} />
        <Potwierdzenie tytul="Drugie" onWycofaj={drugie} />
      </>,
    );
    await userEvent.keyboard("{Escape}");
    expect(drugie).toHaveBeenCalledTimes(1);
    expect(pierwsze).not.toHaveBeenCalled();
  });

  it("zamknięte okna schodzą ze stosu", () => {
    const { unmount } = render(<Potwierdzenie />);
    expect(liczbaOtwartychOkien()).toBe(1);
    unmount();
    expect(liczbaOtwartychOkien()).toBe(0);
  });
});

describe("fokus po zamknięciu", () => {
  function Sekcja({ celZastepczy }: { celZastepczy: "id" | "funkcja" | "brak" }) {
    const [otwarte, setOtwarte] = useState(false);
    const [zrobione, setZrobione] = useState(false);
    const fokusPoZamknieciu =
      celZastepczy === "id"
        ? "sekcja-naglowek"
        : celZastepczy === "funkcja"
          ? () => document.getElementById("sekcja-naglowek")
          : undefined;
    return (
      <section>
        <h2 id="sekcja-naglowek" tabIndex={-1}>
          Warsztat
        </h2>
        {!zrobione && <button onClick={() => setOtwarte(true)}>Zaznacz</button>}
        {zrobione && <p>Zaliczony.</p>}
        {otwarte && (
          <Dialog
            tytul="Zaznaczyć?"
            etykietaWycofania="Anuluj"
            etykietaPotwierdzenia="Zaznacz jako zaliczony"
            onWycofaj={() => setOtwarte(false)}
            onPotwierdz={() => {
              setOtwarte(false);
              setZrobione(true);
            }}
            fokusPoZamknieciu={fokusPoZamknieciu}
          >
            Pytanie.
          </Dialog>
        )}
      </section>
    );
  }

  it.each(["id", "funkcja"] as const)("przycisk wołający zniknął — fokus idzie na element wskazany przez wywołującego (%s)", async (rodzaj) => {
    render(<Sekcja celZastepczy={rodzaj} />);
    await userEvent.click(screen.getByRole("button", { name: "Zaznacz" }));
    await userEvent.click(screen.getByRole("button", { name: "Zaznacz jako zaliczony" }));
    expect(screen.queryByRole("button", { name: "Zaznacz" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Warsztat" })).toHaveFocus();
  });

  it("przycisk wołający nadal jest — fokus wraca do niego, nie na element zastępczy", async () => {
    render(<Sekcja celZastepczy="id" />);
    const przycisk = screen.getByRole("button", { name: "Zaznacz" });
    await userEvent.click(przycisk);
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(przycisk).toHaveFocus();
  });

  it("przycisk wołający zablokowany w chwili zamknięcia — fokus idzie na element zastępczy", async () => {
    function Zablokowany() {
      const [otwarte, setOtwarte] = useState(false);
      const [trwa, setTrwa] = useState(false);
      return (
        <>
          <h2 id="naglowek-trwa" tabIndex={-1}>
            Sekcja
          </h2>
          <button disabled={trwa} onClick={() => setOtwarte(true)}>
            Otwórz
          </button>
          {otwarte && (
            <Dialog
              tytul="Potwierdź"
              etykietaWycofania="Anuluj"
              etykietaPotwierdzenia="Tak"
              onWycofaj={() => setOtwarte(false)}
              onPotwierdz={() => {
                setOtwarte(false);
                setTrwa(true);
              }}
              fokusPoZamknieciu="naglowek-trwa"
            >
              Pytanie.
            </Dialog>
          )}
        </>
      );
    }
    render(<Zablokowany />);
    await userEvent.click(screen.getByRole("button", { name: "Otwórz" }));
    await userEvent.click(screen.getByRole("button", { name: "Tak" }));
    expect(screen.getByRole("heading", { name: "Sekcja" })).toHaveFocus();
  });
});

describe("stały obszar ogłoszeń panelu", () => {
  const obszar = () => document.querySelector<HTMLElement>(`[${ATRYBUT_OBSZARU}]`);

  it("powstaje przy otwarciu okna — przed jakimkolwiek ogłoszeniem — i zostaje po zamknięciu", () => {
    obszar()?.remove();
    const { unmount } = render(<Potwierdzenie />);
    const element = obszar();
    expect(element).not.toBeNull();
    expect(element).toHaveAttribute("aria-live", "polite");
    expect(element).toHaveAttribute("aria-atomic", "true");
    expect(element).not.toHaveAttribute("role");
    expect(element?.parentElement).toBe(document.body);
    unmount();
    expect(obszar()).toBe(element);
  });

  it("ogłoszenie trafia do tego samego elementu, a nie do nowego", async () => {
    render(<Potwierdzenie />);
    const element = obszar();
    oglosWPanelu("Zapisano zmiany.");
    expect(element).toHaveTextContent("");
    await waitFor(() => expect(element).toHaveTextContent("Zapisano zmiany."));
    expect(document.querySelectorAll(`[${ATRYBUT_OBSZARU}]`)).toHaveLength(1);
    expect(OPOZNIENIE_OGLOSZENIA_MS).toBeGreaterThan(0);
  });

  it("to samo zdanie drugi raz jest ogłaszane ponownie (obszar najpierw pustoszeje)", async () => {
    render(<Potwierdzenie />);
    const element = obszar() as HTMLElement;
    oglosWPanelu("Zapisano zmiany.");
    await waitFor(() => expect(element).toHaveTextContent("Zapisano zmiany."));
    oglosWPanelu("Zapisano zmiany.");
    expect(element).toHaveTextContent("");
    await waitFor(() => expect(element).toHaveTextContent("Zapisano zmiany."));
  });

  it("ogłoszenie bez otwartego okna zakłada obszar samo", async () => {
    obszar()?.remove();
    oglosWPanelu("Data zmieniona.");
    await waitFor(() => expect(obszar()).toHaveTextContent("Data zmieniona."));
  });
});
