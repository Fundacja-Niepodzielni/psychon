import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZlecenieWgrania } from "@/nowy-front/lekcja-edycja/dane";
import { KLUCZ_PAMIECI, POLA_WPISU, WAZNOSC_WPISU_MS } from "../pamiec";
import { utworzUchwyt, type LekcjaWysylania } from "../uchwyt";
import { ADRES_DOSTAWCY, atrapaDostawcy, pamiecProbna } from "./atrapa-dostawcy";

/**
 * Uchwyt wysyłania nagrania wobec atrapy dostawcy (TUS) i atrapy serwera
 * wydającego pozwolenia: wysyłanie od zera, przerwanie, dokończenie tym samym
 * plikiem, odmowa innego pliku, ważność wpisu i to, co trafia do pamięci
 * przeglądarki.
 */

const PODPIS = ["pod", "pis", "probny"].join("-");
const TERMIN = 1_790_000_000 + 17;
const ID_NAGRANIA = ["wideo", "probne"].join("-");
const ID_BIBLIOTEKI = String(7 * 11 * 13);

const LEKCJA: LekcjaWysylania = { id: 22, tytul: "Trudny rozmówca", adres: "/admin/kursy/4/lekcje/22" };
const INNA_LEKCJA: LekcjaWysylania = { id: 23, tytul: "Ćwiczenie w parach", adres: "/admin/kursy/4/lekcje/23" };

const ZMIENIONO = 1_790_000_000_000;
const plik = () => new File(["0123456789"], "trudny-rozmowca.mp4", { type: "video/mp4", lastModified: ZMIENIONO });
const innyPlik = () => new File(["01234567890123"], "inne-nagranie.mp4", { type: "video/mp4", lastModified: ZMIENIONO + 5 });

function pozwolenie(resumed?: boolean): ZlecenieWgrania & { resumed?: boolean } {
  return {
    video_id: ID_NAGRANIA,
    upload_url: ADRES_DOSTAWCY,
    library_id: ID_BIBLIOTEKI,
    expiration_time: TERMIN,
    signature: PODPIS,
    ...(resumed === undefined ? {} : { resumed }),
  };
}

function srodowisko(resumed?: boolean) {
  const magazyn = pamiecProbna();
  const zegar = { teraz: Date.UTC(2026, 9, 1, 12, 0, 0) };
  const zlec = vi.fn(async () => pozwolenie(resumed));
  const nowyUchwyt = () => utworzUchwyt({ zlec, magazyn: () => magazyn, teraz: () => zegar.teraz });
  return { magazyn, zegar, zlec, uchwyt: nowyUchwyt(), nowyUchwyt };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wysyłanie od zera", () => {
  it("zakłada wgranie, wysyła cały plik, kończy stanem „wysłane” i czyści pamięć", async () => {
    const dostawca = atrapaDostawcy();
    const { uchwyt, magazyn, zlec } = srodowisko();
    const stany: string[] = [];
    uchwyt.subskrybuj(() => stany.push(uchwyt.stan().rodzaj));

    const wynik = await uchwyt.wyslij(plik(), LEKCJA, "nowe");

    expect(wynik).toEqual({ rodzaj: "wyslane" });
    expect(zlec).toHaveBeenCalledWith(22, "Trudny rozmówca");
    expect(dostawca.metody()).toEqual(["POST", "PATCH", "PATCH", "PATCH", "PATCH"]);
    expect(dostawca.przyjete).toBe(10);
    expect(uchwyt.stan()).toEqual({ rodzaj: "wyslane", lekcja: LEKCJA, zastepuje: null });
    expect(stany[0]).toBe("wysylanie");
    expect(magazyn.getItem(KLUCZ_PAMIECI)).toBeNull();
  });

  it("w trakcie stan niesie lekcję, plik i liczbę wysłanych bajtów", async () => {
    atrapaDostawcy();
    const { uchwyt } = srodowisko();
    const wyslane: number[] = [];
    uchwyt.subskrybuj(() => {
      const stan = uchwyt.stan();
      if (stan.rodzaj === "wysylanie") wyslane.push(stan.wyslano);
    });
    await uchwyt.wyslij(plik(), LEKCJA, "nowe", { zastepuje: true });
    expect(wyslane).toEqual([0, 0, 3, 6, 9, 10]);
    expect(uchwyt.stan()).toMatchObject({ rodzaj: "wyslane", zastepuje: true });
  });

  it("drugie wysyłanie w trakcie pierwszego dostaje odmowę z lekcją, której nagranie się wysyła", async () => {
    atrapaDostawcy();
    const { uchwyt, zlec } = srodowisko();
    const pierwsze = uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const drugie = await uchwyt.wyslij(innyPlik(), INNA_LEKCJA, "nowe");
    expect(drugie).toEqual({ rodzaj: "zajete", lekcja: LEKCJA });
    await pierwsze;
    expect(zlec).toHaveBeenCalledTimes(1);
  });

  it("odmowa serwera przy pozwoleniu: wysyłanie się nie zaczyna, stan wraca do braku", async () => {
    const dostawca = atrapaDostawcy();
    const { uchwyt, zlec } = srodowisko();
    const blad = new Error("Odmowa");
    zlec.mockRejectedValueOnce(blad);
    expect(await uchwyt.wyslij(plik(), LEKCJA, "nowe")).toEqual({ rodzaj: "odmowa", blad });
    expect(uchwyt.stan()).toEqual({ rodzaj: "brak" });
    expect(dostawca.zadania).toHaveLength(0);
  });

  it("pusty plik: odmowa bez pytania serwera o pozwolenie", async () => {
    atrapaDostawcy();
    const { uchwyt, zlec } = srodowisko();
    const wynik = await uchwyt.wyslij(new File([], "pusty.mp4", { type: "video/mp4" }), LEKCJA, "nowe");
    expect(wynik.rodzaj).toBe("odmowa");
    expect(zlec).not.toHaveBeenCalled();
  });
});

describe("przerwanie", () => {
  it("błąd sieci przy 30 %: stan „przerwane” z liczbą bajtów potwierdzonych przez dostawcę", async () => {
    atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko();
    expect(await uchwyt.wyslij(plik(), LEKCJA, "nowe")).toEqual({ rodzaj: "przerwane" });
    expect(uchwyt.stan()).toEqual({
      rodzaj: "przerwane",
      lekcja: LEKCJA,
      nazwa: "trudny-rozmowca.mp4",
      rozmiar: 10,
      wyslano: 3,
      zastepuje: null,
      innyPlik: false,
    });
  });

  it("„przerwij” osoby: stan „przerwane”, wpis zostaje w pamięci", async () => {
    const dostawca = atrapaDostawcy();
    const { uchwyt, magazyn } = srodowisko();
    uchwyt.subskrybuj(() => {
      const stan = uchwyt.stan();
      if (stan.rodzaj === "wysylanie" && stan.wyslano === 6) uchwyt.przerwij();
    });
    expect(await uchwyt.wyslij(plik(), LEKCJA, "nowe")).toEqual({ rodzaj: "przerwane" });
    expect(uchwyt.stan()).toMatchObject({ rodzaj: "przerwane", wyslano: 6 });
    expect(dostawca.przyjete).toBe(6);
    expect(JSON.parse(magazyn.getItem(KLUCZ_PAMIECI)!)).toMatchObject({ idLekcji: 22, wyslano: 6 });
  });

  it("nowy uchwyt (po ponownym otwarciu karty przeglądarki) czyta przerwane wysyłanie z pamięci", async () => {
    atrapaDostawcy({ przerwijPo: 2 });
    const { uchwyt, nowyUchwyt } = srodowisko();
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    expect(nowyUchwyt().stan()).toEqual({
      rodzaj: "przerwane",
      lekcja: LEKCJA,
      nazwa: "trudny-rozmowca.mp4",
      rozmiar: 10,
      wyslano: 6,
      zastepuje: null,
      innyPlik: false,
    });
  });

  it("w pamięci przeglądarki nie ma podpisu ani niczego z pozwolenia", async () => {
    atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, magazyn } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");

    expect(magazyn.length).toBe(1);
    const surowy = magazyn.getItem(KLUCZ_PAMIECI)!;
    const wpis = JSON.parse(surowy) as Record<string, unknown>;
    expect(Object.keys(wpis).sort()).toEqual([...POLA_WPISU].sort());
    expect(Object.keys(wpis).sort()).toEqual(
      ["adresLekcji", "adresWgrania", "idLekcji", "nazwa", "rozmiar", "tytulLekcji", "wyslano", "zapisano", "zmieniono"].sort(),
    );
    for (const zakazane of [PODPIS, String(TERMIN), ID_NAGRANIA, ID_BIBLIOTEKI]) {
      expect(surowy).not.toContain(zakazane);
    }
    expect(surowy).not.toMatch(/signature|podpis|expir|library|video_id|resumed/i);
    expect(wpis.adresWgrania).toBe(`${ADRES_DOSTAWCY}/1`);
  });
});

describe("dokończenie tym samym plikiem", () => {
  it("serwer oddaje to samo nagranie (`resumed: true`): pytanie o postęp i wysyłka reszty, bez zakładania wgrania", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, zlec, magazyn } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przedDokonczeniem = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    // Po wznowieniu dostawca przyjmuje każdy kawałek w całości.
    dostawca.bajtowNaKawalek = 100;

    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });

    const dokonczenie = dostawca.zadania.slice(przedDokonczeniem);
    expect(dokonczenie.map((zadanie) => zadanie.metoda)).toEqual(["HEAD", "PATCH"]);
    expect(dokonczenie[0].adres).toBe(`${ADRES_DOSTAWCY}/1`);
    expect(dokonczenie[1].adres).toBe(`${ADRES_DOSTAWCY}/1`);
    expect(dokonczenie[1].naglowki["Upload-Offset"]).toBe("3");
    // Po wznowieniu wysłano mniej bajtów, niż ma plik: początek pliku nie idzie drugi raz.
    expect(dostawca.bajtyOd(przedDokonczeniem)).toBe(7);
    expect(dostawca.bajtyOd(przedDokonczeniem)).toBeLessThan(10);
    expect(dostawca.wgran).toBe(1);
    expect(dostawca.przyjete).toBe(10);
    expect(zlec).toHaveBeenCalledTimes(2);
    expect(magazyn.getItem(KLUCZ_PAMIECI)).toBeNull();
  });

  it("nowe pozwolenie idzie na pytaniu o postęp i na każdym kawałku", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przedDokonczeniem = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    await uchwyt.wyslij(plik(), LEKCJA, "dokoncz");
    for (const zadanie of dostawca.zadania.slice(przedDokonczeniem)) {
      expect(zadanie.naglowki).toMatchObject({ AuthorizationSignature: PODPIS, VideoId: ID_NAGRANIA });
    }
  });

  it("odpowiedź serwera bez pola `resumed`: wysyłka od zera", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(undefined);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przedDokonczeniem = dostawca.zadania.length;
    dostawca.przerwijPo = null;

    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });

    const ponowne = dostawca.zadania.slice(przedDokonczeniem);
    expect(ponowne.map((zadanie) => zadanie.metoda)).toEqual(["POST", "PATCH", "PATCH", "PATCH", "PATCH"]);
    expect(ponowne[1].naglowki["Upload-Offset"]).toBe("0");
    expect(ponowne[1].adres).toBe(`${ADRES_DOSTAWCY}/2`);
    expect(dostawca.przyjete).toBe(10);
  });

  it("`resumed: false` (serwer wydał nowe nagranie): wysyłka od zera", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(false);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przedDokonczeniem = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    await uchwyt.wyslij(plik(), LEKCJA, "dokoncz");
    expect(dostawca.zadania.slice(przedDokonczeniem).map((zadanie) => zadanie.metoda)).toEqual([
      "POST",
      "PATCH",
      "PATCH",
      "PATCH",
      "PATCH",
    ]);
  });

  it("dostawca nie zna już wgrania: wysyłka od zera pod nowym adresem", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przedDokonczeniem = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    dostawca.nieZnaWgrania = true;

    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });
    expect(dostawca.zadania.slice(przedDokonczeniem).map((zadanie) => zadanie.metoda)).toEqual([
      "HEAD",
      "POST",
      "PATCH",
      "PATCH",
      "PATCH",
      "PATCH",
    ]);
  });

  it("dokończenie po ponownym otwarciu karty przeglądarki: nowy uchwyt, ten sam plik, reszta bajtów", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 2 });
    const { uchwyt, nowyUchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przedDokonczeniem = dostawca.zadania.length;
    dostawca.przerwijPo = null;

    const poOtwarciu = nowyUchwyt();
    expect(await poOtwarciu.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });
    expect(dostawca.bajtyOd(przedDokonczeniem)).toBe(4 + 1);
    expect(dostawca.bajtyOd(przedDokonczeniem)).toBeLessThan(10);
  });

  it("drugie przerwanie w trakcie dokańczania: dalej „przerwane”, z nową liczbą bajtów", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    dostawca.przerwijPo = 2;
    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "przerwane" });
    expect(uchwyt.stan()).toMatchObject({ rodzaj: "przerwane", wyslano: 6 });
  });
});

describe("inny plik", () => {
  it("przy dokańczaniu: odmowa „to nie jest ten sam plik”, bez pozwolenia i bez żądań do dostawcy", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, zlec } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przed = dostawca.zadania.length;

    expect(await uchwyt.wyslij(innyPlik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "inny-plik" });
    expect(uchwyt.stan()).toMatchObject({ rodzaj: "przerwane", nazwa: "trudny-rozmowca.mp4", wyslano: 3, innyPlik: true });
    expect(zlec).toHaveBeenCalledTimes(1);
    expect(dostawca.zadania).toHaveLength(przed);
  });

  it("po odmowie ten sam plik kończy wysyłanie, a znak „inny plik” znika", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    await uchwyt.wyslij(innyPlik(), LEKCJA, "dokoncz");
    dostawca.przerwijPo = null;
    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });
  });

  it("„wyślij inny plik od nowa”: nowe wgranie od zera, bez pytania dostawcy o postęp", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przed = dostawca.zadania.length;
    dostawca.przerwijPo = null;

    expect(await uchwyt.wyslij(innyPlik(), LEKCJA, "od-nowa")).toEqual({ rodzaj: "wyslane" });
    const metody = dostawca.zadania.slice(przed).map((zadanie) => zadanie.metoda);
    expect(metody[0]).toBe("POST");
    expect(metody).not.toContain("HEAD");
    expect(dostawca.przyjete).toBe(14);
  });

  it("„od nowa” tym samym plikiem też idzie od zera", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przed = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    await uchwyt.wyslij(plik(), LEKCJA, "od-nowa");
    expect(dostawca.zadania.slice(przed).map((zadanie) => zadanie.metoda)).not.toContain("HEAD");
    expect(dostawca.bajtyOd(przed)).toBeGreaterThanOrEqual(10);
  });
});

describe("wpis starszy niż sześć godzin", () => {
  it("nowy uchwyt nie pokazuje przerwanego wysyłania i usuwa wpis", async () => {
    atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, nowyUchwyt, zegar, magazyn } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    zegar.teraz += WAZNOSC_WPISU_MS;
    expect(nowyUchwyt().stan()).toEqual({ rodzaj: "brak" });
    expect(magazyn.getItem(KLUCZ_PAMIECI)).toBeNull();
  });

  it("ten sam plik po sześciu godzinach: od zera, bez pytania dostawcy o postęp", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, zegar } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    const przed = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    zegar.teraz += WAZNOSC_WPISU_MS;

    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });
    expect(dostawca.zadania.slice(przed).map((zadanie) => zadanie.metoda)).toEqual(["POST", "PATCH", "PATCH", "PATCH", "PATCH"]);
  });

  it("inny plik po sześciu godzinach: bez odmowy i bez pytania osoby — zwykłe wysyłanie od zera", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, zegar } = srodowisko(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    dostawca.przerwijPo = null;
    zegar.teraz += WAZNOSC_WPISU_MS + 1;
    expect(await uchwyt.wyslij(innyPlik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });
  });

  it("wiek liczy się od rozpoczęcia wysyłania, nie od ostatniego kawałka ani od dokańczania", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, zegar, magazyn } = srodowisko(true);
    const poczatek = zegar.teraz;
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    zegar.teraz += WAZNOSC_WPISU_MS - 1000;
    dostawca.przerwijPo = 2;
    await uchwyt.wyslij(plik(), LEKCJA, "dokoncz");
    expect((JSON.parse(magazyn.getItem(KLUCZ_PAMIECI)!) as { zapisano: number }).zapisano).toBe(poczatek);
  });
});

describe("pamięć przeglądarki niedostępna", () => {
  function bezPamieci(resumed?: boolean) {
    const zlec = vi.fn(async () => pozwolenie(resumed));
    return { zlec, uchwyt: utworzUchwyt({ zlec, magazyn: () => null, teraz: () => Date.UTC(2026, 9, 1, 12, 0, 0) }) };
  }

  it("dokończenie tym samym plikiem działa do przeładowania dokumentu", async () => {
    const dostawca = atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = bezPamieci(true);
    expect(await uchwyt.wyslij(plik(), LEKCJA, "nowe")).toEqual({ rodzaj: "przerwane" });
    const przed = dostawca.zadania.length;
    dostawca.przerwijPo = null;
    expect(await uchwyt.wyslij(plik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "wyslane" });
    expect(dostawca.zadania[przed].metoda).toBe("HEAD");
  });

  it("inny plik też dostaje odmowę", async () => {
    atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt, zlec } = bezPamieci(true);
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    expect(await uchwyt.wyslij(innyPlik(), LEKCJA, "dokoncz")).toEqual({ rodzaj: "inny-plik" });
    expect(zlec).toHaveBeenCalledTimes(1);
  });
});

describe("porzucenie wysyłania", () => {
  it("usuwa wpis, przerywa trwające wysyłanie i zostawia stan „brak”", async () => {
    atrapaDostawcy();
    const { uchwyt, magazyn } = srodowisko();
    uchwyt.subskrybuj(() => {
      const stan = uchwyt.stan();
      if (stan.rodzaj === "wysylanie" && stan.wyslano === 3) uchwyt.porzuc(22);
    });
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    expect(uchwyt.stan()).toEqual({ rodzaj: "brak" });
    expect(magazyn.getItem(KLUCZ_PAMIECI)).toBeNull();
  });

  it("porzucenie innej lekcji niczego nie zmienia", async () => {
    atrapaDostawcy({ przerwijPo: 1 });
    const { uchwyt } = srodowisko();
    await uchwyt.wyslij(plik(), LEKCJA, "nowe");
    uchwyt.porzuc(23);
    expect(uchwyt.stan().rodzaj).toBe("przerwane");
  });
});
