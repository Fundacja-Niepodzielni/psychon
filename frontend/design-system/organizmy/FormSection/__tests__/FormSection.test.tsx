import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormSection, type PoleFormSection } from "../FormSection";

function pole(nadpisania: Partial<PoleFormSection> = {}): PoleFormSection {
  return {
    id: "imie",
    etykieta: "Imię",
    rodzaj: "tekst",
    wartosc: "",
    onZmiana: () => {},
    ...nadpisania,
  };
}

describe("FormSection", () => {
  it("renderuje maksymalnie pięć pól na pierwszym poziomie, resztę pod rozwinięciem", () => {
    const pola = Array.from({ length: 7 }, (_, indeks) => pole({ id: `pole-${indeks}`, etykieta: `Pole ${indeks}` }));
    render(
      <FormSection
        tytul="Dane osoby"
        pola={pola}
        tytulDodatkowych="Więcej danych"
        onAnuluj={() => {}}
        onZapisz={() => {}}
      />,
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Więcej danych (2)" })).toBeInTheDocument();
  });

  it("podsumowanie błędów pokazuje wyłącznie pola z błędem, z odnośnikiem do każdego", () => {
    const pola = [
      pole({ id: "imie", etykieta: "Imię", blad: "Podaj imię" }),
      pole({ id: "email", etykieta: "E-mail" }),
    ];
    render(<FormSection tytul="Dane osoby" pola={pola} onAnuluj={() => {}} onZapisz={() => {}} />);
    // Dwa `role="alert"` w drzewie: podsumowanie `Notice` (pierwsze w DOM,
    // renderowane przed polami) i `ErrorText` PRZY samym polu „Imię” — oba
    // poprawne naraz (podsumowanie z odnośnikami razem z błędem przy
    // polu), stąd wybór PIERWSZEGO zamiast jednoznacznego `getByRole`.
    const [podsumowanie] = screen.getAllByRole("alert");
    expect(podsumowanie).toHaveTextContent("Imię");
    expect(podsumowanie).not.toHaveTextContent("E-mail");
    expect(screen.getByRole("link", { name: "Imię" })).toHaveAttribute("href", "#imie");
  });

  it("Zapisz ma ramkę i tło, Anuluj żadnego z nich — inna klasa", () => {
    render(
      <FormSection tytul="Dane osoby" pola={[pole()]} onAnuluj={() => {}} onZapisz={() => {}} />,
    );
    const zapisz = screen.getByRole("button", { name: "Zapisz zmiany" });
    const anuluj = screen.getByRole("button", { name: "Anuluj" });
    expect(zapisz.className).not.toBe(anuluj.className);
  });

  it("Zapisz zmiany woła onZapisz, Anuluj woła onAnuluj", async () => {
    const onZapisz = vi.fn();
    const onAnuluj = vi.fn();
    render(<FormSection tytul="Dane osoby" pola={[pole()]} onAnuluj={onAnuluj} onZapisz={onZapisz} />);
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    expect(onZapisz).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onAnuluj).toHaveBeenCalledTimes(1);
  });

  it("z fokusPrzyOtwarciu fokus startowy ląduje na pierwszym polu, gdy nie ma błędów", () => {
    render(
      <FormSection
        tytul="Dane osoby"
        pola={[pole()]}
        fokusPrzyOtwarciu
        onAnuluj={() => {}}
        onZapisz={() => {}}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Imię" })).toHaveFocus();
  });

  it("bez fokusPrzyOtwarciu fokus po zamontowaniu się nie rusza — zostaje na elemencie aktywnym przed montowaniem", () => {
    const poprzedni = document.activeElement;
    render(<FormSection tytul="Dane osoby" pola={[pole()]} onAnuluj={() => {}} onZapisz={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Imię" })).not.toHaveFocus();
    expect(document.activeElement).toBe(poprzedni);
    expect(document.activeElement).toBe(document.body);
  });

  it("bez fokusPrzyOtwarciu fokus zostaje tam, gdzie był, także gdy ma go inny element", () => {
    function Rodzic() {
      return (
        <>
          <button>Wcześniejszy</button>
          <FormSection tytul="Dane osoby" pola={[pole()]} onAnuluj={() => {}} onZapisz={() => {}} />
        </>
      );
    }
    const { unmount } = render(<Rodzic />);
    expect(screen.getByRole("textbox", { name: "Imię" })).not.toHaveFocus();
    expect(screen.getByRole("form", { name: "Dane osoby" }).contains(document.activeElement)).toBe(false);
    unmount();
  });

  it("fokus startowy ląduje na podsumowaniu błędów, gdy błędy są obecne przy montowaniu", () => {
    render(
      <FormSection
        tytul="Dane osoby"
        pola={[pole({ blad: "Podaj imię" })]}
        fokusPrzyOtwarciu
        onAnuluj={() => {}}
        onZapisz={() => {}}
      />,
    );
    const [podsumowanie] = screen.getAllByRole("alert");
    expect(podsumowanie).toHaveFocus();
  });

  it("podsumowanie błędów obecne przy montowaniu dostaje fokus także bez fokusPrzyOtwarciu", () => {
    render(
      <FormSection
        tytul="Dane osoby"
        pola={[pole({ blad: "Podaj imię" })]}
        onAnuluj={() => {}}
        onZapisz={() => {}}
      />,
    );
    const [podsumowanie] = screen.getAllByRole("alert");
    expect(podsumowanie).toHaveFocus();
  });

  it("blad w polu poza pierwszym poziomem rozwija sekcje dodatkowa, odnosnik trafia do istniejacego elementu", () => {
    const pola = [
      ...Array.from({ length: 5 }, (_, indeks) => pole({ id: `pole-${indeks}`, etykieta: `Pole ${indeks}` })),
      pole({ id: "pole-5", etykieta: "Pole 5" }),
      pole({ id: "pole-6", etykieta: "Pole 6", blad: "Uzupelnij pole" }),
    ];
    render(
      <FormSection
        tytul="Dane osoby"
        pola={pola}
        tytulDodatkowych="Wiecej danych"
        onAnuluj={() => {}}
        onZapisz={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Wiecej danych/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Pole 6" })).toHaveAttribute("href", "#pole-6");
    expect(document.getElementById("pole-6")).not.toBeNull();
  });

  it("blad w polu dodatkowym przekazany po montowaniu rozwija sekcje, komunikat widoczny, pole osiagalne", async () => {
    function Rodzic() {
      const [blad, setBlad] = useState<string | undefined>(undefined);
      const pola = [
        ...Array.from({ length: 5 }, (_, indeks) => pole({ id: `pole-${indeks}`, etykieta: `Pole ${indeks}` })),
        pole({ id: "pole-5", etykieta: "Pole 5", blad }),
      ];
      return (
        <FormSection
          tytul="Dane osoby"
          pola={pola}
          tytulDodatkowych="Wiecej danych"
          onAnuluj={() => {}}
          onZapisz={() => setBlad("Uzupelnij pole")}
        />
      );
    }
    render(<Rodzic />);
    const naglowek = screen.getByRole("button", { name: /Wiecej danych/ });
    expect(naglowek).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(naglowek);
    await userEvent.click(naglowek);
    expect(naglowek).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("pole-5")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    expect(screen.getByRole("button", { name: /Wiecej danych/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Uzupelnij pole").length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "Pole 5" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Pole 5" })).toHaveAttribute("href", "#pole-5");
    expect(document.getElementById("pole-5")).not.toBeNull();
  });

  it("wymagane puste pole nie blokuje zapisu — formularz ma noValidate", async () => {
    const onZapisz = vi.fn();
    render(
      <FormSection
        tytul="Dane osoby"
        pola={[pole({ wymagane: true, wartosc: "" })]}
        onAnuluj={() => {}}
        onZapisz={onZapisz}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    expect(onZapisz).toHaveBeenCalledTimes(1);
  });

  it("Escape wola onAnuluj", async () => {
    const onAnuluj = vi.fn();
    render(<FormSection tytul="Dane osoby" pola={[pole()]} onAnuluj={onAnuluj} onZapisz={() => {}} />);
    await userEvent.keyboard("{Escape}");
    expect(onAnuluj).toHaveBeenCalledTimes(1);
  });

  it("wyjscie oddaje fokus przyciskowi wolajacemu", async () => {
    function Rodzic() {
      const [otwarte, setOtwarte] = useState(false);
      return (
        <>
          <button onClick={() => setOtwarte(true)}>Otworz</button>
          {otwarte && (
            <FormSection
              tytul="Dane osoby"
              pola={[pole()]}
              onAnuluj={() => setOtwarte(false)}
              onZapisz={() => {}}
            />
          )}
        </>
      );
    }
    render(<Rodzic />);
    const przyciskWolajacy = screen.getByRole("button", { name: "Otworz" });
    await userEvent.click(przyciskWolajacy);
    expect(screen.getByRole("form", { name: "Dane osoby" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("form", { name: "Dane osoby" })).not.toBeInTheDocument();
    expect(przyciskWolajacy).toHaveFocus();
  });
});
