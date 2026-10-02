import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { POCHODZENIE_ODTWARZACZA } from "../../../lib/konfiguracja/odtwarzacz-nagran";
import type { PostepNagrania } from "@/design-system/organizmy/RecordingPlayer/RecordingPlayer";
import type { ZrodloNagrania } from "../dane";
import { OdtwarzaczNagrania } from "../odtwarzacz/OdtwarzaczNagrania";
import { ADRES_RAMKI, dalejRamka, graRamka, komunikatRamki, ramkaOdtwarzacza, zdarzenieRamki, zrodloRamki } from "./pomoce";

/**
 * Punkt odtwarzacza ekranu lekcji: obudowa organizmu ramki. Ramka to atrapa — jsdom nie wczytuje
 * adresu, a komunikaty ramki są wysyłane z testu z pochodzeniem i oknem ramki.
 */

const TERAZ = Date.parse("2026-10-02T08:00:00Z");

interface Zloz {
  zrodlo?: ZrodloNagrania;
  pozycjaStartowaSekundy?: number;
  odswiezLink?: () => Promise<ZrodloNagrania | null>;
}

function zloz({ zrodlo = zrodloRamki(), pozycjaStartowaSekundy = 0, odswiezLink }: Zloz = {}) {
  const wlasciwosci = {
    tytul: "Rozpoznawanie kryzysu psychicznego",
    zrodlo,
    czasTrwaniaSekund: 1200,
    pozycjaStartowaSekundy,
    odswiezLink: odswiezLink ?? vi.fn<() => Promise<ZrodloNagrania | null>>(async () => null),
    onPostep: vi.fn<(postep: PostepNagrania) => void>(),
    onZmianaOdtwarzania: vi.fn<(odtwarza: boolean) => void>(),
    onZmianaPozycji: vi.fn<(pozycjaSekund: number) => void>(),
    onBlad: vi.fn<() => void>(),
  };
  const wynik = render(<OdtwarzaczNagrania {...wlasciwosci} />);
  return { ...wynik, wlasciwosci };
}

/** Źródło wygasające za `sekundy` od chwili zegara sztucznego. */
function wygasaZa(sekundy: number, adres: string = ADRES_RAMKI): ZrodloNagrania {
  return zrodloRamki({ adresOsadzenia: adres, osadzenieWygasaO: Math.floor(TERAZ / 1000) + sekundy });
}

function uplyw(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

async function rozstrzygnij() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.setSystemTime(TERAZ);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("obudowa odtwarzacza — ramka i wznowienie", () => {
  it("ramka z adresem osadzenia i tytułem lekcji; bez zdania o wznowieniu od początku nagrania", () => {
    zloz();

    const ramka = ramkaOdtwarzacza();
    expect(ramka).not.toBeNull();
    expect(ramka).toHaveAttribute("src", ADRES_RAMKI);
    expect(ramka).toHaveAttribute("title", "Nagranie lekcji: Rozpoznawanie kryzysu psychicznego");
    expect(screen.queryByText(/Ostatnio zatrzymano/)).toBeNull();
  });

  it("z pozycją startową: zdanie o miejscu przerwania i „Odtwórz od początku”; zdanie znika po starcie", () => {
    zloz({ pozycjaStartowaSekundy: 720 });

    expect(screen.getByText(/Ostatnio zatrzymano w 12\. minucie\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odtwórz od początku" })).toBeInTheDocument();
    zdarzenieRamki("ready");
    zdarzenieRamki("play");
    expect(screen.queryByText(/Ostatnio zatrzymano/)).toBeNull();
  });

  it("„Odtwórz od początku”: zgłasza powrót na początek, wymienia ramkę i nie ustawia miejsca w nowej", () => {
    const { wlasciwosci } = zloz({ pozycjaStartowaSekundy: 720 });
    const pierwsza = ramkaOdtwarzacza();

    fireEvent.click(screen.getByRole("button", { name: "Odtwórz od początku" }));

    expect(wlasciwosci.onZmianaPozycji).toHaveBeenCalledWith(0);
    expect(screen.queryByText(/Ostatnio zatrzymano/)).toBeNull();
    const druga = ramkaOdtwarzacza();
    expect(druga).not.toBeNull();
    expect(druga).not.toBe(pierwsza);
    const wyslane = vi.spyOn(druga!.contentWindow as Window, "postMessage");
    zdarzenieRamki("ready");
    const polecenia = wyslane.mock.calls.map(([tresc]) => String(tresc));
    expect(polecenia.some((tresc) => tresc.includes("setCurrentTime"))).toBe(false);
  });
});

describe("obudowa odtwarzacza — czas i koniec nagrania z komunikatów ramki", () => {
  it("postęp i zmiany odtwarzania pochodzą z komunikatów ramki: sekunda na sekundę, jedno zdarzenie gry", () => {
    const { wlasciwosci } = zloz({ pozycjaStartowaSekundy: 100 });

    graRamka(3, 100);

    expect(wlasciwosci.onZmianaOdtwarzania).toHaveBeenCalledTimes(1);
    expect(wlasciwosci.onZmianaOdtwarzania).toHaveBeenLastCalledWith(true);
    expect(wlasciwosci.onPostep.mock.calls.map(([postep]) => postep)).toEqual([
      { pozycjaSekund: 101, przyrostObejrzane: 1, przyrostAktywne: 1 },
      { pozycjaSekund: 102, przyrostObejrzane: 1, przyrostAktywne: 1 },
      { pozycjaSekund: 103, przyrostObejrzane: 1, przyrostAktywne: 1 },
    ]);
  });

  it("bez komunikatów ramki czas nie płynie: sam upływ zegara niczego nie zgłasza", () => {
    const { wlasciwosci } = zloz();

    uplyw(120_000);

    expect(wlasciwosci.onPostep).not.toHaveBeenCalled();
    expect(wlasciwosci.onZmianaOdtwarzania).not.toHaveBeenCalled();
  });

  it("pauza w ramce zatrzymuje liczenie: zgłasza koniec gry raz, a czas nie rośnie", () => {
    const { wlasciwosci } = zloz();
    graRamka(5);
    zdarzenieRamki("pause");
    const przedPauza = wlasciwosci.onPostep.mock.calls.length;

    uplyw(30_000);
    zdarzenieRamki("timeupdate", { seconds: 400 });

    expect(wlasciwosci.onZmianaOdtwarzania.mock.calls.map(([gra]) => gra)).toEqual([true, false]);
    expect(wlasciwosci.onPostep).toHaveBeenCalledTimes(przedPauza);
  });

  it("koniec nagrania zatrzymuje liczenie, ale niczego poza zmianą gry nie zgłasza w górę", () => {
    const { wlasciwosci } = zloz();
    graRamka(5);

    zdarzenieRamki("ended");
    uplyw(10_000);
    zdarzenieRamki("timeupdate", { seconds: 1200 });

    expect(wlasciwosci.onZmianaOdtwarzania.mock.calls.map(([gra]) => gra)).toEqual([true, false]);
    expect(wlasciwosci.onPostep).toHaveBeenCalledTimes(5);
    expect(wlasciwosci.onBlad).not.toHaveBeenCalled();
    expect(Object.keys(wlasciwosci).some((nazwa) => /koniec/i.test(nazwa))).toBe(false);
  });

  it("karta ukryta: sekundy liczą się jako obejrzane, nie jako aktywne", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    try {
      const { wlasciwosci } = zloz();
      graRamka(2);
      expect(wlasciwosci.onPostep.mock.calls.map(([postep]) => [postep.przyrostObejrzane, postep.przyrostAktywne])).toEqual([
        [1, 0],
        [1, 0],
      ]);
    } finally {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    }
  });

  it("komunikaty od obcego pochodzenia i spoza okna ramki są pomijane", () => {
    const { wlasciwosci } = zloz();
    zdarzenieRamki("ready");
    zdarzenieRamki("play");
    const tresc = JSON.stringify({ context: "player.js", event: "timeupdate", value: { seconds: 5 } });

    komunikatRamki(tresc, "https://obcy.example");
    komunikatRamki(tresc, POCHODZENIE_ODTWARZACZA, window);
    komunikatRamki(tresc, POCHODZENIE_ODTWARZACZA, null);

    expect(wlasciwosci.onPostep).not.toHaveBeenCalled();
  });
});

describe("obudowa odtwarzacza — adres ramki spoza dozwolonego pochodzenia", () => {
  it.each([
    ["http: ten sam host", ADRES_RAMKI.replace("https:", "http:")],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<p>x</p>"],
    ["obcy host", "https://obcy.example/embed/1/lekcja-21?token=aaa"],
    ["host z dopiskiem", `${POCHODZENIE_ODTWARZACZA}.example/embed/1/lekcja-21?token=aaa`],
    ["dane logowania w adresie", POCHODZENIE_ODTWARZACZA.replace("https://", "https://ktos:haslo@") + "/embed/1"],
    ["pusty adres", ""],
  ])("%s: ramki nie ma, jest zgłoszenie błędu", (_nazwa, adres) => {
    const { wlasciwosci, container } = zloz({ zrodlo: zrodloRamki({ adresOsadzenia: adres === "" ? undefined : adres }) });

    expect(ramkaOdtwarzacza()).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(wlasciwosci.onBlad).toHaveBeenCalledTimes(1);
  });
});

describe("obudowa odtwarzacza — wygasły adres: jedno odświeżenie, nie pętla", () => {
  it("adres wygasa w trakcie: jedno zapytanie o nowy link, dopiero przy terminie", () => {
    const odswiezLink = vi.fn(async () => null);
    zloz({ zrodlo: wygasaZa(60), odswiezLink });

    uplyw(59_000);
    expect(odswiezLink).not.toHaveBeenCalled();
    uplyw(1_000);
    expect(odswiezLink).toHaveBeenCalledTimes(1);
    uplyw(600_000);
    expect(odswiezLink).toHaveBeenCalledTimes(1);
  });

  it("adres już wygasły przy starcie: dokładnie jedno zapytanie, a po nowym linku ramka z nowym adresem", async () => {
    const nowy = `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=bbb`;
    const odswiezLink = vi.fn(async () => wygasaZa(3600, nowy));
    const { wlasciwosci } = zloz({ zrodlo: wygasaZa(-30), odswiezLink });

    expect(ramkaOdtwarzacza()).toBeNull();
    uplyw(0);
    await rozstrzygnij();

    expect(odswiezLink).toHaveBeenCalledTimes(1);
    expect(ramkaOdtwarzacza()).toHaveAttribute("src", nowy);
    expect(wlasciwosci.onBlad).not.toHaveBeenCalled();
  });

  it("odświeżenie bez adresu osadzenia: błąd raz, bez drugiego zapytania", async () => {
    const odswiezLink = vi.fn(async () => zrodloRamki({ adresOsadzenia: undefined }));
    const { wlasciwosci } = zloz({ zrodlo: wygasaZa(-30), odswiezLink });

    uplyw(0);
    await rozstrzygnij();
    uplyw(300_000);
    await rozstrzygnij();

    expect(odswiezLink).toHaveBeenCalledTimes(1);
    expect(wlasciwosci.onBlad).toHaveBeenCalledTimes(1);
  });

  it("odświeżenie nieudane (null): błąd raz, bez drugiego zapytania", async () => {
    const odswiezLink = vi.fn(async () => null);
    const { wlasciwosci } = zloz({ zrodlo: wygasaZa(-30), odswiezLink });

    uplyw(0);
    await rozstrzygnij();
    uplyw(300_000);
    await rozstrzygnij();

    expect(odswiezLink).toHaveBeenCalledTimes(1);
    expect(wlasciwosci.onBlad).toHaveBeenCalledTimes(1);
  });

  it("nowy link już po terminie nie wchodzi do ramki i nie wywołuje kolejnego zapytania", async () => {
    const odswiezLink = vi.fn(async () => wygasaZa(-5, `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=ccc`));
    const { wlasciwosci } = zloz({ zrodlo: wygasaZa(-30), odswiezLink });

    uplyw(0);
    await rozstrzygnij();
    uplyw(300_000);
    await rozstrzygnij();

    expect(odswiezLink).toHaveBeenCalledTimes(1);
    expect(ramkaOdtwarzacza()).toBeNull();
    expect(wlasciwosci.onBlad).toHaveBeenCalledTimes(1);
  });

  it("odświeżenie nieudane w czasie gry nie przerywa nagrania; błąd dopiero, gdy odtwarzanie stanie", async () => {
    const odswiezLink = vi.fn(async () => null);
    const { wlasciwosci } = zloz({ zrodlo: wygasaZa(10), odswiezLink });
    graRamka(3);

    uplyw(10_000);
    await rozstrzygnij();
    expect(odswiezLink).toHaveBeenCalledTimes(1);
    expect(wlasciwosci.onBlad).not.toHaveBeenCalled();
    expect(ramkaOdtwarzacza()).not.toBeNull();

    zdarzenieRamki("pause");
    expect(wlasciwosci.onBlad).toHaveBeenCalledTimes(1);
  });
});

describe("obudowa odtwarzacza — nasłuch w czasie czekania na nowy adres", () => {
  it("zdarzenie z ramki w trakcie odświeżania linku jest obsłużone dokładnie raz, a po odświeżeniu nasłuch się nie dubluje", async () => {
    const nowy = `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=ddd`;
    let rozwiaz: (zrodlo: ZrodloNagrania | null) => void = () => {};
    const odswiezLink = vi.fn(() => new Promise<ZrodloNagrania | null>((resolve) => (rozwiaz = resolve)));
    const { wlasciwosci } = zloz({ zrodlo: wygasaZa(20), odswiezLink });
    graRamka(2); // ramka gra, doliczono 2 s
    expect(wlasciwosci.onPostep).toHaveBeenCalledTimes(2);

    uplyw(18_000); // termin: zapytanie o nowy link wisi
    expect(odswiezLink).toHaveBeenCalledTimes(1);

    zdarzenieRamki("timeupdate", { seconds: 20 }); // pierwszy po przerwie: nowy odcinek, bez przyrostu
    dalejRamka(1, 20);
    expect(wlasciwosci.onPostep).toHaveBeenCalledTimes(3);
    expect(wlasciwosci.onPostep).toHaveBeenLastCalledWith({ pozycjaSekund: 21, przyrostObejrzane: 1, przyrostAktywne: 1 });

    const ramkaPrzed = ramkaOdtwarzacza();
    rozwiaz(wygasaZa(3600, nowy));
    await rozstrzygnij();

    expect(ramkaOdtwarzacza()).toBe(ramkaPrzed);
    dalejRamka(1, 21);
    expect(wlasciwosci.onPostep).toHaveBeenCalledTimes(4);
    expect(wlasciwosci.onPostep).toHaveBeenLastCalledWith({ pozycjaSekund: 22, przyrostObejrzane: 1, przyrostAktywne: 1 });
    expect(odswiezLink).toHaveBeenCalledTimes(1);
  });
});
