import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import {
  saPowodyPytania,
  useNawigacjaZPytaniem,
  useZgloszenieNiezapisanychZmian,
  zapytajPrzedWyjsciem,
} from "../NiezapisaneZmiany";
import { PowlokaPanelu } from "../PowlokaPanelu/PowlokaPanelu";

/**
 * Pytanie o niezapisane zmiany we wspólnej ramie (`NiezapisaneZmiany.tsx` +
 * `PowlokaPanelu`): bez zgłoszenia przejście rusza od razu i bez okna; ze
 * zgłoszeniem rama pyta jednym oknem; „Zostań” niczego nie zmienia i oddaje
 * fokus elementowi, który wywołał wyjście; „Wyjdź bez zapisywania” przechodzi
 * i zdejmuje zgłoszenie; po zapisie pytania nie ma; drugi ekran nie dziedziczy
 * zgłoszenia pierwszego; kliknięcie z modyfikatorem nie pyta i nie blokuje;
 * zamknięcie karty zatrzymuje jedna obsługa `beforeunload`. Podmieniony jest
 * wyłącznie router.
 */

const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push, back }),
}));

const GRUPY = [
  {
    naglowek: "Codziennie",
    pozycje: [
      { ikona: "home" as const, etykieta: "Pulpit", href: "/admin", biezaca: true },
      { ikona: "inbox" as const, etykieta: "Sprawy", href: "/admin/sprawy" },
    ],
  },
];

const TYTUL = "Masz niezapisane zmiany";
const TRESC = "Jeśli wyjdziesz, zmiany zostaną utracone.";

/** Ekran próbny: jedno pole, zapis, odnośnik w treści i przycisk „Wróć”. */
function EkranProbny({ nazwa }: { nazwa: string }) {
  const [wartosc, setWartosc] = useState("");
  const [zapisana, setZapisana] = useState("");
  const { wstecz } = useNawigacjaZPytaniem();
  useZgloszenieNiezapisanychZmian(wartosc !== zapisana, nazwa);
  return (
    <div>
      <label>
        {`Pole ${nazwa}`}
        <input value={wartosc} onChange={(zdarzenie) => setWartosc(zdarzenie.target.value)} />
      </label>
      <button type="button" onClick={() => setZapisana(wartosc)}>
        Zapisz
      </button>
      <button type="button" onClick={() => wstecz()}>
        Wróć
      </button>
      <a href="/admin/osoby">Odnośnik w treści</a>
    </div>
  );
}

const onWyloguj = vi.fn();

function Powloka({ children }: { children: ReactNode }) {
  const { przejdz } = useNawigacjaZPytaniem();
  return (
    <PowlokaPanelu
      uzytkownik={{ imie: "Ewa", nazwisko: "Demo", rola: "administracja Fundacji" }}
      grupy={GRUPY}
      onNawigacja={przejdz}
      onWyloguj={onWyloguj}
    >
      {children}
    </PowlokaPanelu>
  );
}

function wyrenderuj(nazwa = "pierwszy") {
  const wynik = render(
    <Powloka>
      <EkranProbny key={nazwa} nazwa={nazwa} />
    </Powloka>,
  );
  return {
    ...wynik,
    pole: () => screen.getByLabelText(`Pole ${nazwa}`) as HTMLInputElement,
    menu: within(screen.getByRole("complementary", { name: "Menu i konto" })),
  };
}

function wpisz(pole: HTMLInputElement, tekst: string) {
  fireEvent.change(pole, { target: { value: tekst } });
}

function okno() {
  return screen.queryByRole("dialog", { name: TYTUL });
}

/**
 * Kliknięcie, którego aplikacja nie zatrzymała: `true`, gdy zdarzenie doszło do
 * okna z nietkniętą akcją domyślną (przeglądarka otworzyłaby odnośnik sama).
 * Akcję domyślną zatrzymuje dopiero ta próba — jsdom nie umie przejść pod adres.
 */
function kliknijSwobodnie(element: HTMLElement, opcje?: MouseEventInit): boolean {
  let swobodne = false;
  const sluchacz = (zdarzenie: Event) => {
    swobodne = !zdarzenie.defaultPrevented;
    zdarzenie.preventDefault();
  };
  window.addEventListener("click", sluchacz);
  fireEvent.click(element, opcje);
  window.removeEventListener("click", sluchacz);
  return swobodne;
}

function zamkniecieKarty(): boolean {
  const zdarzenie = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(zdarzenie);
  return zdarzenie.defaultPrevented;
}

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  onWyloguj.mockReset();
});

afterEach(() => {
  cleanup();
  expect(saPowodyPytania(), "zgłoszenie nie przeżywa odmontowania ekranu").toBe(false);
});

describe("bez zgłoszenia", () => {
  it("pozycja menu: przejście w tym samym kliknięciu, bez okna", () => {
    const { menu } = wyrenderuj();

    const domyslna = fireEvent.click(menu.getByRole("link", { name: "Sprawy" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/sprawy");
    expect(domyslna).toBe(false);
    expect(okno()).toBeNull();
  });

  it("odnośnik w treści, przycisk „Wróć” i wylogowanie: bez okna, bez zatrzymania", () => {
    wyrenderuj();

    expect(kliknijSwobodnie(screen.getByRole("link", { name: "Odnośnik w treści" }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(onWyloguj).toHaveBeenCalledTimes(1);
    expect(okno()).toBeNull();
  });

  it("zamknięcie karty nie jest zatrzymywane", () => {
    wyrenderuj();
    expect(zamkniecieKarty()).toBe(false);
  });
});

describe("ze zgłoszeniem — okno", () => {
  it("pozycja menu: okno z tytułem, treścią i dwoma przyciskami; fokus na „Zostań”; przejścia nie ma", () => {
    const { menu, pole } = wyrenderuj();
    wpisz(pole(), "zmiana");

    const domyslna = fireEvent.click(menu.getByRole("link", { name: "Sprawy" }));

    const dialog = okno();
    expect(dialog).not.toBeNull();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog!).getByRole("heading", { name: TYTUL })).toBeInTheDocument();
    expect(within(dialog!).getByText(TRESC)).toBeInTheDocument();
    const przyciski = within(dialog!).getAllByRole("button");
    expect(przyciski.map((przycisk) => przycisk.textContent)).toEqual(["Zostań", "Wyjdź bez zapisywania"]);
    expect(document.activeElement).toBe(przyciski[0]);
    expect(push).not.toHaveBeenCalled();
    expect(domyslna).toBe(false);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("„Zostań”: adres i pole bez zmian, okno znika, fokus wraca na kliknięty odnośnik menu", () => {
    const { menu, pole } = wyrenderuj();
    wpisz(pole(), "zmiana");
    // Fokus stoi w polu, a odnośnik jest klikany bez przeniesienia fokusu:
    // samo okno oddałoby fokus polu, mechanizm oddaje go odnośnikowi.
    pole().focus();
    const lacze = menu.getByRole("link", { name: "Sprawy" });
    fireEvent.click(lacze);
    expect(okno()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Zostań" }));

    expect(okno()).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(pole()).toHaveValue("zmiana");
    expect(document.activeElement).toBe(lacze);
    expect(saPowodyPytania()).toBe(true);
  });

  it("Escape działa jak „Zostań”", () => {
    const { menu, pole } = wyrenderuj();
    wpisz(pole(), "zmiana");
    fireEvent.click(menu.getByRole("link", { name: "Sprawy" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(okno()).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(pole()).toHaveValue("zmiana");
  });

  it("„Wyjdź bez zapisywania”: przejście pod adres pozycji, zgłoszenie zdjęte, karta zamyka się bez pytania", () => {
    const { menu, pole } = wyrenderuj();
    wpisz(pole(), "zmiana");
    expect(zamkniecieKarty()).toBe(true);
    fireEvent.click(menu.getByRole("link", { name: "Sprawy" }));

    fireEvent.click(screen.getByRole("button", { name: "Wyjdź bez zapisywania" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/sprawy");
    expect(okno()).toBeNull();
    expect(saPowodyPytania()).toBe(false);
    expect(zamkniecieKarty()).toBe(false);
  });

  it("po zapisie pytania nie ma", () => {
    const { menu, pole } = wyrenderuj();
    wpisz(pole(), "zmiana");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    fireEvent.click(menu.getByRole("link", { name: "Sprawy" }));

    expect(okno()).toBeNull();
    expect(push).toHaveBeenCalledWith("/admin/sprawy");
    expect(zamkniecieKarty()).toBe(false);
  });

  it("drugi ekran nie dziedziczy zgłoszenia pierwszego", () => {
    const { menu, pole, rerender } = wyrenderuj("pierwszy");
    wpisz(pole(), "zmiana");
    expect(saPowodyPytania()).toBe(true);

    rerender(
      <Powloka>
        <EkranProbny key="drugi" nazwa="drugi" />
      </Powloka>,
    );

    expect(saPowodyPytania()).toBe(false);
    fireEvent.click(menu.getByRole("link", { name: "Sprawy" }));
    expect(okno()).toBeNull();
    expect(push).toHaveBeenCalledWith("/admin/sprawy");
  });

  it("kliknięcie z modyfikatorem (nowa karta): bez okna i bez zatrzymania — w menu i w treści", () => {
    const { menu, pole } = wyrenderuj();
    wpisz(pole(), "zmiana");

    for (const modyfikator of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      expect(kliknijSwobodnie(menu.getByRole("link", { name: "Sprawy" }), modyfikator)).toBe(true);
      expect(kliknijSwobodnie(screen.getByRole("link", { name: "Odnośnik w treści" }), modyfikator)).toBe(true);
    }
    expect(kliknijSwobodnie(menu.getByRole("link", { name: "Sprawy" }), { button: 1 })).toBe(true);

    expect(okno()).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("odnośnik w treści: okno; po „Wyjdź bez zapisywania” to samo kliknięcie idzie jeszcze raz, już bez pytania", () => {
    const { pole } = wyrenderuj();
    wpisz(pole(), "zmiana");
    const lacze = screen.getByRole("link", { name: "Odnośnik w treści" });
    const klikniecia: boolean[] = [];
    const sluchacz = (zdarzenie: Event) => {
      klikniecia.push(zdarzenie.defaultPrevented);
      zdarzenie.preventDefault();
    };
    lacze.addEventListener("click", sluchacz);

    expect(fireEvent.click(lacze)).toBe(false);
    expect(okno()).not.toBeNull();
    // Pierwsze kliknięcie rama zatrzymała, zanim doszło do odnośnika.
    expect(klikniecia).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Wyjdź bez zapisywania" }));

    expect(okno()).toBeNull();
    expect(klikniecia).toEqual([false]);
    expect(saPowodyPytania()).toBe(false);
    lacze.removeEventListener("click", sluchacz);
  });

  it("przycisk ekranu „Wróć”: okno, po „Zostań” bez powrotu, po „Wyjdź bez zapisywania” powrót", () => {
    const { pole } = wyrenderuj();
    wpisz(pole(), "zmiana");
    const wroc = screen.getByRole("button", { name: "Wróć" });

    wroc.focus();
    fireEvent.click(wroc);
    fireEvent.click(screen.getByRole("button", { name: "Zostań" }));
    expect(back).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(wroc);

    fireEvent.click(wroc);
    fireEvent.click(screen.getByRole("button", { name: "Wyjdź bez zapisywania" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("wylogowanie: okno; „Zostań” nie wylogowuje, „Wyjdź bez zapisywania” wylogowuje", () => {
    const { pole } = wyrenderuj();
    wpisz(pole(), "zmiana");

    fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    expect(okno()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Zostań" }));
    expect(onWyloguj).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    fireEvent.click(screen.getByRole("button", { name: "Wyjdź bez zapisywania" }));
    expect(onWyloguj).toHaveBeenCalledTimes(1);
  });
});

describe("zamknięcie karty", () => {
  it("jedna obsługa `beforeunload` na wszystkie zgłoszenia: stoi, dopóki jest choć jedno; znika po zapisie i po odmontowaniu", () => {
    const dodaj = vi.spyOn(window, "addEventListener");
    const { unmount } = render(
      <Powloka>
        <EkranProbny nazwa="pierwszy" />
        <EkranProbny nazwa="drugi" />
      </Powloka>,
    );
    const pierwsze = screen.getByLabelText("Pole pierwszy") as HTMLInputElement;
    const drugie = screen.getByLabelText("Pole drugi") as HTMLInputElement;
    const [zapiszPierwszy, zapiszDrugi] = screen.getAllByRole("button", { name: "Zapisz" });

    wpisz(pierwsze, "zmiana");
    wpisz(drugie, "zmiana");
    expect(zamkniecieKarty()).toBe(true);
    const obslugi = new Set(dodaj.mock.calls.filter(([rodzaj]) => rodzaj === "beforeunload").map(([, obsluga]) => obsluga));
    expect(obslugi.size).toBe(1);

    fireEvent.click(zapiszPierwszy);
    expect(zamkniecieKarty()).toBe(true);
    fireEvent.click(zapiszDrugi);
    expect(zamkniecieKarty()).toBe(false);

    wpisz(drugie, "kolejna zmiana");
    expect(zamkniecieKarty()).toBe(true);
    unmount();
    expect(zamkniecieKarty()).toBe(false);
    dodaj.mockRestore();
  });
});

describe("poza ramą", () => {
  it("bez okna ramy wyjście nie jest wstrzymywane, a zamknięcie karty nadal pyta", () => {
    const dalej = vi.fn();
    const { unmount } = render(<EkranProbny nazwa="bez ramy" />);
    wpisz(screen.getByLabelText("Pole bez ramy") as HTMLInputElement, "zmiana");
    expect(saPowodyPytania()).toBe(true);

    act(() => zapytajPrzedWyjsciem(dalej));

    expect(dalej).toHaveBeenCalledTimes(1);
    expect(zamkniecieKarty()).toBe(true);
    unmount();
  });
});
