import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KartaNagrania, type WlasciwosciKartyNagrania } from "../KartaNagrania";
import type { StanKartyNagrania } from "../nagranie";

/**
 * Karta „Nagranie” dla stanów, które podaje serwer: plik wysyłany skądinąd,
 * wymiana (dotychczasowe gra, nowe w drodze albo z błędem), podgląd gotowego
 * nagrania oraz zdania zależne od tego, czy serwer podaje stan nagrania.
 */

const GOTOWE = { rodzaj: "gotowe", czasSekundy: 125 } as const;
const ZDANIE_ODSWIEZANIA = "Stan nagrania odświeża się tutaj sam, dopóki ta karta przeglądarki jest otwarta.";

function karta(stan: StanKartyNagrania, reszta: Partial<WlasciwosciKartyNagrania> = {}) {
  const wynik = render(
    <KartaNagrania
      id="proba"
      stan={stan}
      powodBrakuWysylania={null}
      niezapisanyTekst={false}
      serwerZnaStan
      onWybierzPlik={vi.fn()}
      {...reszta}
    />,
  );
  const sekcja = screen.getByRole("heading", { level: 2, name: "Nagranie" }).closest("section") as HTMLElement;
  return { ...wynik, sekcja };
}

function wejsciePliku(kontener: HTMLElement): HTMLInputElement | null {
  return kontener.querySelector<HTMLInputElement>('input[type="file"]');
}

describe("plik wysyłany z innej karty przeglądarki albo urządzenia", () => {
  it("zdanie o wysyłaniu skądinąd, bieżący etap pierwszy, bez paska postępu; pole wyboru zostaje", () => {
    const { sekcja, container } = karta({ rodzaj: "wysylane" });
    expect(within(sekcja).getByText("Nagranie jest wysyłane z innej karty przeglądarki albo z innego urządzenia.")).toBeInTheDocument();
    const etapy = within(within(sekcja).getByRole("list", { name: "Etapy" })).getAllByRole("listitem");
    expect(etapy.map((etap) => etap.getAttribute("aria-current"))).toEqual(["step", null, null]);
    expect(within(sekcja).queryByRole("progressbar")).toBeNull();
    expect(within(sekcja).getByText(ZDANIE_ODSWIEZANIA)).toBeInTheDocument();
    expect(within(sekcja).getByText("Wyślij nagranie stąd")).toBeInTheDocument();
    expect(wejsciePliku(container)).not.toBeNull();
    expect(sekcja.querySelector('[data-stan-nagrania="wysylane"]')).not.toBeNull();
  });
});

describe("przetwarzanie", () => {
  it("serwer podaje stan: karta mówi, że stan odświeża się sam", () => {
    const { sekcja } = karta({ rodzaj: "przetwarzanie" });
    expect(within(sekcja).getByText("Przetwarzanie trwa zwykle 10–30 minut.")).toBeInTheDocument();
    expect(within(sekcja).getByText(ZDANIE_ODSWIEZANIA)).toBeInTheDocument();
    expect(sekcja.textContent).not.toMatch(/po ponownym otwarciu lekcji/);
  });

  it("serwer bez pól stanu: zdanie o ponownym otwarciu lekcji, jak dotąd", () => {
    const { sekcja } = karta({ rodzaj: "przetwarzanie" }, { serwerZnaStan: false });
    expect(within(sekcja).getByText("Gotowe nagranie zobaczysz tutaj po ponownym otwarciu lekcji.")).toBeInTheDocument();
    expect(sekcja.textContent).not.toMatch(/odświeża się/);
  });
});

describe("gotowe", () => {
  it("serwer podaje stan: wybór nowego pliku nie odbiera uczestnikom obecnego nagrania", () => {
    const { sekcja } = karta(GOTOWE);
    expect(within(sekcja).getByText("Uczestnicy będą oglądać obecne nagranie, dopóki nowe nie będzie gotowe.")).toBeInTheDocument();
    expect(sekcja.textContent).not.toMatch(/od razu przestaną widzieć/);
  });

  it("podgląd z odpowiedzi: odnośnik otwierany w nowej karcie przeglądarki; bez adresu — bez odnośnika", () => {
    const zPodgladem = karta({ ...GOTOWE, podglad: "https://podglad.atrapa.test/osadzenie" });
    const odnosnik = within(zPodgladem.sekcja).getByRole("link", { name: "Otwórz podgląd nagrania w nowej karcie przeglądarki" });
    expect(odnosnik).toHaveAttribute("href", "https://podglad.atrapa.test/osadzenie");
    expect(odnosnik).toHaveAttribute("target", "_blank");
    expect(odnosnik).toHaveAttribute("rel", "noopener noreferrer");
    zPodgladem.unmount();

    const bezPodgladu = karta({ ...GOTOWE, podglad: null });
    expect(within(bezPodgladu.sekcja).queryByRole("link")).toBeNull();
  });
});

describe("wymiana: uczestnicy oglądają dotychczasowe nagranie", () => {
  it("nowe się przetwarza: zdanie wprost, czas dotychczasowego, bez pola wyboru i bez zdania błędu", () => {
    const { sekcja, container } = karta({ ...GOTOWE, nowe: "przetwarzanie" });
    expect(sekcja).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 2 min 5 s.");
    expect(
      within(sekcja).getByText(
        "Uczestnicy oglądają dotychczasowe nagranie. Nowe nagranie się przetwarza – zwykle 10–30 minut – i zastąpi dotychczasowe samo, gdy będzie gotowe.",
      ),
    ).toBeInTheDocument();
    expect(within(sekcja).getByText(ZDANIE_ODSWIEZANIA)).toBeInTheDocument();
    expect(wejsciePliku(container)).toBeNull();
    expect(sekcja.querySelector('[data-stan-nagrania="gotowe"][data-nowe-nagranie="przetwarzanie"]')).not.toBeNull();
  });

  it("nowe jest wysyłane skądinąd: zdanie wprost i pole „Wyślij nagranie stąd”", () => {
    const { sekcja, container } = karta({ ...GOTOWE, nowe: "wysylanie" });
    expect(
      within(sekcja).getByText(
        "Uczestnicy oglądają dotychczasowe nagranie. Nowe nagranie jest wysyłane i zastąpi dotychczasowe samo, gdy będzie gotowe.",
      ),
    ).toBeInTheDocument();
    expect(within(sekcja).getByText("Wyślij nagranie stąd")).toBeInTheDocument();
    expect(wejsciePliku(container)).not.toBeNull();
  });

  it("nowe skończyło się błędem: dotychczasowe zostaje, karta prosi o ponowne wysłanie nowego", () => {
    const { sekcja, container } = karta({ ...GOTOWE, nowe: "blad" });
    expect(sekcja).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 2 min 5 s.");
    expect(
      within(sekcja).getByText("Nowe nagranie nie zostało przetworzone. Uczestnicy nadal oglądają dotychczasowe nagranie."),
    ).toBeInTheDocument();
    expect(within(sekcja).getByText("Wyślij nowe nagranie ponownie")).toBeInTheDocument();
    expect(within(sekcja).getByText("Dotychczasowe nagranie zostaje, dopóki nowe nie będzie gotowe.")).toBeInTheDocument();
    expect(wejsciePliku(container)).not.toBeNull();
    expect(sekcja.textContent).not.toMatch(/Przetwarzanie nagrania zakończyło się błędem/);
  });

  it("zwykłe gotowe nagranie nie mówi o nowym ani o dotychczasowym", () => {
    const { sekcja } = karta(GOTOWE);
    expect(sekcja.textContent).not.toMatch(/dotychczasowe|Nowe nagranie/);
    expect(sekcja.querySelector("[data-nowe-nagranie]")).toBeNull();
  });
});
