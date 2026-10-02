import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KartaNagrania, type WlasciwosciKartyNagrania } from "../KartaNagrania";
import type { StanKartyNagrania } from "../nagranie";

/**
 * Karta „Nagranie” — jeden komponent, każdy stan osobno: brak, wysyłanie,
 * przerwane, przetwarzanie, gotowe, błąd oraz zdanie o wymianie poprzedniego
 * nagrania. Karta nie zna sieci, więc stan, którego strona lekcji dziś nie
 * ustawia (wymiana z zachowaniem poprzedniego nagrania), ma tu pełne pokrycie.
 */

const MB = 1024 * 1024;

const WYSYLANIE: StanKartyNagrania = { rodzaj: "wysylanie", nazwa: "wywiad.mp4", rozmiar: 1000 * MB, wyslano: 620 * MB, zostaloSekund: 240 };
const PRZERWANE: StanKartyNagrania = { rodzaj: "przerwane", nazwa: "wywiad.mp4", rozmiar: 1000 * MB, wyslano: 480 * MB, innyPlik: false };

function karta(stan: StanKartyNagrania, reszta: Partial<WlasciwosciKartyNagrania> = {}) {
  const onWybierzPlik = vi.fn();
  const wynik = render(
    <KartaNagrania
      id="proba"
      stan={stan}
      powodBrakuWysylania={null}
      niezapisanyTekst={false}
      onWybierzPlik={onWybierzPlik}
      {...reszta}
    />,
  );
  const sekcja = screen.getByRole("heading", { level: 2, name: "Nagranie" }).closest("section") as HTMLElement;
  return { ...wynik, sekcja, onWybierzPlik };
}

function wejsciePliku(kontener: HTMLElement): HTMLInputElement | null {
  return kontener.querySelector<HTMLInputElement>('input[type="file"]');
}

describe("karta nagrania: nagłówek", () => {
  it("każdy stan stoi w tej samej karcie z dopiskiem „Zapisuje się samo” i nazwą stanu w atrybucie", () => {
    const stany: StanKartyNagrania[] = [
      { rodzaj: "brak" },
      { rodzaj: "nieznany" },
      WYSYLANIE,
      PRZERWANE,
      { rodzaj: "przetwarzanie" },
      { rodzaj: "gotowe", czasSekundy: 125 },
      { rodzaj: "blad", zdanie: "Błąd." },
    ];
    for (const stan of stany) {
      const { sekcja, unmount } = karta(stan);
      expect(within(sekcja).getByText("Zapisuje się samo")).toBeInTheDocument();
      expect(sekcja.querySelector(`[data-stan-nagrania="${stan.rodzaj}"]`)).not.toBeNull();
      expect(sekcja.textContent).not.toMatch(/stron/i);
      unmount();
    }
  });
});

describe("stan: brak nagrania", () => {
  it("zdanie o braku i pole wyboru pliku; wybór pliku trafia do ekranu", async () => {
    const uzytkownik = userEvent.setup();
    const { sekcja, container, onWybierzPlik } = karta({ rodzaj: "brak" });
    expect(within(sekcja).getByText("Ta lekcja nie ma jeszcze nagrania.")).toBeInTheDocument();
    expect(within(sekcja).queryByRole("progressbar")).toBeNull();
    await uzytkownik.upload(wejsciePliku(container)!, new File(["1"], "n.mp4", { type: "video/mp4" }));
    expect(onWybierzPlik).toHaveBeenCalledTimes(1);
  });

  it("rola bez prawa wysyłania: zdanie z powodem zamiast pola wyboru", () => {
    const { sekcja, container } = karta({ rodzaj: "brak" }, { powodBrakuWysylania: "Nagranie może wgrać Opiekun Projektu albo Super Admin." });
    expect(within(sekcja).getByText("Nagranie może wgrać Opiekun Projektu albo Super Admin.")).toBeInTheDocument();
    expect(wejsciePliku(container)).toBeNull();
  });

  it("odmowa wyboru pliku stoi pod polem wyboru", () => {
    const { sekcja } = karta({ rodzaj: "brak" }, { bladWyboru: "Wybierz plik wideo." });
    expect(within(sekcja).getByText("Wybierz plik wideo.")).toBeInTheDocument();
  });

  it("stan nieznany: zdanie o nieudanym sprawdzeniu, pole wyboru zostaje", () => {
    const { sekcja, container } = karta({ rodzaj: "nieznany" });
    expect(within(sekcja).getByText("Nie udało się sprawdzić stanu nagrania.")).toBeInTheDocument();
    expect(wejsciePliku(container)).not.toBeNull();
  });
});

describe("stan: wysyłanie", () => {
  it("plik z rozmiarem, trzy etapy z bieżącym pierwszym, pasek z procentem i szacunkiem", () => {
    const { sekcja, container } = karta(WYSYLANIE);
    expect(within(sekcja).getByText("wywiad.mp4")).toBeInTheDocument();
    expect(sekcja).toHaveTextContent("· 1000 MB");
    const etapy = within(within(sekcja).getByRole("list", { name: "Etapy" })).getAllByRole("listitem");
    expect(etapy.map((etap) => etap.textContent)).toEqual(["1. Wysyłanie (teraz)", "2. Przetwarzanie", "3. Gotowe"]);
    expect(etapy.map((etap) => etap.getAttribute("aria-current"))).toEqual(["step", null, null]);
    const pasek = within(sekcja).getByRole("progressbar");
    expect(pasek).toHaveAttribute("aria-valuenow", "62");
    expect(pasek).toHaveAttribute("aria-label", "Wysyłanie nagrania");
    expect(pasek).toHaveAttribute("data-postep-wysylania", "trwa");
    expect(within(sekcja).getByText("62 % · zostało ok. 4 min")).toBeInTheDocument();
    expect(
      within(sekcja).getByText("Gdy wysyłanie dojdzie do 100 %, możesz wszystko zamknąć. Przetwarzanie trwa zwykle 10–30 minut."),
    ).toBeInTheDocument();
    expect(wejsciePliku(container)).toBeNull();
  });

  it("zdanie o przejściu do kursu i innych lekcji; bez prośby o zostanie w lekcji", () => {
    const { sekcja } = karta(WYSYLANIE);
    expect(
      within(sekcja).getByText("Możesz przejść do kursu i innych lekcji – wysyłanie trwa dalej, a postęp widać na liście lekcji."),
    ).toBeInTheDocument();
    expect(sekcja.textContent).not.toMatch(/Zostań w tej lekcji/);
  });

  it("zdanie o dokończeniu tym samym plikiem", () => {
    const { sekcja } = karta(WYSYLANIE);
    expect(
      within(sekcja).getByText(
        "Nie zamykaj karty przeglądarki do końca wysyłania. Jeśli się przerwie, wybierz ten sam plik – wysyłanie ruszy od miejsca, w którym stanęło.",
      ),
    ).toBeInTheDocument();
  });

  it("„Przerwij wysyłanie” jest tylko wtedy, gdy ekran umie przerwać, i nie jest przyciskiem głównym", async () => {
    const uzytkownik = userEvent.setup();
    const bez = karta(WYSYLANIE);
    expect(screen.queryByRole("button", { name: "Przerwij wysyłanie" })).toBeNull();
    bez.unmount();

    const onPrzerwij = vi.fn();
    karta(WYSYLANIE, { onPrzerwij });
    const przycisk = screen.getByRole("button", { name: "Przerwij wysyłanie" });
    expect(przycisk.className).not.toMatch(/primary/);
    await uzytkownik.click(przycisk);
    expect(onPrzerwij).toHaveBeenCalledTimes(1);
  });
});

describe("stan: przerwane", () => {
  it("zdanie z procentem i rozmiarami, prośba o ten sam plik, pole „Wybierz plik, żeby dokończyć”", () => {
    const { sekcja, container } = karta(PRZERWANE);
    expect(within(sekcja).getByText("Wysyłanie stanęło przy 48 % (480 MB z 1000 MB).")).toBeInTheDocument();
    expect(sekcja).toHaveTextContent("Wybierz ten sam plik: wywiad.mp4, 1000 MB, a wyślemy resztę.");
    const pasek = within(sekcja).getByRole("progressbar");
    expect(pasek).toHaveAttribute("aria-label", "Wysyłanie nagrania, przerwane");
    expect(pasek).toHaveAttribute("aria-valuenow", "48");
    expect(pasek).toHaveAttribute("data-postep-wysylania", "zatrzymany");
    expect(within(sekcja).getByText("Wybierz plik, żeby dokończyć")).toBeInTheDocument();
    expect(wejsciePliku(container)).not.toBeNull();
    expect(within(sekcja).queryByText("To nie jest ten sam plik")).toBeNull();
  });

  it("wybrany inny plik: zdanie „To nie jest ten sam plik”", () => {
    const { sekcja } = karta({ ...PRZERWANE, innyPlik: true });
    expect(within(sekcja).getByText("To nie jest ten sam plik")).toBeInTheDocument();
  });

  it("„Wyślij inny plik od nowa” nie jest przyciskiem głównym; po nim wybór pliku idzie drogą „od nowa”", async () => {
    const uzytkownik = userEvent.setup();
    const onOdNowa = vi.fn();
    const { sekcja, container, onWybierzPlik } = karta({ ...PRZERWANE, innyPlik: true }, { onOdNowa });
    const przycisk = screen.getByRole("button", { name: "Wyślij inny plik od nowa" });
    expect(przycisk.className).not.toMatch(/primary/);
    expect(przycisk).toHaveAttribute("aria-pressed", "false");
    await uzytkownik.click(przycisk);
    expect(przycisk).toHaveAttribute("aria-pressed", "true");
    expect(within(sekcja).getByText("Wybierz inny plik")).toBeInTheDocument();
    expect(within(sekcja).queryByText("Wybierz plik, żeby dokończyć")).toBeNull();
    expect(within(sekcja).queryByText("To nie jest ten sam plik")).toBeNull();
    await uzytkownik.upload(wejsciePliku(container)!, new File(["2"], "inny.mp4", { type: "video/mp4" }));
    expect(onOdNowa).toHaveBeenCalledTimes(1);
    expect(onWybierzPlik).not.toHaveBeenCalled();
  });

  it("bez „od nowa” wybór pliku idzie drogą dokończenia", async () => {
    const uzytkownik = userEvent.setup();
    const onOdNowa = vi.fn();
    const { container, onWybierzPlik } = karta(PRZERWANE, { onOdNowa });
    await uzytkownik.upload(wejsciePliku(container)!, new File(["1"], "wywiad.mp4", { type: "video/mp4" }));
    expect(onWybierzPlik).toHaveBeenCalledTimes(1);
    expect(onOdNowa).not.toHaveBeenCalled();
  });
});

describe("stan: przetwarzanie", () => {
  it("bez paska postępu; bieżący etap drugi; czas przetwarzania", () => {
    const { sekcja, container } = karta({ rodzaj: "przetwarzanie" });
    expect(within(sekcja).queryByRole("progressbar")).toBeNull();
    const etapy = within(within(sekcja).getByRole("list", { name: "Etapy" })).getAllByRole("listitem");
    expect(etapy.map((etap) => etap.getAttribute("aria-current"))).toEqual([null, "step", null]);
    expect(within(sekcja).getByText("Przetwarzanie trwa zwykle 10–30 minut.")).toBeInTheDocument();
    expect(wejsciePliku(container)).toBeNull();
  });

  it("„możesz wszystko zamknąć” tylko wtedy, gdy nie ma niezapisanego tekstu", () => {
    const zapisane = karta({ rodzaj: "przetwarzanie" });
    expect(within(zapisane.sekcja).getByText("Możesz wszystko zamknąć – nagranie przetworzy się samo.")).toBeInTheDocument();
    zapisane.unmount();

    const niezapisane = karta({ rodzaj: "przetwarzanie" }, { niezapisanyTekst: true });
    expect(niezapisane.sekcja.textContent).not.toMatch(/ożesz wszystko zamknąć/);
    expect(
      within(niezapisane.sekcja).getByText("Zapisz tekst lekcji, zanim zamkniesz kartę przeglądarki. Nagranie przetworzy się samo."),
    ).toBeInTheDocument();
  });

  it("nie ma „sprawdź ponownie”", () => {
    const { sekcja } = karta({ rodzaj: "przetwarzanie" });
    expect(sekcja.textContent).not.toMatch(/sprawdź ponownie/i);
    expect(within(sekcja).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("stan: gotowe", () => {
  it("czas trwania i pole „Wyślij inne nagranie” z uczciwym zdaniem o skutku", () => {
    const { sekcja, container } = karta({ rodzaj: "gotowe", czasSekundy: 125 });
    expect(sekcja).toHaveTextContent("Nagranie jest gotowe. Czas trwania: 2 min 5 s.");
    expect(within(sekcja).getByText("Wyślij inne nagranie")).toBeInTheDocument();
    expect(
      within(sekcja).getByText(
        "Po wybraniu pliku uczestnicy od razu przestaną widzieć obecne nagranie. Nowe zobaczą, gdy będzie gotowe.",
      ),
    ).toBeInTheDocument();
    expect(wejsciePliku(container)).not.toBeNull();
  });
});

describe("stan: błąd", () => {
  it("zdanie błędu i „Wyślij ponownie”; bez „sprawdź ponownie”", () => {
    const { sekcja, container } = karta({ rodzaj: "blad", zdanie: "Przetwarzanie nagrania zakończyło się błędem." });
    expect(within(sekcja).getByText("Przetwarzanie nagrania zakończyło się błędem.")).toBeInTheDocument();
    expect(within(sekcja).getByText("Wyślij ponownie")).toBeInTheDocument();
    expect(sekcja.textContent).not.toMatch(/sprawdź ponownie/i);
    expect(wejsciePliku(container)).not.toBeNull();
  });
});

describe("wymiana nagrania", () => {
  it("poprzednie odpięte od razu: zdanie mówi, że uczestnicy już go nie widzą", () => {
    const { sekcja } = karta(WYSYLANIE, { wymiana: "podmienia-od-razu" });
    expect(
      within(sekcja).getByText("Uczestnicy nie widzą już poprzedniego nagrania. Nowe zobaczą, gdy będzie gotowe."),
    ).toBeInTheDocument();
  });

  it("poprzednie zachowane do gotowości nowego: zdanie o zastąpieniu samym i o niepowodzeniu", () => {
    for (const stan of [WYSYLANIE, PRZERWANE, { rodzaj: "przetwarzanie" } as StanKartyNagrania]) {
      const { sekcja, unmount } = karta(stan, { wymiana: "zachowuje-poprzednie" });
      expect(
        within(sekcja).getByText(
          "Uczestnicy oglądają dotychczasowe nagranie. Nowe zastąpi je samo, gdy będzie gotowe. Jeśli się nie uda, zostanie dotychczasowe.",
        ),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("lekcja bez poprzedniego nagrania: karta o wymianie milczy", () => {
    const { sekcja } = karta(WYSYLANIE);
    expect(sekcja.textContent).not.toMatch(/poprzednie/);
  });
});
