import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../Dialog";
import { Field } from "../../../molekuly/Field/Field";

describe("Dialog", () => {
  it("pokazuje tytuł, treść i obie akcje", () => {
    render(
      <Dialog
        tytul="Usunąć wpis?"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Usuń"
        onWycofaj={() => {}}
        onPotwierdz={() => {}}
      >
        Tej operacji nie można cofnąć.
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Usunąć wpis?" })).toBeInTheDocument();
    expect(screen.getByText("Tej operacji nie można cofnąć.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuń" })).toBeInTheDocument();
  });

  it("Escape woła wycofanie", async () => {
    const onWycofaj = vi.fn();
    render(
      <Dialog
        tytul="Potwierdź"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Zapisz"
        onWycofaj={onWycofaj}
        onPotwierdz={() => {}}
      >
        Pytanie.
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });

  it("klik w przesłonę woła wycofanie, klik w okno nie", async () => {
    const onWycofaj = vi.fn();
    render(
      <Dialog
        tytul="Potwierdź"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Zapisz"
        onWycofaj={onWycofaj}
        onPotwierdz={() => {}}
      >
        Pytanie.
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("dialog"));
    expect(onWycofaj).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });

  it("fokus po zamknięciu wraca do przycisku wołającego", async () => {
    function Rodzic() {
      const [otwarte, setOtwarte] = useState(false);
      return (
        <>
          <button onClick={() => setOtwarte(true)}>Otwórz</button>
          {otwarte && (
            <Dialog
              tytul="Potwierdź"
              etykietaWycofania="Anuluj"
              etykietaPotwierdzenia="Zapisz"
              onWycofaj={() => setOtwarte(false)}
              onPotwierdz={() => setOtwarte(false)}
            >
              Pytanie.
            </Dialog>
          )}
        </>
      );
    }
    render(<Rodzic />);
    const przyciskWolajacy = screen.getByRole("button", { name: "Otwórz" });
    await userEvent.click(przyciskWolajacy);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(przyciskWolajacy).toHaveFocus();
  });

  it("Enter na fokusie wycofania (domyślny fokus otwarcia) wycofuje, nie zatwierdza", async () => {
    const onWycofaj = vi.fn();
    const onPotwierdz = vi.fn();
    render(
      <Dialog
        tytul="Usunąć wersję roboczą?"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Usuń wersję"
        niebezpieczne
        onWycofaj={onWycofaj}
        onPotwierdz={onPotwierdz}
      >
        Tej operacji nie można cofnąć.
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Anuluj" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onPotwierdz).toHaveBeenCalledTimes(0);
    expect(onWycofaj).toHaveBeenCalledTimes(1);
  });

  it("Enter w polu tekstowym zatwierdza", async () => {
    const onPotwierdz = vi.fn();
    render(
      <Dialog
        tytul="Potwierdź"
        etykietaWycofania="Anuluj"
        etykietaPotwierdzenia="Zapisz"
        onWycofaj={() => {}}
        onPotwierdz={onPotwierdz}
      >
        <Field id="d-pole" etykieta="Powód" rodzaj="tekst" wartosc="" onZmiana={() => {}} />
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("textbox", { name: "Powód" }));
    await userEvent.keyboard("{Enter}");
    expect(onPotwierdz).toHaveBeenCalledTimes(1);
  });

  it("Tab z ostatniego przycisku wraca na pierwszy element okna, nie wychodzi na zewnątrz", async () => {
    render(
      <>
        <button>Przed oknem</button>
        <Dialog
          tytul="Potwierdź"
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zapisz"
          onWycofaj={() => {}}
          onPotwierdz={() => {}}
        >
          Pytanie.
        </Dialog>
      </>,
    );
    const anuluj = screen.getByRole("button", { name: "Anuluj" });
    const zapisz = screen.getByRole("button", { name: "Zapisz" });
    expect(anuluj).toHaveFocus();
    await userEvent.tab();
    expect(zapisz).toHaveFocus();
    await userEvent.tab();
    expect(anuluj).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(zapisz).toHaveFocus();
  });
});
