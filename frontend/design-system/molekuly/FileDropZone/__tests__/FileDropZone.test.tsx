import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "../../../../components/__tests__/axe-helper";
import { FileDropZone, type PlikFileDropZone } from "../FileDropZone";

/**
 * Obszar upuszczania ma JEDEN element obsługiwany z klawiatury i przez czytnik:
 * przycisk obszaru. Ukryte pole wyboru pliku jest tylko mechanizmem otwarcia
 * okna systemowego — nie stoi wewnątrz przycisku, nie jest przystankiem
 * tabulatora i nie jest ogłaszane jako drugie, nienazwane pole.
 */

const ETYKIETA = "Upuść tutaj materiały albo wybierz je z dysku.";
const PODPOWIEDZ = "Plik może mieć najwyżej 10 MB.";

function renderObszaru(
  onWybierzPliki = vi.fn(),
  dodatkowe: { wiele?: boolean; akceptuj?: string; pliki?: PlikFileDropZone[] } = {},
) {
  const wynik = render(
    <FileDropZone
      id="proba-plik"
      etykieta={ETYKIETA}
      podpowiedz={PODPOWIEDZ}
      pliki={dodatkowe.pliki ?? []}
      onWybierzPliki={onWybierzPliki}
      wiele={dodatkowe.wiele}
      akceptuj={dodatkowe.akceptuj}
    />,
  );
  const pole = wynik.container.querySelector<HTMLInputElement>("input[type='file']")!;
  return { ...wynik, pole, onWybierzPliki };
}

describe("FileDropZone — pole wyboru pliku a przycisk obszaru", () => {
  it("pole wyboru pliku nie stoi wewnątrz przycisku obszaru", () => {
    const { pole } = renderObszaru();

    expect(pole.closest("[role='button']")).toBeNull();
  });

  it("pole nie jest przystankiem tabulatora ani osobnym polem dla czytnika; jedynym elementem obsługi jest przycisk", () => {
    const { pole } = renderObszaru();

    expect(pole).toHaveAttribute("tabindex", "-1");
    expect(pole).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button")).toHaveAttribute("id", "proba-plik-obszar");
    expect(pole).toHaveAttribute("id", "proba-plik");
  });

  it("klik, Enter i spacja na przycisku otwierają wybór pliku; wybrany plik trafia do wywołania", () => {
    const { pole, onWybierzPliki } = renderObszaru();
    const otwarcie = vi.spyOn(pole, "click");
    const przycisk = screen.getByRole("button");

    fireEvent.click(przycisk);
    fireEvent.keyDown(przycisk, { key: "Enter" });
    fireEvent.keyDown(przycisk, { key: " " });
    expect(otwarcie).toHaveBeenCalledTimes(3);

    const plik = new File(["%PDF"], "karta.pdf", { type: "application/pdf" });
    fireEvent.change(pole, { target: { files: [plik] } });
    expect(onWybierzPliki).toHaveBeenCalledTimes(1);
  });
});

function plik(nazwa: string) {
  return new File(["%PDF"], nazwa, { type: "application/pdf" });
}

/** Zdarzenie upuszczenia z podaną listą plików (jsdom nie ma `DataTransfer`). */
function upusc(cel: Element, nazwy: string[]) {
  fireEvent.drop(cel, { dataTransfer: { files: nazwy.map(plik) } });
}

describe("FileDropZone — nazwa i opis obszaru", () => {
  it("przycisk obszaru ma nazwę z etykiety i opis równy podpowiedzi", () => {
    renderObszaru();
    const przycisk = screen.getByRole("button");

    expect(przycisk).toHaveAccessibleName(expect.stringContaining(ETYKIETA));
    expect(przycisk).toHaveAccessibleDescription(PODPOWIEDZ);
  });
});

describe("FileDropZone — jeden przystanek tabulatora", () => {
  it("od jednego elementu do następnego Tab zatrzymuje się na obszarze dokładnie raz", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = render(
      <>
        <button type="button">przed</button>
        <FileDropZone id="proba-plik" etykieta={ETYKIETA} podpowiedz={PODPOWIEDZ} pliki={[]} onWybierzPliki={vi.fn()} />
        <button type="button">po</button>
      </>,
    );
    const przed = screen.getByRole("button", { name: "przed" });
    const po = screen.getByRole("button", { name: "po" });
    przed.focus();

    await uzytkownik.tab();
    expect(container.querySelector("#proba-plik-obszar")).toHaveFocus();

    await uzytkownik.tab();
    expect(po).toHaveFocus();
  });
});

describe("FileDropZone — mysz", () => {
  it("kliknięcie obszaru, także na tekście etykiety, otwiera wybór pliku dokładnie raz", () => {
    const { pole } = renderObszaru();
    const otwarcie = vi.spyOn(pole, "click");

    fireEvent.click(screen.getByRole("button"));
    expect(otwarcie).toHaveBeenCalledTimes(1);

    otwarcie.mockClear();
    fireEvent.click(screen.getByText(ETYKIETA));
    expect(otwarcie).toHaveBeenCalledTimes(1);
  });

  it("zmiana pola wywołuje onWybierzPliki raz, z wybranym plikiem", () => {
    const { pole, onWybierzPliki } = renderObszaru();

    fireEvent.change(pole, { target: { files: [plik("karta.pdf")] } });

    expect(onWybierzPliki).toHaveBeenCalledTimes(1);
    expect(onWybierzPliki.mock.calls[0][0][0].name).toBe("karta.pdf");
  });

  it("upuszczenie pliku wywołuje onWybierzPliki raz, z upuszczonymi plikami", () => {
    const { onWybierzPliki } = renderObszaru();

    upusc(screen.getByRole("button"), ["a.pdf", "b.pdf"]);

    expect(onWybierzPliki).toHaveBeenCalledTimes(1);
    const lista = onWybierzPliki.mock.calls[0][0];
    expect(Array.from(lista as ArrayLike<File>).map((p) => p.name)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("upuszczenie bez plików nie wywołuje onWybierzPliki", () => {
    const { onWybierzPliki } = renderObszaru();

    upusc(screen.getByRole("button"), []);

    expect(onWybierzPliki).not.toHaveBeenCalled();
  });
});

describe("FileDropZone — ten sam plik wybrany drugi raz z rzędu", () => {
  /** Pole wyboru, które pamięta wartość jak przeglądarka: zmiany nie zgłosi, dopóki wartość się nie zmieni. */
  function zapamietajWartosc(pole: HTMLInputElement) {
    const zapisy: string[] = [];
    let wartosc = "C:\\fakepath\\karta.pdf";
    Object.defineProperty(pole, "value", {
      configurable: true,
      get: () => wartosc,
      set: (nowa: string) => {
        zapisy.push(nowa);
        wartosc = nowa;
      },
    });
    return { zapisy, odczyt: () => wartosc };
  }

  it("po odczycie wartość pola zostaje wyzerowana, więc kolejny wybór tego samego pliku jest zgłoszony", () => {
    const { pole, onWybierzPliki } = renderObszaru();
    const stan = zapamietajWartosc(pole);

    fireEvent.change(pole, { target: { files: [plik("karta.pdf")] } });
    expect(onWybierzPliki).toHaveBeenCalledTimes(1);
    expect(stan.odczyt()).toBe("");
    expect(stan.zapisy).toEqual([""]);

    fireEvent.change(pole, { target: { files: [plik("karta.pdf")] } });
    expect(onWybierzPliki).toHaveBeenCalledTimes(2);
  });

  it("lista przekazana ekranowi nie opróżnia się po wyzerowaniu pola (w przeglądarce zerowanie czyści pierwotną listę)", () => {
    vi.stubGlobal(
      "DataTransfer",
      class {
        private lista: File[] = [];
        items = { add: (p: File) => this.lista.push(p) };
        get files() {
          return this.lista as unknown as FileList;
        }
      },
    );
    try {
      const { pole, onWybierzPliki } = renderObszaru();
      const pierwotna = [plik("karta.pdf")];
      Object.defineProperty(pole, "value", {
        configurable: true,
        get: () => "",
        set: () => {
          pierwotna.length = 0;
        },
      });

      fireEvent.change(pole, { target: { files: pierwotna } });

      expect(pierwotna).toHaveLength(0);
      const przekazana = onWybierzPliki.mock.calls[0][0] as ArrayLike<File>;
      expect(przekazana).toHaveLength(1);
      expect(przekazana[0].name).toBe("karta.pdf");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("FileDropZone — wiele plików i typy", () => {
  it("domyślnie pole przyjmuje kilka plików i nie ma zdania o jednym pliku", () => {
    const { pole } = renderObszaru();

    expect(pole).toHaveAttribute("multiple");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("wiele={false}: pole bez multiple, a upuszczenie dwóch plików nie wywołuje onWybierzPliki i pokazuje zdanie", () => {
    const { pole, onWybierzPliki } = renderObszaru(vi.fn(), { wiele: false });
    expect(pole).not.toHaveAttribute("multiple");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    upusc(screen.getByRole("button"), ["a.pdf", "b.pdf"]);

    expect(onWybierzPliki).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Upuść jeden plik.");
  });

  it("wiele={false}: upuszczenie jednego pliku wywołuje onWybierzPliki i zdejmuje zdanie", () => {
    const { onWybierzPliki } = renderObszaru(vi.fn(), { wiele: false });
    const obszar = screen.getByRole("button");

    upusc(obszar, ["a.pdf", "b.pdf"]);
    expect(screen.getByRole("status")).toHaveTextContent("Upuść jeden plik.");

    upusc(obszar, ["c.pdf"]);
    expect(onWybierzPliki).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("akceptuj trafia do atrybutu accept pola, a upuszczonych plików komponent nie filtruje", () => {
    const { pole, onWybierzPliki } = renderObszaru(vi.fn(), { akceptuj: "image/png" });

    expect(pole).toHaveAttribute("accept", "image/png");

    upusc(screen.getByRole("button"), ["karta.pdf"]);
    expect(onWybierzPliki).toHaveBeenCalledTimes(1);
  });

  it("bez akceptuj pole nie ma atrybutu accept", () => {
    const { pole } = renderObszaru();

    expect(pole).not.toHaveAttribute("accept");
  });
});

describe("FileDropZone — lista plików", () => {
  it("każdy dodany plik ma wiersz z nazwą i komunikatem, a stan wiersza idzie do atrybutu data-stan", () => {
    const { container } = renderObszaru(vi.fn(), {
      pliki: [
        { nazwa: "zaswiadczenie.pdf", stan: "gotowy", komunikat: "Gotowy" },
        { nazwa: "skan.png", stan: "blad", komunikat: "Plik nie został wczytany." },
      ],
    });

    const wiersze = container.querySelectorAll("li");
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0]).toHaveTextContent("zaswiadczenie.pdf");
    expect(wiersze[0]).toHaveTextContent("Gotowy");
    expect(wiersze[0]).toHaveAttribute("data-stan", "gotowy");
    expect(wiersze[1]).toHaveTextContent("Plik nie został wczytany.");
    expect(wiersze[1]).toHaveAttribute("data-stan", "blad");
  });

  it("bez plików nie ma listy", () => {
    const { container } = renderObszaru();

    expect(container.querySelector("ul")).toBeNull();
  });
});

describe("FileDropZone — axe", () => {
  it("zero naruszeń: pusty, z listą plików, z plikiem nad obszarem i ze zdaniem o jednym pliku", async () => {
    const pusty = renderObszaru();
    expect(await axeViolations(pusty.container)).toEqual([]);
    pusty.unmount();

    const zLista = renderObszaru(vi.fn(), { pliki: [{ nazwa: "a.pdf", stan: "gotowy", komunikat: "Gotowy" }] });
    expect(await axeViolations(zLista.container)).toEqual([]);
    zLista.unmount();

    const nadObszarem = renderObszaru();
    fireEvent.dragOver(screen.getByRole("button"));
    expect(await axeViolations(nadObszarem.container)).toEqual([]);
    nadObszarem.unmount();

    const zdanie = renderObszaru(vi.fn(), { wiele: false });
    upusc(screen.getByRole("button"), ["a.pdf", "b.pdf"]);
    expect(await axeViolations(zdanie.container)).toEqual([]);
  });
});
