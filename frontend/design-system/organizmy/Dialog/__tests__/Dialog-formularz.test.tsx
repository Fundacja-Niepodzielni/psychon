import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, KLUCZ_WPISU_HISTORII, type BladDialogu } from "../Dialog";
import { Field } from "../../../molekuly/Field/Field";

/**
 * Wariant `formularz` okna: `<form>` w oknie, fokus na pierwszym polu, Enter
 * wysyła, okno czeka na odpowiedź serwera („Zapisywanie…”, drugie wysłanie
 * ignorowane), podsumowanie błędów z fokusem i odnośnikami do pól, przesłona
 * nie zamyka, Escape przy wpisanych danych pyta o porzucenie, „Wstecz”
 * przeglądarki zamyka samo okno.
 */

interface WlasciwosciProby {
  onPotwierdz?: () => void | Promise<unknown>;
  onWycofaj?: () => void;
  bledy?: readonly BladDialogu[];
  niezapisaneZmiany?: boolean;
  poczatkowaNazwa?: string;
}

function FormularzProby({ onPotwierdz = () => {}, onWycofaj = () => {}, bledy, niezapisaneZmiany, poczatkowaNazwa = "" }: WlasciwosciProby) {
  const [nazwa, setNazwa] = useState(poczatkowaNazwa);
  const [powod, setPowod] = useState("");
  return (
    <Dialog
      wariant="formularz"
      tytul="Zmień nazwę"
      opis="Nazwa widoczna dla uczestników."
      etykietaWycofania="Anuluj"
      etykietaPotwierdzenia="Zapisz nazwę"
      onWycofaj={onWycofaj}
      onPotwierdz={onPotwierdz}
      bledy={bledy}
      niezapisaneZmiany={niezapisaneZmiany}
    >
      <Field id="proba-nazwa" etykieta="Nazwa" rodzaj="tekst" wartosc={nazwa} onZmiana={setNazwa} />
      <Field id="proba-powod" etykieta="Powód" rodzaj="wieloliniowy" wartosc={powod} onZmiana={setPowod} />
    </Dialog>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dialog — wariant formularz: budowa i fokus", () => {
  it("treść i przyciski stoją w formularzu, potwierdzenie wysyła formularz, wycofanie nie", () => {
    render(<FormularzProby />);
    const okno = screen.getByRole("dialog", { name: "Zmień nazwę" });
    const formularz = okno.querySelector("form");
    expect(formularz).not.toBeNull();
    expect(within(formularz as HTMLFormElement).getByRole("textbox", { name: "Nazwa" })).toBeInTheDocument();
    expect(within(okno).getByRole("button", { name: "Zapisz nazwę" })).toHaveAttribute("type", "submit");
    expect(within(okno).getByRole("button", { name: "Anuluj" })).toHaveAttribute("type", "button");
  });

  it("fokus startuje na pierwszym polu, nie na „Anuluj”", () => {
    render(<FormularzProby />);
    expect(screen.getByRole("textbox", { name: "Nazwa" })).toHaveFocus();
  });

  it("opis okna jest powiązany przez aria-describedby, pola nie", () => {
    render(<FormularzProby />);
    const okno = screen.getByRole("dialog");
    expect(okno).toHaveAccessibleDescription("Nazwa widoczna dla uczestników.");
  });
});

describe("Dialog — wariant formularz: wysłanie", () => {
  it("Enter w polu wysyła formularz raz, jak na stronie", async () => {
    const onPotwierdz = vi.fn();
    render(<FormularzProby onPotwierdz={onPotwierdz} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "Marta{Enter}");
    expect(onPotwierdz).toHaveBeenCalledTimes(1);
  });

  it("Enter w polu wieloliniowym wstawia nową linię i nie wysyła", async () => {
    const onPotwierdz = vi.fn();
    render(<FormularzProby onPotwierdz={onPotwierdz} />);
    const powod = screen.getByRole("textbox", { name: "Powód" });
    await userEvent.type(powod, "a{Enter}b");
    expect(onPotwierdz).not.toHaveBeenCalled();
    expect(powod).toHaveValue("a\nb");
  });

  it("w czasie zapisu przycisk mówi „Zapisywanie…”, jest niedostępny, a drugie wysłanie nie wychodzi", async () => {
    let zakoncz: () => void = () => undefined;
    const onPotwierdz = vi.fn(() => new Promise<void>((resolve) => (zakoncz = resolve)));
    render(<FormularzProby onPotwierdz={onPotwierdz} />);
    const pole = screen.getByRole("textbox", { name: "Nazwa" });

    await userEvent.type(pole, "Marta{Enter}");
    const przycisk = screen.getByRole("button", { name: "Zapisywanie…" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");

    await userEvent.type(pole, "{Enter}");
    await userEvent.click(przycisk);
    expect(onPotwierdz).toHaveBeenCalledTimes(1);

    await act(async () => zakoncz());
    expect(screen.getByRole("button", { name: "Zapisz nazwę" })).not.toHaveAttribute("aria-disabled");
    await userEvent.type(pole, "{Enter}");
    expect(onPotwierdz).toHaveBeenCalledTimes(2);
  });

  it("dwa wysłania w tej samej chwili (przed ponownym renderem) dają jedno wywołanie", () => {
    const onPotwierdz = vi.fn(() => new Promise(() => undefined));
    render(<FormularzProby onPotwierdz={onPotwierdz} />);
    const formularz = screen.getByRole("dialog").querySelector("form") as HTMLFormElement;
    act(() => {
      formularz.requestSubmit();
      formularz.requestSubmit();
    });
    expect(onPotwierdz).toHaveBeenCalledTimes(1);
  });

  it("okno zostaje otwarte do odpowiedzi serwera: Escape, „Anuluj” i przesłona w czasie zapisu nic nie robią", async () => {
    const onWycofaj = vi.fn();
    render(<FormularzProby onWycofaj={onWycofaj} onPotwierdz={() => new Promise(() => undefined)} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "{Enter}");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await userEvent.click(screen.getByRole("dialog"));
    expect(onWycofaj).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("odrzucona obietnica zdejmuje stan zapisu i pozwala wysłać ponownie", async () => {
    const onPotwierdz = vi.fn().mockRejectedValueOnce(new Error("sieć")).mockResolvedValue(undefined);
    render(<FormularzProby onPotwierdz={onPotwierdz} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Zapisz nazwę" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Zapisz nazwę" }));
    expect(onPotwierdz).toHaveBeenCalledTimes(2);
  });

  it("zapis sterowany z zewnątrz (`zapisywanie`) działa tak samo", () => {
    const onPotwierdz = vi.fn();
    render(
      <Dialog
        wariant="formularz"
        tytul="Zmień nazwę"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Zapisz nazwę"
        zapisywanie
        onWycofaj={() => {}}
        onPotwierdz={onPotwierdz}
      >
        <Field id="z-pole" etykieta="Nazwa" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
      </Dialog>,
    );
    const formularz = screen.getByRole("dialog").querySelector("form") as HTMLFormElement;
    act(() => formularz.requestSubmit());
    expect(onPotwierdz).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Zapisywanie…" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Dialog — wariant formularz: błędy", () => {
  const BLEDY: BladDialogu[] = [
    { tresc: "Wpisz nazwę.", idPola: "proba-nazwa" },
    { tresc: "Serwer nie odpowiedział. Spróbuj ponownie." },
  ];

  it("podsumowanie stoi na górze okna i dostaje fokus; błąd pola jest odnośnikiem do pola", async () => {
    const { rerender } = render(<FormularzProby />);
    rerender(<FormularzProby bledy={BLEDY} />);

    const podsumowanie = screen.getByRole("group", { name: "Popraw dane w formularzu" });
    expect(podsumowanie).toHaveFocus();
    const srodek = podsumowanie.parentElement as HTMLElement;
    expect(srodek.firstElementChild).toBe(podsumowanie);

    const odnosnik = within(podsumowanie).getByRole("link", { name: "Wpisz nazwę." });
    expect(odnosnik).toHaveAttribute("href", "#proba-nazwa");
    expect(within(podsumowanie).getByText("Serwer nie odpowiedział. Spróbuj ponownie.")).toBeInTheDocument();
    expect(within(podsumowanie).queryByRole("link", { name: /Serwer/ })).toBeNull();

    await userEvent.click(odnosnik);
    expect(screen.getByRole("textbox", { name: "Nazwa" })).toHaveFocus();
  });

  it("każda nowa lista błędów (kolejne wysłanie) znowu przenosi fokus na podsumowanie", () => {
    const { rerender } = render(<FormularzProby bledy={[BLEDY[0]]} />);
    screen.getByRole("textbox", { name: "Nazwa" }).focus();
    rerender(<FormularzProby bledy={[BLEDY[0]]} />);
    expect(screen.getByRole("group", { name: "Popraw dane w formularzu" })).toHaveFocus();
  });
});

describe("Dialog — wariant formularz: zamykanie", () => {
  it("klik w przesłonę nigdy nie zamyka formularza", async () => {
    const onWycofaj = vi.fn();
    render(<FormularzProby onWycofaj={onWycofaj} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onWycofaj).not.toHaveBeenCalled();
  });

  it("Escape bez wpisanych danych zamyka okno", async () => {
    const onWycofaj = vi.fn();
    render(<FormularzProby onWycofaj={onWycofaj} />);
    await userEvent.keyboard("{Escape}");
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });

  it("Escape po wpisaniu danych pyta w tym samym oknie; „Wróć do formularza” wraca do pola z danymi", async () => {
    const onWycofaj = vi.fn();
    render(<FormularzProby onWycofaj={onWycofaj} />);
    const pole = screen.getByRole("textbox", { name: "Nazwa" });
    await userEvent.type(pole, "Mar");
    await userEvent.keyboard("{Escape}");

    expect(onWycofaj).not.toHaveBeenCalled();
    const okno = screen.getByRole("dialog", { name: "Zmień nazwę" });
    const pytanie = within(okno).getByRole("group", { name: "Porzucić wpisane dane?" });
    expect(okno).toHaveAccessibleDescription("Porzucić wpisane dane?");
    expect(within(pytanie).getByRole("button", { name: "Porzuć" })).toBeInTheDocument();
    const wroc = within(pytanie).getByRole("button", { name: "Wróć do formularza" });
    expect(wroc).toHaveFocus();
    expect(within(okno).queryByRole("textbox", { name: "Nazwa" })).toBeNull();

    await userEvent.click(wroc);
    expect(screen.queryByRole("group", { name: "Porzucić wpisane dane?" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Nazwa" })).toHaveValue("Mar");
    expect(screen.getByRole("textbox", { name: "Nazwa" })).toHaveFocus();
  });

  it("drugi Escape przy pytaniu wraca do formularza, „Porzuć” zamyka okno", async () => {
    const onWycofaj = vi.fn();
    render(<FormularzProby onWycofaj={onWycofaj} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "M");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Porzucić wpisane dane?" })).toBeNull();
    expect(onWycofaj).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Porzuć" }));
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });

  it("`niezapisaneZmiany` od wywołującego rozstrzyga zamiast śledzenia pól", async () => {
    const onWycofaj = vi.fn();
    const { rerender } = render(<FormularzProby onWycofaj={onWycofaj} niezapisaneZmiany />);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("group", { name: "Porzucić wpisane dane?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Wróć do formularza" }));

    rerender(<FormularzProby onWycofaj={onWycofaj} niezapisaneZmiany={false} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "M");
    await userEvent.keyboard("{Escape}");
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });

  it("„Anuluj” zamyka formularz od razu, także z wpisanymi danymi", async () => {
    const onWycofaj = vi.fn();
    render(<FormularzProby onWycofaj={onWycofaj} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "M");
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });
});

describe("Dialog — wariant formularz: przycisk „Wstecz” przeglądarki", () => {
  function Rodzic({ onWycofaj }: { onWycofaj?: () => void }) {
    const [otwarte, setOtwarte] = useState(true);
    return otwarte ? (
      <FormularzProby
        onWycofaj={() => {
          onWycofaj?.();
          setOtwarte(false);
        }}
      />
    ) : (
      <p>Okno zamknięte</p>
    );
  }

  const wpisOkna = () => (window.history.state as Record<string, unknown> | null)?.[KLUCZ_WPISU_HISTORII];

  it("okno dokłada dokładnie jeden wpis historii, a „Wstecz” zamyka samo okno", async () => {
    const dlugosc = window.history.length;
    const onWycofaj = vi.fn();
    const przedOknem = wpisOkna();
    render(<Rodzic onWycofaj={onWycofaj} />);
    await waitFor(() => expect(wpisOkna()).not.toBe(przedOknem));
    const znacznik = wpisOkna();
    expect(window.history.length).toBe(dlugosc + 1);

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByText("Okno zamknięte")).toBeInTheDocument());
    expect(onWycofaj).toHaveBeenCalledTimes(1);
    expect(wpisOkna()).not.toBe(znacznik);
    expect(wpisOkna()).toBe(przedOknem);
  });

  it("zamknięcie „Anuluj” zdejmuje wpis okna — strona wraca na swój wpis", async () => {
    const wstecz = vi.spyOn(window.history, "back");
    render(<Rodzic />);
    await waitFor(() => expect(wpisOkna()).toBeDefined());
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(wstecz).toHaveBeenCalledTimes(1);
  });

  it("„Wstecz” przy wpisanych danych pyta o porzucenie i odtwarza wpis okna", async () => {
    const onWycofaj = vi.fn();
    render(<Rodzic onWycofaj={onWycofaj} />);
    await waitFor(() => expect(wpisOkna()).toBeDefined());
    await userEvent.type(screen.getByRole("textbox", { name: "Nazwa" }), "M");

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("group", { name: "Porzucić wpisane dane?" })).toBeInTheDocument());
    expect(onWycofaj).not.toHaveBeenCalled();
    expect(wpisOkna()).toBeDefined();
  });

  it("okno potwierdzenia nie dotyka historii", async () => {
    const wpis = vi.spyOn(window.history, "pushState");
    render(
      <Dialog tytul="Usunąć?" etykietaWycofania="Anuluj" etykietaPotwierdzenia="Usuń" onWycofaj={() => {}} onPotwierdz={() => {}}>
        Pytanie.
      </Dialog>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wpis).not.toHaveBeenCalled();
  });
});
