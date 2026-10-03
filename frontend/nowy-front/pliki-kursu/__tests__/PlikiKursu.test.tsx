import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";

const downloadFile = vi.fn();

vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...args: unknown[]) => downloadFile(...args) }));

const { ApiError } = await import("@/lib/api/klient");
const { PlikiKursu } = await import("../PlikiKursu");
const { PlikiLekcji } = await import("../PlikiLekcji");
const { ZDANIE_BLEDU_POBRANIA } = await import("../ListaPlikow");

import type { LekcjaKursuPlikow, PlikKursu } from "../dane";

const LEKCJE: LekcjaKursuPlikow[] = [
  { id: 22, title: "Pytania otwarte i zamknięte", sequence_order: 2 },
  { id: 21, title: "Wprowadzenie do wywiadu", sequence_order: 1 },
  { id: 23, title: "Ćwiczenie w parach", sequence_order: 3 },
];

function plik(id: number, lesson_id: number | null, name: string, size: number | null = 245760): PlikKursu {
  return { id, name, size, lesson_id, download_url: `https://api.test/pobierz/${id}` };
}

const PLIKI: PlikKursu[] = [
  plik(1, 22, "Slajdy.pdf", 1048576),
  plik(2, 21, "Karta pracy.pdf"),
  plik(3, null, "Regulamin kursu.pdf", 512),
  plik(4, 22, "Scenariusz.docx", 3 * 1024 * 1024 + 300 * 1024),
];

beforeEach(() => {
  downloadFile.mockReset();
});

async function sprawdzAxe(kontener: HTMLElement) {
  const wynik = await axe.run(kontener, { rules: { "color-contrast": { enabled: false } } });
  expect(wynik.violations.map((naruszenie) => `${naruszenie.id}: ${naruszenie.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("PlikiKursu — sekcja „Pliki do pobrania” na stronie kursu", () => {
  it("nagłówki: sekcja, potem grupy lekcji w kolejności lekcji; grupy „Pliki kursu” nie ma", () => {
    render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={PLIKI} />);

    expect(screen.getByRole("heading", { level: 2, name: "Pliki do pobrania" })).toBeInTheDocument();
    const grupy = screen.getAllByRole("heading", { level: 3 }).map((naglowek) => naglowek.textContent);
    expect(grupy).toEqual(["Lekcja 1. Wprowadzenie do wywiadu", "Lekcja 2. Pytania otwarte i zamknięte"]);
    expect(screen.queryByRole("heading", { name: "Pliki kursu" })).toBeNull();
  });

  it("nagłówek grupy to link do lekcji z kursem w adresie", () => {
    render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={PLIKI} />);

    expect(screen.getByRole("link", { name: "Lekcja 1. Wprowadzenie do wywiadu" })).toHaveAttribute(
      "href",
      "/panel/lekcje/21?kurs=wywiad-psychologiczny",
    );
    expect(screen.getByRole("link", { name: "Lekcja 2. Pytania otwarte i zamknięte" })).toHaveAttribute(
      "href",
      "/panel/lekcje/22?kurs=wywiad-psychologiczny",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("pliki stoją pod swoją grupą, w kolejności z odpowiedzi", () => {
    render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={PLIKI} />);

    const listy = screen.getAllByRole("list");
    expect(listy).toHaveLength(2);
    const nazwy = listy.map((lista) =>
      within(lista)
        .getAllByRole("listitem")
        .map((pozycja) => within(pozycja).getByRole("button").getAttribute("aria-label")),
    );
    expect(nazwy).toEqual([
      ["Pobierz plik: Karta pracy.pdf"],
      ["Pobierz plik: Slajdy.pdf", "Pobierz plik: Scenariusz.docx"],
    ]);
  });

  it("plik bez lekcji (lesson_id: null) nie jest pokazany ani pod żadnym nagłówkiem, ani w żadnej liście", () => {
    const { container } = render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={PLIKI} />);

    expect(screen.queryByText("Regulamin kursu.pdf")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pobierz plik: Regulamin kursu.pdf" })).toBeNull();
    expect(container.textContent).not.toContain("Regulamin kursu");
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("rozmiar po ludzku obok rodzaju pliku", () => {
    render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={PLIKI} />);

    // Testing Library zwija spacje nierozdzielające do zwykłych.
    expect(screen.getByText(`PDF · 240 KB`)).toBeInTheDocument();
    expect(screen.getByText(`PDF · 1,0 MB`)).toBeInTheDocument();
    expect(screen.getByText(`DOCX · 3,3 MB`)).toBeInTheDocument();
    expect(screen.queryByText(`PDF · 512 B`)).toBeNull();
  });

  it("kurs bez plików: sekcji nie ma (nie ma nagłówka, listy ani pustego opisu)", () => {
    const { container } = render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("kurs z samymi plikami bez lekcji: sekcji nie ma", () => {
    const { container } = render(
      <PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={[plik(3, null, "Regulamin kursu.pdf")]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("plik wskazujący lekcję, której nie ma w kursie, też nie jest pokazany", () => {
    const { container } = render(
      <PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={[plik(3, 999, "Obcy plik.pdf")]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("nazwa pliku ze znakami specjalnymi jest tekstem, nie HTML", () => {
    const zlosliwa = `<img src=x onerror="window.__wykonano=1"> & <b>pogrubione</b>.pdf`;
    const { container } = render(
      <PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={[plik(9, 21, zlosliwa)]} />,
    );

    expect(screen.getByText(zlosliwa)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect((window as unknown as { __wykonano?: number }).__wykonano).toBeUndefined();
    expect(screen.getByRole("button", { name: `Pobierz plik: ${zlosliwa}` })).toBeInTheDocument();
  });

  it("tytuł lekcji ze znakami specjalnymi jest tekstem w nagłówku grupy", () => {
    const tytul = `Lekcja <script>alert(1)</script> & "cudzysłów"`;
    const { container } = render(
      <PlikiKursu
        slugKursu="wywiad-psychologiczny"
        lekcje={[{ id: 21, title: tytul, sequence_order: 1 }]}
        pliki={[plik(1, 21, "a.pdf")]}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(`Lekcja 1. ${tytul}`);
  });

  it("długa nazwa bez spacji: pełna nazwa jest w DOM i w nazwie przycisku", () => {
    const dluga = `${"Psychologicznodiagnostycznoterapeutyczny".repeat(4)}.pdf`;
    render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={[plik(1, 21, dluga)]} />);

    expect(screen.getByText(dluga)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Pobierz plik: ${dluga}` })).toBeInTheDocument();
  });

  it("axe: brak naruszeń na liście z dwiema grupami", async () => {
    const { container } = render(<PlikiKursu slugKursu="wywiad-psychologiczny" lekcje={LEKCJE} pliki={PLIKI} />);

    await sprawdzAxe(container);
  });
});

describe("PlikiLekcji — karta „Pliki do pobrania” na ekranie lekcji", () => {
  it("pokazuje podane pliki, a bez plików nic nie renderuje", () => {
    const { container, rerender } = render(<PlikiLekcji pliki={[plik(1, 21, "Karta pracy.pdf"), plik(2, 21, "Slajdy.pdf")]} />);

    expect(screen.getByRole("heading", { level: 2, name: "Pliki do pobrania" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    rerender(<PlikiLekcji pliki={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("axe: brak naruszeń", async () => {
    const { container } = render(<PlikiLekcji pliki={[plik(1, 21, "Karta pracy.pdf")]} />);

    await sprawdzAxe(container);
  });
});

describe("pobieranie z listy plików", () => {
  it("kliknięcie pobiera plik pod jego nazwą i nie pokazuje błędu", async () => {
    downloadFile.mockResolvedValue(undefined);
    render(<PlikiLekcji pliki={[plik(1, 21, "Karta pracy.pdf")]} />);

    await userEvent.click(screen.getByRole("button", { name: "Pobierz plik: Karta pracy.pdf" }));

    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith("https://api.test/pobierz/1", "Karta pracy.pdf"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("wygasły link: ponowne pobranie danych, świeży link, bez zdania błędu", async () => {
    downloadFile
      .mockRejectedValueOnce(new ApiError({ status: 403, code: "link_expired", message: "Wygasł." }))
      .mockResolvedValueOnce(undefined);
    const odswiez = vi.fn().mockResolvedValue([{ ...plik(1, 21, "Karta pracy.pdf"), download_url: "https://api.test/swiezy" }]);
    render(<PlikiLekcji pliki={[plik(1, 21, "Karta pracy.pdf")]} odswiez={odswiez} />);

    await userEvent.click(screen.getByRole("button", { name: "Pobierz plik: Karta pracy.pdf" }));

    await waitFor(() => expect(downloadFile).toHaveBeenLastCalledWith("https://api.test/swiezy", "Karta pracy.pdf"));
    expect(odswiez).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("po drugiej porażce zdanie błędu stoi przy tym pliku, a drugi plik jest nietknięty", async () => {
    downloadFile.mockRejectedValue(new ApiError({ status: 403, code: "link_expired", message: "Wygasł." }));
    const odswiez = vi.fn().mockResolvedValue([plik(1, 21, "Karta pracy.pdf")]);
    render(<PlikiLekcji pliki={[plik(1, 21, "Karta pracy.pdf"), plik(2, 21, "Slajdy.pdf")]} odswiez={odswiez} />);

    await userEvent.click(screen.getByRole("button", { name: "Pobierz plik: Karta pracy.pdf" }));

    const komunikat = await screen.findByRole("alert");
    expect(komunikat).toHaveTextContent(ZDANIE_BLEDU_POBRANIA);
    const pozycje = screen.getAllByRole("listitem");
    expect(within(pozycje[0]).getByRole("alert")).toBe(komunikat);
    expect(within(pozycje[1]).queryByRole("alert")).toBeNull();
    expect(downloadFile).toHaveBeenCalledTimes(2);
  });
});
