import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

/**
 * Próby na atrapie zdarzeń ramki: `MessageEvent` z ustawionym `origin`
 * i `source`. Dozwolone pochodzenie jest tu nadpisane adresem z domeny
 * zastrzeżonej dla prób — w drzewie dokumentu nie pojawia się żaden adres
 * prawdziwego odtwarzacza, a jsdom ramek nie wczytuje.
 */
const { POCHODZENIE } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VIDEO_PLAYER_ORIGIN = "https://odtwarzacz.atrapa.test";
  return { POCHODZENIE: "https://odtwarzacz.atrapa.test" };
});

import { POCHODZENIE_ODTWARZACZA } from "../../../../lib/konfiguracja/odtwarzacz-nagran";
import {
  ALLOW_RAMKI,
  CZAS_NA_GOTOWOSC_MS,
  LOADING_RAMKI,
  RecordingPlayer,
  REFERRER_RAMKI,
  SANDBOX_RAMKI,
  type PostepNagrania,
  type WlasciwosciRecordingPlayer,
} from "../RecordingPlayer";

const OBCE = "https://obcy.example";
const ADRES = `${POCHODZENIE}/embed/nagranie-1?token=aaa&expires=1`;
const ADRES_ODSWIEZONY = `${POCHODZENIE}/embed/nagranie-1?token=bbb&expires=2`;
const ADRES_INNEGO = `${POCHODZENIE}/embed/nagranie-2?token=ccc&expires=3`;
const TERAZ = Date.parse("2026-10-02T08:00:00Z");

interface Zgloszenia {
  onPostep: Mock<(postep: PostepNagrania) => void>;
  onZmianaOdtwarzania: Mock<(odtwarzane: boolean) => void>;
  onKoniec: Mock<() => void>;
  onGotowa: Mock<() => void>;
  onBlad: Mock<WlasciwosciRecordingPlayer["onBlad"]>;
  onOdswiezAdres: Mock<() => void>;
}

function zgloszenia(): Zgloszenia {
  return {
    onPostep: vi.fn(),
    onZmianaOdtwarzania: vi.fn(),
    onKoniec: vi.fn(),
    onGotowa: vi.fn(),
    onBlad: vi.fn(),
    onOdswiezAdres: vi.fn(),
  };
}

function wlasciwosci(z: Zgloszenia, nadpisane: Partial<WlasciwosciRecordingPlayer> = {}): WlasciwosciRecordingPlayer {
  return { tytul: "Wprowadzenie do wywiadu", adresRamki: ADRES, czasTrwaniaSekund: 1800, ...z, ...nadpisane };
}

function ramka(): HTMLIFrameElement | null {
  return document.querySelector("iframe");
}

function oknoRamki(): Window {
  const okno = ramka()?.contentWindow;
  if (!okno) throw new Error("brak okna ramki");
  return okno;
}

/** Komunikat tak, jak dostarcza go przeglądarka: z pochodzeniem i oknem nadawcy. */
function komunikat(dane: unknown, origin: string = POCHODZENIE, source: MessageEventSource | null = oknoRamki()) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: dane, origin, source }));
  });
}

function zdarzenie(nazwa: string, wartosc?: unknown, origin?: string, source?: MessageEventSource | null) {
  komunikat(JSON.stringify({ context: "player.js", version: "0.0.11", event: nazwa, value: wartosc }), origin, source);
}

function uplyw(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Odtwarzanie: co `krokMs` zegara ramka zgłasza pozycję przesuniętą o `krokMs` × `tempo`. */
function odtwarzaj(odPozycji: number, sekundZegara: number, opcje: { tempo?: number; krokMs?: number; origin?: string; source?: MessageEventSource | null } = {}) {
  const { tempo = 1, krokMs = 250, origin, source } = opcje;
  let pozycja = odPozycji;
  for (let uplynelo = 0; uplynelo < sekundZegara * 1000; uplynelo += krokMs) {
    uplyw(krokMs);
    pozycja += (krokMs / 1000) * tempo;
    zdarzenie("timeupdate", { seconds: pozycja, duration: 1800 }, origin, source);
  }
  return pozycja;
}

function suma(z: Zgloszenia) {
  return z.onPostep.mock.calls.reduce(
    (razem, [postep]) => ({
      obejrzane: razem.obejrzane + postep.przyrostObejrzane,
      aktywne: razem.aktywne + postep.przyrostAktywne,
    }),
    { obejrzane: 0, aktywne: 0 },
  );
}

/** Komunikaty wysłane do ramki: [treść, pochodzenie docelowe]. */
function wyslane(szpieg: Mock): { tresc: Record<string, unknown>; cel: unknown }[] {
  return szpieg.mock.calls.map(([tresc, cel]) => ({ tresc: JSON.parse(tresc as string), cel }));
}

function szpiegRamki(): Mock {
  return vi.spyOn(oknoRamki(), "postMessage").mockImplementation(() => {}) as unknown as Mock;
}

function ustawUkrycieKarty(ukryta: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => ukryta });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.setSystemTime(TERAZ);
  ustawUkrycieKarty(false);
});

afterEach(() => {
  vi.useRealTimers();
  ustawUkrycieKarty(false);
});

it("próby stoją na pochodzeniu z domeny prób, nie na prawdziwym odtwarzaczu", () => {
  expect(POCHODZENIE_ODTWARZACZA).toBe(POCHODZENIE);
});

describe("komunikaty ramki — kto może mówić", () => {
  it("komunikat z dozwolonego pochodzenia i z okna ramki jest przyjęty: postęp zgłoszony", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("ready");
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    const pozycja = odtwarzaj(0, 5);

    expect(z.onGotowa).toHaveBeenCalledTimes(1);
    expect(z.onZmianaOdtwarzania.mock.calls).toEqual([[true]]);
    expect(suma(z)).toEqual({ obejrzane: 5, aktywne: 5 });
    expect(pozycja).toBe(5);
    expect(z.onPostep.mock.calls.at(-1)?.[0].pozycjaSekund).toBe(pozycja);
  });

  it("komunikaty z obcego pochodzenia są odrzucone: zero zgłoszeń, zero czasu, zero poleceń do ramki", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z, { pozycjaStartowaSekund: 120 })} />);
    const szpieg = szpiegRamki();
    zdarzenie("ready", undefined, OBCE);
    zdarzenie("play", undefined, OBCE);
    odtwarzaj(0, 30, { origin: OBCE });
    zdarzenie("ended", undefined, OBCE);
    zdarzenie("error", undefined, OBCE);

    expect(z.onPostep).not.toHaveBeenCalled();
    expect(z.onZmianaOdtwarzania).not.toHaveBeenCalled();
    expect(z.onGotowa).not.toHaveBeenCalled();
    expect(z.onKoniec).not.toHaveBeenCalled();
    expect(z.onBlad.mock.calls).toEqual([["brak-gotowosci"]]);
    expect(szpieg).not.toHaveBeenCalled();
  });

  it.each([
    ["pochodzenie będące przedrostkiem dozwolonego", `${POCHODZENIE}.obcy.example`],
    ["ten sam host, inny schemat", POCHODZENIE.replace("https:", "http:")],
    ["ten sam host, inny port", `${POCHODZENIE}:8443`],
    ["pochodzenie strony", window.location.origin],
    ["pochodzenie nieprzejrzyste", "null"],
    ["puste pochodzenie", ""],
  ])("%s jest odrzucone", (_opis, origin) => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("ready", undefined, origin);
    zdarzenie("play", undefined, origin);
    odtwarzaj(0, 10, { origin });

    expect(z.onPostep).not.toHaveBeenCalled();
    expect(z.onGotowa).not.toHaveBeenCalled();
  });

  it("komunikat z dozwolonego pochodzenia, ale z innego okna, jest odrzucony", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    const obcaRamka = document.createElement("iframe");
    document.body.appendChild(obcaRamka);
    const inneOkna: (MessageEventSource | null)[] = [obcaRamka.contentWindow, window, null];

    for (const okno of inneOkna) {
      zdarzenie("ready", undefined, POCHODZENIE, okno);
      zdarzenie("play", undefined, POCHODZENIE, okno);
      odtwarzaj(0, 10, { source: okno });
    }
    obcaRamka.remove();

    expect(z.onPostep).not.toHaveBeenCalled();
    expect(z.onZmianaOdtwarzania).not.toHaveBeenCalled();
    expect(z.onGotowa).not.toHaveBeenCalled();
  });

  it("obce komunikaty wmieszane w prawdziwe odtwarzanie nie doliczają czasu", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("ready");
    zdarzenie("play");
    zdarzenie("pause");
    // Odtwarzanie „wznawia” obcy nadawca i inne okno — licznik stoi.
    zdarzenie("play", undefined, OBCE);
    zdarzenie("play", undefined, POCHODZENIE, window);
    odtwarzaj(0, 30, { origin: OBCE });
    odtwarzaj(0, 30, { source: window });

    expect(z.onPostep).not.toHaveBeenCalled();
    expect(z.onZmianaOdtwarzania.mock.calls).toEqual([[true], [false]]);
  });

  it("zły JSON, zły kształt i obcy context są ignorowane bez wyjątku", () => {
    const z = zgloszenia();
    const bledy = vi.fn();
    window.addEventListener("error", bledy);
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("ready");
    zdarzenie("play");
    z.onZmianaOdtwarzania.mockClear();
    z.onGotowa.mockClear();

    const smieci: unknown[] = [
      "{",
      "",
      "ready",
      "null",
      "[]",
      "42",
      null,
      undefined,
      42,
      [],
      {},
      { context: "player.js" },
      { context: "player.js", event: 5 },
      { context: "player.js", event: "nieznane" },
      { context: "inny", event: "ended" },
      { context: "inny", event: "timeupdate", value: { seconds: 900 } },
      JSON.stringify({ context: "inny", event: "ended" }),
      JSON.stringify({ event: "ended" }),
      JSON.stringify({ context: "player.js", event: "timeupdate" }),
      JSON.stringify({ context: "player.js", event: "timeupdate", value: "900" }),
      JSON.stringify({ context: "player.js", event: "timeupdate", value: { seconds: "900" } }),
      JSON.stringify({ context: "player.js", event: "timeupdate", value: { seconds: -1 } }),
      JSON.stringify({ context: "player.js", event: "timeupdate", value: { seconds: null } }),
    ];
    for (const dane of smieci) {
      uplyw(250);
      expect(() => komunikat(dane)).not.toThrow();
    }
    window.removeEventListener("error", bledy);

    expect(bledy).not.toHaveBeenCalled();
    expect(z.onPostep).not.toHaveBeenCalled();
    expect(z.onKoniec).not.toHaveBeenCalled();
    expect(z.onZmianaOdtwarzania).not.toHaveBeenCalled();
    expect(z.onBlad).not.toHaveBeenCalled();
  });

  it("przed gotowością ramki zdarzenia odtwarzania nie są liczone", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("play");
    odtwarzaj(0, 10);

    expect(z.onPostep).not.toHaveBeenCalled();
    expect(z.onZmianaOdtwarzania).not.toHaveBeenCalled();
  });
});

describe("czas wyłącznie z prawdziwych zdarzeń odtwarzania", () => {
  function gotowy() {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("ready");
    return z;
  }

  it("30 s odtwarzania daje 30 s obejrzane i 30 s aktywne; pozycja pochodzi z ramki", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 100, duration: 1800 });
    const pozycja = odtwarzaj(100, 30);

    expect(suma(z)).toEqual({ obejrzane: 30, aktywne: 30 });
    expect(pozycja).toBe(130);
    expect(z.onPostep.mock.calls.at(-1)?.[0].pozycjaSekund).toBe(130);
    for (const [postep] of z.onPostep.mock.calls) {
      expect(Number.isInteger(postep.przyrostObejrzane)).toBe(true);
      expect(Number.isInteger(postep.przyrostAktywne)).toBe(true);
    }
  });

  it("przewinięcie do przodu o 10 minut nie dolicza czasu", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    odtwarzaj(0, 10);
    expect(suma(z)).toEqual({ obejrzane: 10, aktywne: 10 });

    // Skok pozycji bez zdarzenia przewinięcia…
    uplyw(250);
    zdarzenie("timeupdate", { seconds: 610, duration: 1800 });
    expect(suma(z)).toEqual({ obejrzane: 10, aktywne: 10 });
    // …i ze zdarzeniem przewinięcia.
    zdarzenie("seeked");
    uplyw(250);
    zdarzenie("timeupdate", { seconds: 1210, duration: 1800 });
    expect(suma(z)).toEqual({ obejrzane: 10, aktywne: 10 });

    odtwarzaj(1210, 5);
    expect(suma(z)).toEqual({ obejrzane: 15, aktywne: 15 });
  });

  it("pauza i koniec: pozycje zgłaszane potem nie doliczają niczego", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    odtwarzaj(0, 4);
    zdarzenie("pause");
    odtwarzaj(4, 20);
    expect(suma(z)).toEqual({ obejrzane: 4, aktywne: 4 });

    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 24, duration: 1800 });
    odtwarzaj(24, 2);
    zdarzenie("ended");
    odtwarzaj(26, 20);

    expect(suma(z)).toEqual({ obejrzane: 6, aktywne: 6 });
    expect(z.onKoniec).toHaveBeenCalledTimes(1);
    expect(z.onZmianaOdtwarzania.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it("bez zdarzeń nic nie rośnie, choć zegar idzie", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    uplyw(10 * 60 * 1000);

    expect(z.onPostep).not.toHaveBeenCalled();
  });

  it("cisza dłuższa niż dozwolona przerwa nie jest doliczana po powrocie zdarzeń", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    uplyw(60_000);
    zdarzenie("timeupdate", { seconds: 60, duration: 1800 });

    expect(z.onPostep).not.toHaveBeenCalled();
  });

  it("przyrost nigdy nie przekracza czasu zegara: odtwarzanie dwa razy szybsze", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    const pozycja = odtwarzaj(0, 10, { tempo: 2 });

    expect(pozycja).toBe(20);
    expect(suma(z)).toEqual({ obejrzane: 10, aktywne: 10 });
  });

  it("przyrost nie przekracza przesunięcia pozycji: odtwarzanie dwa razy wolniejsze", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    odtwarzaj(0, 10, { tempo: 0.5 });

    expect(suma(z)).toEqual({ obejrzane: 5, aktywne: 5 });
  });

  it("pozycja stojąca w miejscu i cofnięcie nie doliczają czasu", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 50, duration: 1800 });
    odtwarzaj(50, 10, { tempo: 0 });
    uplyw(250);
    zdarzenie("timeupdate", { seconds: 5, duration: 1800 });

    expect(z.onPostep).not.toHaveBeenCalled();
  });

  it("karta w tle: obejrzane rośnie ze zdarzeń, aktywne nie", () => {
    const z = gotowy();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    odtwarzaj(0, 5);
    ustawUkrycieKarty(true);
    odtwarzaj(5, 10);

    expect(suma(z)).toEqual({ obejrzane: 15, aktywne: 5 });
  });

  it("w żadnej chwili suma przyrostów nie przekracza czasu zegara od startu", () => {
    const z = gotowy();
    const startZegara = performance.now();
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 0, duration: 1800 });
    let pozycja = odtwarzaj(0, 7, { tempo: 3, krokMs: 400 });
    uplyw(100);
    zdarzenie("timeupdate", { seconds: (pozycja += 900), duration: 1800 });
    pozycja = odtwarzaj(pozycja, 6, { tempo: 1, krokMs: 1000 });
    zdarzenie("pause");
    odtwarzaj(pozycja, 5);
    zdarzenie("play");
    odtwarzaj(pozycja, 9, { tempo: 1.5, krokMs: 300 });

    let obejrzane = 0;
    for (const [postep] of z.onPostep.mock.calls) obejrzane += postep.przyrostObejrzane;
    const zegar = (performance.now() - startZegara) / 1000;
    expect(obejrzane).toBeGreaterThan(0);
    expect(obejrzane).toBeLessThanOrEqual(zegar - 5);
  });
});

describe("start od zapisanej pozycji", () => {
  it("po gotowości idzie polecenie ustawienia pozycji z dokładnym pochodzeniem docelowym", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z, { pozycjaStartowaSekund: 125 })} />);
    const szpieg = szpiegRamki();
    expect(szpieg).not.toHaveBeenCalled();
    zdarzenie("ready");

    const komunikaty = wyslane(szpieg);
    const pozycje = komunikaty.filter((k) => k.tresc.method === "setCurrentTime");
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0].tresc).toMatchObject({ context: "player.js", method: "setCurrentTime", value: 125 });
    expect(komunikaty.length).toBeGreaterThan(1);
    for (const k of komunikaty) {
      expect(k.cel).toBe(POCHODZENIE);
      expect(k.cel).not.toBe("*");
    }
    expect(
      komunikaty.filter((k) => k.tresc.method === "addEventListener").map((k) => k.tresc.value),
    ).toEqual(["play", "pause", "ended", "timeupdate", "seeked", "error"]);
  });

  it("powtórzona gotowość nie wysyła polecenia drugi raz", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z, { pozycjaStartowaSekund: 125 })} />);
    const szpieg = szpiegRamki();
    zdarzenie("ready");
    const poPierwszej = szpieg.mock.calls.length;
    zdarzenie("ready");

    expect(szpieg.mock.calls.length).toBe(poPierwszej);
    expect(z.onGotowa).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["brak (undefined)", undefined],
    ["brak (null)", null],
    ["zero", 0],
    ["równa długości", 1800],
    ["dalsza niż długość", 2400],
    ["ujemna", -5],
    ["nie liczba", Number.NaN],
  ])("pozycja %s: start od zera, bez polecenia", (_opis, pozycja) => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z, { pozycjaStartowaSekund: pozycja })} />);
    const szpieg = szpiegRamki();
    zdarzenie("ready");

    const komunikaty = wyslane(szpieg);
    expect(komunikaty.filter((k) => k.tresc.method === "addEventListener")).toHaveLength(6);
    expect(komunikaty.filter((k) => k.tresc.method === "setCurrentTime")).toHaveLength(0);
  });

  it("nieznana długość nagrania: bez polecenia", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z, { pozycjaStartowaSekund: 125, czasTrwaniaSekund: 0 })} />);
    const szpieg = szpiegRamki();
    zdarzenie("ready");

    expect(wyslane(szpieg).filter((k) => k.tresc.method === "setCurrentTime")).toHaveLength(0);
  });

  it("po wczytaniu ramki idzie prośba o gotowość — z dokładnym pochodzeniem docelowym", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    const szpieg = szpiegRamki();
    fireEvent.load(ramka()!);

    expect(wyslane(szpieg)).toEqual([
      { tresc: expect.objectContaining({ method: "addEventListener", value: "ready" }), cel: POCHODZENIE },
    ]);
  });
});

describe("ramka i jej atrybuty", () => {
  it("atrybuty ramki są obecne i równe opisanym", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    const element = ramka()!;

    expect(element.getAttribute("src")).toBe(ADRES);
    expect(element.getAttribute("title")).toBe("Nagranie lekcji: Wprowadzenie do wywiadu");
    expect(element.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(element.getAttribute("allow")).toBe("fullscreen; encrypted-media");
    expect(element.getAttribute("referrerpolicy")).toBe("strict-origin");
    expect(element.getAttribute("loading")).toBe("eager");
    expect([SANDBOX_RAMKI, ALLOW_RAMKI, REFERRER_RAMKI, LOADING_RAMKI]).toEqual([
      "allow-scripts allow-same-origin",
      "fullscreen; encrypted-media",
      "strict-origin",
      "eager",
    ]);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(z.onBlad).not.toHaveBeenCalled();
  });

  it.each([
    ["obce pochodzenie", `${OBCE}/embed/nagranie-1?token=aaa`],
    ["dozwolone jako przedrostek obcego hosta", `${POCHODZENIE}.obcy.example/embed/1`],
    ["dozwolone jako dane logowania obcego hosta", `${POCHODZENIE}@obcy.example/embed/1`],
    ["inny schemat", `${POCHODZENIE.replace("https:", "http:")}/embed/1`],
    ["inny port", `${POCHODZENIE}:8443/embed/1`],
    ["adres bez schematu", `//${POCHODZENIE.replace("https://", "")}/embed/1`],
    ["ścieżka własna", "/embed/1"],
    ["schemat skryptu", "javascript:alert(1)"],
    ["schemat danych", "data:text/html,<p>x</p>"],
    ["pusty", ""],
  ])("adres ramki — %s: ramka nie jest renderowana, zgłoszony błąd", (_opis, adres) => {
    const z = zgloszenia();
    const { container } = render(<RecordingPlayer {...wlasciwosci(z, { adresRamki: adres })} />);

    expect(ramka()).toBeNull();
    expect(container.innerHTML).toBe("");
    expect(z.onBlad.mock.calls).toEqual([["adres-niedozwolony"]]);
    uplyw(CZAS_NA_GOTOWOSC_MS * 2);
    expect(z.onBlad).toHaveBeenCalledTimes(1);
    expect(z.onOdswiezAdres).not.toHaveBeenCalled();
  });
});

describe("stany: ładowanie, błąd, wygaśnięcie adresu", () => {
  it("do gotowości widać zdanie o wczytywaniu; po gotowości znika", () => {
    const z = zgloszenia();
    const { getByRole, queryByRole } = render(<RecordingPlayer {...wlasciwosci(z)} />);
    expect(getByRole("status").textContent).toBe("Wczytywanie nagrania…");
    zdarzenie("ready");

    expect(queryByRole("status")).toBeNull();
  });

  it("brak gotowości w wyznaczonym czasie: błąd zgłoszony w górę, nie wcześniej", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    uplyw(CZAS_NA_GOTOWOSC_MS - 1);
    expect(z.onBlad).not.toHaveBeenCalled();
    uplyw(1);

    expect(z.onBlad.mock.calls).toEqual([["brak-gotowosci"]]);
    expect(z.onOdswiezAdres).not.toHaveBeenCalled();
  });

  it("gotowość w czasie: brak zgłoszenia błędu", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z)} />);
    uplyw(CZAS_NA_GOTOWOSC_MS - 1);
    zdarzenie("ready");
    uplyw(CZAS_NA_GOTOWOSC_MS);

    expect(z.onBlad).not.toHaveBeenCalled();
  });

  it("błąd wczytania ramki i błąd odtwarzania idą w górę", () => {
    const pierwsze = zgloszenia();
    const { unmount } = render(<RecordingPlayer {...wlasciwosci(pierwsze)} />);
    fireEvent.error(ramka()!);
    expect(pierwsze.onBlad.mock.calls).toEqual([["ramka"]]);
    unmount();

    const drugie = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(drugie)} />);
    zdarzenie("ready");
    zdarzenie("play");
    zdarzenie("error");
    expect(drugie.onBlad.mock.calls).toEqual([["odtwarzanie"]]);
    expect(drugie.onZmianaOdtwarzania.mock.calls).toEqual([[true], [false]]);
  });

  it("adres wygasa w trakcie: jedna prośba o nowy, działająca ramka zostaje", () => {
    const z = zgloszenia();
    const wygasa = new Date(TERAZ + 60_000).toISOString();
    const { rerender } = render(<RecordingPlayer {...wlasciwosci(z, { adresWygasa: wygasa })} />);
    zdarzenie("ready");
    const element = ramka();
    uplyw(59_999);
    expect(z.onOdswiezAdres).not.toHaveBeenCalled();
    uplyw(1);
    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);
    expect(ramka()).toBe(element);

    // Ekran podaje odświeżony adres tego samego nagrania: ramka nie jest przeładowana.
    rerender(
      <RecordingPlayer
        {...wlasciwosci(z, { adresRamki: ADRES_ODSWIEZONY, adresWygasa: new Date(TERAZ + 600_000).toISOString() })}
      />,
    );
    expect(ramka()).toBe(element);
    expect(ramka()?.getAttribute("src")).toBe(ADRES);
    uplyw(120_000);
    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);
    expect(z.onBlad).not.toHaveBeenCalled();
  });

  it("błąd odtwarzania po odświeżeniu adresu: wymiana ramki i start od ostatniej pozycji z ramki", () => {
    const z = zgloszenia();
    const { rerender } = render(
      <RecordingPlayer
        {...wlasciwosci(z, { adresWygasa: new Date(TERAZ + 10_000).toISOString(), pozycjaStartowaSekund: 40 })}
      />,
    );
    zdarzenie("ready");
    zdarzenie("play");
    zdarzenie("timeupdate", { seconds: 300, duration: 1800 });
    odtwarzaj(300, 12);
    rerender(
      <RecordingPlayer
        {...wlasciwosci(z, {
          adresRamki: ADRES_ODSWIEZONY,
          adresWygasa: new Date(TERAZ + 600_000).toISOString(),
          pozycjaStartowaSekund: 40,
        })}
      />,
    );
    zdarzenie("error");

    expect(z.onBlad).not.toHaveBeenCalled();
    expect(ramka()?.getAttribute("src")).toBe(ADRES_ODSWIEZONY);
    const szpieg = szpiegRamki();
    zdarzenie("ready");
    expect(wyslane(szpieg).filter((k) => k.tresc.method === "setCurrentTime")).toEqual([
      { tresc: expect.objectContaining({ value: 312 }), cel: POCHODZENIE },
    ]);
  });

  it("błąd odtwarzania po wygaśnięciu, zanim przyszedł nowy adres: bez błędu, ramka czeka na adres", () => {
    const z = zgloszenia();
    const { rerender, getByRole } = render(
      <RecordingPlayer {...wlasciwosci(z, { adresWygasa: new Date(TERAZ + 10_000).toISOString() })} />,
    );
    zdarzenie("ready");
    uplyw(10_000);
    zdarzenie("error");

    expect(z.onBlad).not.toHaveBeenCalled();
    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);
    expect(ramka()).toBeNull();
    expect(getByRole("status").textContent).toBe("Wczytywanie nagrania…");

    rerender(
      <RecordingPlayer
        {...wlasciwosci(z, { adresRamki: ADRES_ODSWIEZONY, adresWygasa: new Date(TERAZ + 600_000).toISOString() })}
      />,
    );
    expect(ramka()?.getAttribute("src")).toBe(ADRES_ODSWIEZONY);
  });

  it("adres wygasły już przy wejściu: ramka nie powstaje, idzie prośba o nowy adres", () => {
    const z = zgloszenia();
    const { rerender } = render(
      <RecordingPlayer {...wlasciwosci(z, { adresWygasa: new Date(TERAZ - 1_000).toISOString() })} />,
    );
    expect(ramka()).toBeNull();
    uplyw(0);
    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);
    uplyw(CZAS_NA_GOTOWOSC_MS * 2);
    expect(z.onBlad).not.toHaveBeenCalled();
    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);

    rerender(
      <RecordingPlayer
        {...wlasciwosci(z, { adresRamki: ADRES_ODSWIEZONY, adresWygasa: new Date(TERAZ + 600_000).toISOString() })}
      />,
    );
    expect(ramka()?.getAttribute("src")).toBe(ADRES_ODSWIEZONY);
  });

  it("adres wygasa, zanim ramka zgłosiła gotowość: prośba o nowy zamiast błędu", () => {
    const z = zgloszenia();
    render(<RecordingPlayer {...wlasciwosci(z, { adresWygasa: new Date(TERAZ + 5_000).toISOString() })} />);
    uplyw(5_000);
    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);
    expect(ramka()).not.toBeNull();
    uplyw(CZAS_NA_GOTOWOSC_MS - 5_000);

    expect(z.onOdswiezAdres).toHaveBeenCalledTimes(1);
    expect(z.onBlad).not.toHaveBeenCalled();
    expect(ramka()).toBeNull();
  });

  it("adres innego nagrania wymienia ramkę od razu", () => {
    const z = zgloszenia();
    const { rerender } = render(<RecordingPlayer {...wlasciwosci(z)} />);
    zdarzenie("ready");
    rerender(<RecordingPlayer {...wlasciwosci(z, { adresRamki: ADRES_INNEGO })} />);

    expect(ramka()?.getAttribute("src")).toBe(ADRES_INNEGO);
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("po odmontowaniu komunikaty ramki nie są już słuchane", () => {
    const z = zgloszenia();
    const { unmount } = render(<RecordingPlayer {...wlasciwosci(z)} />);
    const okno = oknoRamki();
    zdarzenie("ready");
    unmount();
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({ context: "player.js", event: "play" }),
          origin: POCHODZENIE,
          source: okno,
        }),
      );
    });

    expect(z.onZmianaOdtwarzania).not.toHaveBeenCalled();
  });
});
