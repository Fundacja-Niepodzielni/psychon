import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordList, type KolumnaRecordList } from "../RecordList";

const PUSTY = { naglowek: "Brak", tresc: "Nic tu nie ma.", przycisk: { etykieta: "Odśwież", onClick: vi.fn() } };

const KOLUMNY: KolumnaRecordList[] = [
  { nazwa: "Kurs", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Miejsce w ścieżce", rodzaj: "liczba", klucz: "miejsce" },
  { nazwa: "Lekcje", rodzaj: "liczba", klucz: "lekcje" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

const edytuj = vi.fn();

const WIERSZE = [
  {
    id: "1",
    tytul: "Podstawy pomocy",
    podpowiedz: "Kurs · PsychON",
    plakietka: { wariant: "ok" as const, tekst: "Opublikowany" },
    komorki: { miejsce: { liczba: 1, jednostka: "w ścieżce" }, lekcje: { liczba: 3, jednostka: "lekcje" } },
    akcja: { etykieta: "Otwórz", etykietaDostepna: "Otwórz kurs: Podstawy pomocy", href: "/admin/kursy/1" },
  },
  {
    id: "2",
    tytul: "Webinar otwarty",
    plakietka: { wariant: "neutral" as const, tekst: "Szkic" },
    komorki: { miejsce: { tekst: "poza ścieżką" }, lekcje: { liczba: 0, jednostka: "lekcji" } },
    akcja: { etykieta: "Edytuj", onKliknij: edytuj },
  },
];

function tabela(): HTMLElement {
  return screen.getByRole("table", { name: "Lista kursów" });
}

/** Komórka wiersza stojąca pod nagłówkiem kolumny o podanej nazwie (ta sama pozycja w wierszu). */
function komorkaKolumny(wiersz: HTMLElement, nazwaKolumny: string): HTMLElement {
  const naglowki = within(tabela()).getAllByRole("columnheader");
  const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === nazwaKolumny);
  expect(indeks, `nagłówek „${nazwaKolumny}”`).toBeGreaterThanOrEqual(0);
  const komorki = within(wiersz).getAllByRole("cell");
  expect(komorki, "wiersz ma tyle komórek, ile jest kolumn").toHaveLength(naglowki.length);
  return komorki[indeks];
}

function wierszeDanych(): HTMLElement[] {
  // Pierwszy wiersz tabeli to nagłówki kolumn.
  return within(tabela()).getAllByRole("row").slice(1);
}

describe("RecordList — tryb kolumn", () => {
  it("rysuje nagłówki kolumn w podanej kolejności; nagłówek akcji ma nazwę dla czytnika", () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const naglowki = within(tabela()).getAllByRole("columnheader");
    expect(naglowki.map((naglowek) => naglowek.textContent)).toEqual([
      "Kurs",
      "Stan",
      "Miejsce w ścieżce",
      "Lekcje",
      "Akcja",
    ]);
    expect(within(tabela()).getByRole("columnheader", { name: "Akcja" })).toBe(naglowki[4]);
    expect(within(tabela()).getByRole("columnheader", { name: "Miejsce w ścieżce" })).toBe(naglowki[2]);
  });

  it("każda wartość stoi pod nagłówkiem swojej kolumny (rola i nazwa)", () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const [pierwszy, drugi] = wierszeDanych();
    expect(komorkaKolumny(pierwszy, "Kurs")).toHaveTextContent("Podstawy pomocy");
    expect(komorkaKolumny(pierwszy, "Kurs")).toHaveTextContent("Kurs · PsychON");
    expect(komorkaKolumny(pierwszy, "Stan")).toHaveTextContent("Opublikowany");
    expect(komorkaKolumny(pierwszy, "Miejsce w ścieżce")).toHaveTextContent(/^Miejsce w ścieżce\s*1\s*w ścieżce$/);
    expect(komorkaKolumny(pierwszy, "Lekcje")).toHaveTextContent(/^Lekcje\s*3\s*lekcje$/);
    expect(komorkaKolumny(drugi, "Miejsce w ścieżce")).toHaveTextContent("poza ścieżką");
    expect(komorkaKolumny(drugi, "Stan")).toHaveTextContent("Szkic");
  });

  it("podpis kolumny przy wartości jest poza drzewem dostępności (nazwę kolumny niesie nagłówek)", () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const komorka = komorkaKolumny(wierszeDanych()[0], "Lekcje");
    const podpis = within(komorka).getByText("Lekcje");
    expect(podpis).toHaveAttribute("aria-hidden", "true");
  });

  it("kolumna liczbowa idzie przez `Num`: liczba i jednostka w osobnych elementach, pusta jednostka jest błędem", () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const komorka = komorkaKolumny(wierszeDanych()[0], "Lekcje");
    expect(komorka).toHaveAttribute("data-rodzaj", "liczba");
    const liczba = within(komorka).getByText("3");
    expect(liczba.parentElement).toHaveTextContent(/^3\s*lekcje$/);
    expect(liczba.parentElement).not.toBe(komorka);

    const bezJednostki = [{ ...WIERSZE[0], komorki: { ...WIERSZE[0].komorki, lekcje: { liczba: 3, jednostka: "" } } }];
    const blad = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<RecordList tytul="Lista bez jednostki" kolumny={KOLUMNY} wiersze={bezJednostki} pusty={PUSTY} />),
    ).toThrow();
    blad.mockRestore();
  });

  it("nazwa jest pierwsza w wierszu, a plakietka stoi w kolumnie stanu, nie przed nazwą", () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const wiersz = wierszeDanych()[0];
    const komorki = within(wiersz).getAllByRole("cell");
    expect(komorki[0]).toHaveTextContent("Podstawy pomocy");
    expect(komorki[0]).not.toHaveTextContent("Opublikowany");
    const nazwa = within(wiersz).getByText("Podstawy pomocy");
    const plakietka = within(komorkaKolumny(wiersz, "Stan")).getByText("Opublikowany");
    expect(nazwa.compareDocumentPosition(plakietka) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("akcja stoi w ostatniej komórce: odnośnik albo przycisk, z pełną nazwą dla czytnika", async () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const [pierwszy, drugi] = wierszeDanych();
    const odnosnik = within(komorkaKolumny(pierwszy, "Akcja")).getByRole("link", { name: "Otwórz kurs: Podstawy pomocy" });
    expect(odnosnik).toHaveAttribute("href", "/admin/kursy/1");
    expect(odnosnik).toHaveTextContent("Otwórz ›");
    expect(within(pierwszy).getAllByRole("cell").at(-1)).toContainElement(odnosnik);
    const przycisk = within(komorkaKolumny(drugi, "Akcja")).getByRole("button", { name: /Edytuj/ });
    expect(przycisk).toHaveTextContent("Edytuj ›");
    await userEvent.click(przycisk);
    expect(edytuj).toHaveBeenCalledTimes(1);
  });

  it("stopka „Razem” stoi w kolumnie liczb wierszy", () => {
    const kolumny: KolumnaRecordList[] = [
      { nazwa: "Kolejka", rodzaj: "tekst" },
      { nazwa: "Stan", rodzaj: "stan" },
      { nazwa: "Liczba", rodzaj: "liczba" },
      { nazwa: "Akcja", rodzaj: "akcja" },
    ];
    render(
      <RecordList
        tytul="Lista kursów"
        kolumny={kolumny}
        jednostkaSumy={(liczba) => (liczba === 1 ? "sprawa" : "spraw")}
        wiersze={[
          { id: "a", tytul: "Zgłoszenia", wartosc: 5, akcja: { etykieta: "Otwórz", href: "/a" } },
          { id: "b", tytul: "Dyżury", wartosc: 1, akcja: { etykieta: "Otwórz", href: "/b" } },
        ]}
        pusty={PUSTY}
      />,
    );
    const wiersze = wierszeDanych();
    expect(wiersze).toHaveLength(3);
    expect(komorkaKolumny(wiersze[0], "Liczba")).toHaveTextContent(/5\s*spraw$/);
    expect(komorkaKolumny(wiersze[1], "Liczba")).toHaveTextContent(/1\s*sprawa$/);
    const stopka = wiersze[2];
    expect(komorkaKolumny(stopka, "Kolejka")).toHaveTextContent("Razem");
    expect(komorkaKolumny(stopka, "Liczba")).toHaveTextContent(/^6\s*spraw$/);
    expect(komorkaKolumny(stopka, "Stan")).toBeEmptyDOMElement();
    expect(komorkaKolumny(stopka, "Akcja")).toBeEmptyDOMElement();
  });

  it("wiersz bez akcji: pusta komórka akcji, żadnego odnośnika ani przycisku", () => {
    render(
      <RecordList
        tytul="Lista kursów"
        kolumny={KOLUMNY}
        wiersze={[{ id: "x", tytul: "Pytania bez odpowiedzi", podpowiedz: "odpowiada prowadzący" }, WIERSZE[0]]}
        pusty={PUSTY}
      />,
    );
    const [bezAkcji, zAkcja] = wierszeDanych();
    expect(komorkaKolumny(bezAkcji, "Akcja")).toBeEmptyDOMElement();
    expect(within(bezAkcji).queryByRole("link")).toBeNull();
    expect(within(bezAkcji).queryByRole("button")).toBeNull();
    expect(komorkaKolumny(bezAkcji, "Kurs")).toHaveTextContent("odpowiada prowadzący");
    expect(within(zAkcja).getByRole("link")).toBeInTheDocument();
  });

  it("wiersz z panelem: panel w następnym wierszu na szerokość wszystkich kolumn, otwarty wiersz bez akcji", () => {
    render(
      <RecordList
        tytul="Lista kursów"
        kolumny={KOLUMNY}
        wiersze={[{ ...WIERSZE[0], panel: <p>Panel decyzji</p> }, WIERSZE[1]]}
        pusty={PUSTY}
      />,
    );
    const wszystkie = within(tabela()).getAllByRole("row").slice(1);
    const [otwarty, panel, zamkniety] = wszystkie;
    expect(wszystkie).toHaveLength(3);
    expect(within(otwarty).queryByRole("link")).toBeNull();
    expect(within(otwarty).getAllByRole("cell").at(-1)).toBeEmptyDOMElement();
    const komorkiPanelu = within(panel).getAllByRole("cell");
    expect(komorkiPanelu).toHaveLength(1);
    expect(komorkiPanelu[0]).toHaveAttribute("aria-colspan", String(KOLUMNY.length));
    expect(komorkiPanelu[0]).toHaveTextContent("Panel decyzji");
    expect(within(zamkniety).getByRole("button", { name: /Edytuj/ })).toBeInTheDocument();
    expect(otwarty).toHaveAttribute("data-wiersz", "1");
  });

  it("podpowiedź tylko dla czytnika zostaje w komórce nazwy; druga część tytułu stoi pod nazwą", () => {
    render(
      <RecordList
        tytul="Lista kursów"
        kolumny={KOLUMNY}
        wiersze={[
          { ...WIERSZE[0], tytulDodatek: "Marta Demo", podpowiedz: "Czeka od 1 września", podpowiedzTylkoDlaCzytnika: true },
        ]}
        pusty={PUSTY}
      />,
    );
    const nazwa = komorkaKolumny(wierszeDanych()[0], "Kurs");
    expect(nazwa).toHaveTextContent("Marta Demo");
    expect(nazwa).toHaveTextContent("Czeka od 1 września");
  });

  it("lista pusta w trybie kolumn pokazuje stan pusty, bez tabeli", () => {
    render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={[]} pusty={PUSTY} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "Brak" })).toBeInTheDocument();
  });

  it("karta listy: klasa karty tylko z `naKarcie`, osobno dla nagłówka widocznego i ukrytego", () => {
    const { rerender } = render(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} />);
    const sekcja = () => screen.getByRole("region", { name: "Lista kursów" });
    expect(sekcja().className).not.toMatch(/karta/);
    rerender(<RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} naKarcie />);
    expect(sekcja().className).toMatch(/kartaZNaglowkiem/);
    rerender(
      <RecordList tytul="Lista kursów" kolumny={KOLUMNY} wiersze={WIERSZE} pusty={PUSTY} naKarcie naglowekTylkoDlaCzytnika />,
    );
    expect(sekcja().className).toMatch(/kartaBezNaglowka/);
    expect(sekcja().className).not.toMatch(/kartaZNaglowkiem/);
  });
});
