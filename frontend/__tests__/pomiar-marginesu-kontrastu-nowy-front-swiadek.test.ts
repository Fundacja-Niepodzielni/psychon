// @vitest-environment node
//
// Świadek dla czterech funkcji eksportowanych z scripts/pomiar-marginesu-kontrastu.mjs
// (dodatek nowy front: wyklasyfikujTokenyTresci, zbudujParyTekstuNaPowierzchni,
// wczytajProdukcyjneTokenyTresci, zbudujParyDodatkoweNowegoFrontu), które dziś
// w drzewie nie mają żadnego wołającego poza main() tego samego pliku —
// zachowanie, które odbierający zmierzył ręcznie, nie miało świadka, który
// zgaśnie przy regresji do ręcznej listy. Ten plik NIE zmienia przyrządu
// (frontend/scripts/pomiar-marginesu-kontrastu.mjs jest tylko do czytania).
//
// Środowisko `node` z tego samego powodu co w
// pomiar-marginesu-kontrastu-znana-lista.test.ts: przyrząd liczy własną
// ścieżkę z `import.meta.url`, co pod jsdom nie działa.

import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  wyklasyfikujTokenyTresci,
  zbudujParyTekstuNaPowierzchni,
  wczytajProdukcyjneTokenyTresci,
  TOKENY_POZA_ZAKRESEM,
} from "../scripts/pomiar-marginesu-kontrastu.mjs";

const SCIEZKA_SKRYPTU = fileURLToPath(new URL("../scripts/pomiar-marginesu-kontrastu.mjs", import.meta.url));
const SCIEZKA_GLOBALS_CSS = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const SCIEZKA_TOKENY_CSS = fileURLToPath(new URL("../design-system/tokeny/tokeny.css", import.meta.url));

// ---------------------------------------------------------------------------
// Liczba mierzonych par wynika z ZAWARTOŚCI arkusza, nie z listy w
// skrypcie. Perturbacja W PRÓBIE (dwa dodatkowe tokeny dopisane do arkusza
// TU, nie w drzewie): liczba par musi wzrosnąć o KONKRETNĄ, wyliczoną liczbę,
// nie tylko "być większa niż zero".
//
// `zbudujParyTekstuNaPowierzchni` PRZYJMUJE arkusz (`tokenyMotywow`) jako
// argument — nie czyta pliku sama — więc ten punkt NIE kończy się kodem 2:
// perturbacja w drzewie testowym jest możliwa wprost, bez dotykania
// tokeny.css na dysku.
//
// `wyklasyfikujTokenyTresci` (wołana wewnątrz) sprawdza
// rejestr "poza zakresem" BEZWARUNKOWO, bez progu większości — więc arkusz
// syntetyczny poniżej, który nie zawiera ŻADNEGO z 20 wpisów produkcyjnego
// `TOKENY_POZA_ZAKRESEM`, musi jawnie zadeklarować WŁASNY, pusty rejestr
// (`[]`) jako drugi argument: "dla TEGO arkusza oczekuję zera wpisów poza
// zakresem". Bez tej deklaracji dostałby domyślny, pełny rejestr i rzucił —
// dokładnie tak, jak ma rzucać produkcja z niepełnymi danymi.
// ---------------------------------------------------------------------------
describe("zbudujParyTekstuNaPowierzchni: liczba par wynika z zawartości arkusza (perturbacja w próbie)", () => {
  it("arkusz bazowy (1 tekst × 1 powierzchnia) daje dokładnie 2 pary (×2 motywy)", () => {
    const arkuszBazowy = {
      jasny: { text: "#111111", bg: "#ffffff" },
      ciemny: { text: "#eeeeee", bg: "#000000" },
    };
    const { wynik, oczekiwanePary } = zbudujParyTekstuNaPowierzchni(arkuszBazowy, []);
    expect(oczekiwanePary).toBe(2);
    expect(wynik.length).toBe(2);
  });

  it("dopisanie W ARKUSZU dwóch tokenów (1 tekst + 1 powierzchnia) podnosi liczbę par z 2 na DOKŁADNIE 8, nie tylko 'więcej niż 0'", () => {
    const arkuszBazowy = {
      jasny: { text: "#111111", bg: "#ffffff" },
      ciemny: { text: "#eeeeee", bg: "#000000" },
    };
    const arkuszZDwomaDodatkowymiTokenami = {
      jasny: { ...arkuszBazowy.jasny, "text-dodatkowy": "#222222", "bg-dodatkowy": "#dddddd" },
      ciemny: { ...arkuszBazowy.ciemny, "text-dodatkowy": "#cccccc", "bg-dodatkowy": "#333333" },
    };

    const bazowy = zbudujParyTekstuNaPowierzchni(arkuszBazowy, []);
    const rozszerzony = zbudujParyTekstuNaPowierzchni(arkuszZDwomaDodatkowymiTokenami, []);

    // (1+1) tekstów × (1+1) powierzchni × 2 motywy = 8 — liczba wynika z
    // ZAWARTOŚCI arkusza podanego w tym wywołaniu, nie z listy w skrypcie
    // (skrypt nie zna nazw "text-dodatkowy"/"bg-dodatkowy" z góry).
    expect(bazowy.oczekiwanePary).toBe(2);
    expect(rozszerzony.oczekiwanePary).toBe(8);
    expect(rozszerzony.wynik.length).toBe(8);
    expect(rozszerzony.wynik.length).toBeGreaterThan(bazowy.wynik.length);

    const etykietyRozszerzone = rozszerzony.wynik.map((w) => w.etykieta);
    expect(etykietyRozszerzone.some((e) => e.includes("text-dodatkowy") && e.includes("bg-dodatkowy"))).toBe(true);
  });

  it("wczytajProdukcyjneTokenyTresci() nie przyjmuje arkusza jako argumentu — czyta tokeny.css sama (patrz kod 2 niżej, punkt osobny)", () => {
    // wczytajProdukcyjneTokenyTresci() ma sygnaturę bezargumentową i czyta
    // SCIEZKA_TOKENY_CSS z dysku wprost — w przeciwieństwie do
    // zbudujParyTekstuNaPowierzchni (wyżej) NIE da się jej przeperturbować
    // z poziomu próby bez dotknięcia pliku na dysku. Zgodnie z pismem: to
    // jest odnotowane, kod 2 dla TEGO punktu, zmiana przyrządu nie jest
        // robiona. Zdanie, co trzeba by zmienić: `wczytajProdukcyjneTokenyTresci`
    // musiałaby przyjmować opcjonalny parametr ścieżki (albo już wczytany
    // tekst CSS) zamiast na stałe używać `SCIEZKA_TOKENY_CSS`, żeby dało się
    // ją testować przez wstrzyknięcie arkusza zamiast pliku na dysku.
    expect(wczytajProdukcyjneTokenyTresci.length).toBe(0);
    process.exitCode = undefined; // ten plik NIE wywołuje process.exit — kod 2 jest meldowany, nie egzekwowany tu
    console.error(
      "funkcja czytająca plik sama, nie arkusz jako argument — kod 2: wczytajProdukcyjneTokenyTresci() nie przyjmuje arkusza, czyta design-system/tokeny/tokeny.css sama.",
    );
    expect(2).toBe(2); // patrz opis wyżej — punkt jawnie odnotowany, nie ukryty w zieleni
  });
});

// ---------------------------------------------------------------------------
// Token niedający się zaklasyfikować (ani tekst, ani powierzchnia, ani
// poza zakresem) ma kończyć CAŁY PRZYRZĄD kodem 2 I nazywać ten token w
// komunikacie. Sprawdzamy OBA — kod wyjścia procesu ORAZ treść komunikatu —
// nie samą zgodność kodu.
//
// `wyklasyfikujTokenyTresci` sama tylko RZUCA (nie ustawia kodu procesu) —
// kod 2 nadaje dopiero `main()` w tym samym pliku (catch -> process.exit(2)).
// Żeby zmierzyć TO zachowanie (kod procesu), uruchamiamy przyrząd jako
// osobny proces Node, na KOPII plików wejściowych w katalogu tymczasowym
// (kopia globals.css + kopia tokeny.css z jednym dopisanym, sztucznie
// nieklasyfikowalnym tokenem) — bez dotykania jakiegokolwiek pliku w drzewie
// repo (frontend/scripts/pomiar-marginesu-kontrastu.mjs pozostaje
// nietknięty, design-system/tokeny/tokeny.css też).
// ---------------------------------------------------------------------------
describe("token niesklasyfikowalny: kod 2 I nazwa tokenu w komunikacie (proces CLI, kopia na dysku tymczasowym)", () => {
  const NAZWA_TOKENU_SWIADKA = "zzz-swiadek-k2-niesklasyfikowalny";
  let katalogTymczasowy: string | null = null;

  afterEach(() => {
    if (katalogTymczasowy) {
      rmSync(katalogTymczasowy, { recursive: true, force: true });
      katalogTymczasowy = null;
    }
  });

  function przygotujKopieZDodatkowymTokenem(): string {
    const dir = mkdtempSync(join(tmpdir(), "swiadek-pary-k2-"));
    mkdirSync(join(dir, "scripts"), { recursive: true });
    mkdirSync(join(dir, "app"), { recursive: true });
    mkdirSync(join(dir, "design-system", "tokeny"), { recursive: true });

    copyFileSync(SCIEZKA_SKRYPTU, join(dir, "scripts", "pomiar-marginesu-kontrastu.mjs"));
    copyFileSync(SCIEZKA_GLOBALS_CSS, join(dir, "app", "globals.css"));

    const tokenyOryginalne = readFileSync(SCIEZKA_TOKENY_CSS, "utf8");
    // Dopisujemy token o nazwie, która NIE pasuje do żadnego korzenia
    // (ink/text/muted/subtle/bg/card/grey) i której NIE ma w
    // TOKENY_POZA_ZAKRESEM — w OBU blokach (:root jasny i @media dark), żeby
    // zestaw nazw jasny/ciemny się zgadzał i przyrząd doszedł do klasyfikacji,
    // a nie zatrzymał się wcześniej na kontroli spójności motywów.
    const wiersz = `  --${NAZWA_TOKENU_SWIADKA}: #123456;\n`;
    const tokenyZDodatkiem = tokenyOryginalne
      .replace(/:root\s*\{/, (m) => `${m}\n${wiersz}`)
      .replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/, (m) => `${m}\n${wiersz}`);

    writeFileSync(join(dir, "design-system", "tokeny", "tokeny.css"), tokenyZDodatkiem, "utf8");
    return dir;
  }

  it("proces kończy się kodem 2 I stderr wymienia nazwę niesklasyfikowanego tokenu", () => {
    katalogTymczasowy = przygotujKopieZDodatkowymTokenem();
    const wynik = spawnSync(
      process.execPath,
      [join(katalogTymczasowy, "scripts", "pomiar-marginesu-kontrastu.mjs")],
      { encoding: "utf8" },
    );

    // Oba warunki sprawdzane osobno — sama zgodność kodu nie wystarcza
    // (patrz pismo: "sama zgodność kodu nie wystarcza").
    expect(wynik.status).toBe(2);
    expect(wynik.stderr).toContain(NAZWA_TOKENU_SWIADKA);
    // Kontrola negatywna wewnątrz tej samej próby: komunikat nie jest pusty
    // ani ogólnikowy — zawiera też słowo wskazujące na klasyfikację, nie
    // przypadkowe dopasowanie substringu gdzie indziej w wyjściu.
    expect(wynik.stderr).toMatch(/zaklasyfikować/);
  });

  it("kontrola negatywna: BEZ dopisanego tokenu (kopia niezmieniona) proces NIE kończy się kodem 2 z tego powodu — odróżnia 'ten token' od 'cokolwiek'", () => {
    const dir = mkdtempSync(join(tmpdir(), "swiadek-pary-k2-kontrola-"));
    mkdirSync(join(dir, "scripts"), { recursive: true });
    mkdirSync(join(dir, "app"), { recursive: true });
    mkdirSync(join(dir, "design-system", "tokeny"), { recursive: true });
    copyFileSync(SCIEZKA_SKRYPTU, join(dir, "scripts", "pomiar-marginesu-kontrastu.mjs"));
    copyFileSync(SCIEZKA_GLOBALS_CSS, join(dir, "app", "globals.css"));
    copyFileSync(SCIEZKA_TOKENY_CSS, join(dir, "design-system", "tokeny", "tokeny.css"));

    try {
      const wynik = spawnSync(process.execPath, [join(dir, "scripts", "pomiar-marginesu-kontrastu.mjs")], {
        encoding: "utf8",
      });
      // Bez wtrętu: albo kod 0 (wszystko powyżej progu), albo kod 3/4
      // (ZMIERZONE NARUSZENIE — stan dzisiejszych barw, nie klasyfikacji),
      // nigdy kod 2 z powodu klasyfikacji, i z pewnością nigdy nazwa świadka.
      expect(wynik.status).not.toBe(2);
      expect(wynik.stderr).not.toContain(NAZWA_TOKENU_SWIADKA);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Bilans: tekst + powierzchnia + poza zakresem == liczba odkrytych
// tokenów, sprawdzony WPROST (dziś ten wiersz nie ma własnego trybu upadku —
// zapadka siedzi wyłącznie w rzucie z klasyfikacji, patrz
// `wyklasyfikujTokenyTresci`: rzuca dla sprzecznych/niesklasyfikowanych, ale
// NIC nie sprawdza sumy explicite). Ta próba sprawdza równość WPROST, więc
// przestaje zależeć od tego, że coś inne rzuci wyjątek.
// ---------------------------------------------------------------------------
describe("bilans tekst+powierzchnia+pozaZakresem == liczba odkrytych tokenów (sprawdzone wprost)", () => {
  it("na danych PRODUKCYJNYCH (design-system/tokeny/tokeny.css, motyw jasny): suma trzech kubełków równa się liczbie nazw odkrytych", () => {
    const { jasny } = wczytajProdukcyjneTokenyTresci();
    const nazwyOdkryte = Object.keys(jasny);
    const { teksty, powierzchnie, pozaZakresu } = wyklasyfikujTokenyTresci(nazwyOdkryte);

    const suma = teksty.length + powierzchnie.length + pozaZakresu.length;
    expect(suma).toBe(nazwyOdkryte.length);
    // Bilans WPROST, nie przez brak wyjątku: każda odkryta nazwa trafia do
    // dokładnie jednego kubełka spośród trzech (żadna nie ginie, żadna nie
    // jest liczona dwa razy).
    const wszystkieTrzyRazem = [...teksty, ...powierzchnie, ...pozaZakresu].sort();
    expect(wszystkieTrzyRazem).toEqual([...nazwyOdkryte].sort());
  });

  it("na danych SYNTETYCZNYCH (arkusz zbudowany w tej próbie, 3 tekst + 2 powierzchnia + 1 poza zakresem): bilans = 6, sprawdzony liczbą, nie brakiem wyjątku", () => {
    // "border" jest w TOKENY_POZA_ZAKRESEM w przyrządzie (obrys, zakres
    // równoległej gałęzi) — użyty tu jako jedyny token poza zakresem.
    // Kontrola kompletności rejestru jest teraz bezwarunkowa
    // (bez progu większości), więc ten arkusz syntetyczny — który celowo NIE
    // zawiera pozostałych 19 wpisów `TOKENY_POZA_ZAKRESEM` produkcji — podaje
    // WŁASNY, jawnie zadeklarowany rejestr jako drugi argument: "dla TEGO
    // arkusza oczekuję DOKŁADNIE wpisu 'border', nic więcej". Wyciągnięty z
    // `TOKENY_POZA_ZAKRESEM` (nie przepisany ręcznie), więc gdyby "border"
    // przestał tam być wpisany, ten `find` da `undefined` i próba niżej ma
    // rzucić (nie dać cichego bilansu 5 zamiast 6) — patrz kontrola niżej.
    const wpisBorder = TOKENY_POZA_ZAKRESEM.find((t) => t.nazwa === "border");
    if (!wpisBorder) throw new Error("brak wpisu 'border' w TOKENY_POZA_ZAKRESEM");
    const wlasnyRejestr = [wpisBorder];

    const nazwyOdkryte = ["ink", "text-jakis", "muted", "bg", "card-warm", "border"];
    const { teksty, powierzchnie, pozaZakresu } = wyklasyfikujTokenyTresci(nazwyOdkryte, wlasnyRejestr);
    expect(teksty.length).toBe(3); // ink, text-jakis, muted
    expect(powierzchnie.length).toBe(2); // bg, card-warm
    expect(pozaZakresu.length).toBe(1); // border
    expect(teksty.length + powierzchnie.length + pozaZakresu.length).toBe(6);
    expect(teksty.length + powierzchnie.length + pozaZakresu.length).toBe(nazwyOdkryte.length);
  });
});

// ---------------------------------------------------------------------------
// Wpis w rejestrze tokenów POZA ZAKRESEM dla tokenu USUNIĘTEGO z
// arkusza ma dać sygnał. Część STATUSOWA (`sprawdzWzgledemZnanejListy`) ma
// dokładnie taki mechanizm dla ETYKIETY_PAR_ZNANE/NAZWY_TEL_ZNANE (wykrywa
// "już nie istnieje"). Część NOWEGO FRONTU (`wyklasyfikujTokenyTresci`) NIE
// MA odpowiednika dla TOKENY_POZA_ZAKRESEM: funkcja klasyfikuje tylko to, co
// dostała w `nazwyOdkryte" — nazwa z TOKENY_POZA_ZAKRESEM, której zabrakło w
// `nazwyOdkryte` (bo token zniknął z tokeny.css), nie zostawia dziś ŻADNEGO
// śladu w zwróconym wyniku.
//
// Ta próba jest ZGODNIE Z PISMEM pozostawiona CZERWONA: dokumentuje rozjazd,
// nie jest naciągana do zieleni.
// ---------------------------------------------------------------------------
describe("token USUNIĘTY z arkusza, obecny w rejestrze poza zakresem, ma dać sygnał (oczekiwanie CZERWONE — mechanizmu dziś nie ma)", () => {
  it("usunięcie 'invert-link' (wpis z TOKENY_POZA_ZAKRESEM) z nazw odkrytych ma zgłosić nieaktualny wpis — DZIŚ NIE ZGŁASZA, rozjazd odnotowany wyżej", () => {
    const { jasny } = wczytajProdukcyjneTokenyTresci();
    // "invert-link" jest dziś w tokeny.css (potwierdzone niżej) I jest
    // wpisem w TOKENY_POZA_ZAKRESEM w przyrządzie (czytane z pliku).
    // Symulujemy jego usunięcie z arkusza
    // (perturbacja W PRÓBIE, plik na dysku nietknięty).
    expect(Object.keys(jasny)).toContain("invert-link");
    const nazwyPoUsunieciu = Object.keys(jasny).filter((n) => n !== "invert-link");

    // Oczekiwanie: klasyfikacja tokenu usuniętego z arkusza, ale
    // wciąż zarejestrowanego w rejestrze "poza zakresem", ma rzucić/zgłosić
    // sygnał o nieaktualnym wpisie (analogicznie do "już nie istnieje" w
    // części statusowej). Dziś `wyklasyfikujTokenyTresci` nie ma takiego
    // mechanizmu — wywołanie przechodzi CICHO, bez zgłoszenia — więc to
    // `expect` NIE PRZEJDZIE. To jest zamierzony, czerwony wynik tej próby.
    expect(() => wyklasyfikujTokenyTresci(nazwyPoUsunieciu)).toThrow(/invert-link/);
  });
});

// ---------------------------------------------------------------------------
// Kontrola kompletności rejestru "poza zakresem" jest
// BEZWARUNKOWA, bez progu większości: dawniej zgłaszała dopiero przy > połowy
// rejestru (20 wpisów) obecnej, milczała przy 10 z 20 i mniej — WŁĄCZNIE z
// 0 z 20, czyli gdy CAŁY rejestr jest nieaktualny. Ten punkt sprawdza
// dokładnie odwrotność: przy 0 z 20 obecnych bieg PADA i wymienia WSZYSTKICH
// 20 nazw — nie mniej, nie cisza.
// ---------------------------------------------------------------------------
describe("rejestr poza zakresem sprawdzany bezwarunkowo, bez progu", () => {
  it("TOKENY_POZA_ZAKRESEM eksportowany ma dziś dokładnie 20 wpisów (liczba, na której opiera się reszta tego bloku)", () => {
    expect(TOKENY_POZA_ZAKRESEM.length).toBe(20);
  });

  it("0 z 20 obecnych (rejestr PEŁNY, domyślny — brak drugiego argumentu): bieg PADA i wymienia WSZYSTKICH 20 nazw", () => {
    // nazwyOdkryte celowo nie zawiera ŻADNEGO z 20 wpisów TOKENY_POZA_ZAKRESEM
    // — tylko dwie nazwy pasujące do korzeni tekst/powierzchnia, żeby przyrząd
    // doszedł do kontroli kompletności rejestru zamiast zatrzymać się
    // wcześniej na "niezaklasyfikowane".
    const nazwyOdkryte = ["ink", "bg"];
    let komunikat = "";
    expect(() => {
      try {
        wyklasyfikujTokenyTresci(nazwyOdkryte);
      } catch (err) {
        komunikat = (err as Error).message;
        throw err;
      }
    }).toThrow();
    for (const wpis of TOKENY_POZA_ZAKRESEM) {
      expect(komunikat).toContain(`--${wpis.nazwa}`);
    }
  });

  it("przemiotło 0..20: dla KAŻDEJ liczby obecnych wpisów rejestru (0, 1, 2, ..., 20) liczba wypisanych brakujących nazw równa się DOKŁADNIE liczbie nieobecnych — bez wyjątku, bez progu", () => {
    // Ta sama technika, jaką wcześniej zmierzono ręcznie
    // (podmiana warunku na `true`, przemiot 0..20) — tu przemiatamy PRAWDZIWY,
    // bezwarunkowy kod produkcyjny (nie kopię z podmienionym warunkiem),
    // wołając funkcję eksportowaną wprost z przyrządu.
    const tabela: Array<{ obecnychWRejestrze: number; brakujacychZgloszonych: number; zgadzaSie: boolean }> = [];

    for (let obecnychWRejestrze = 0; obecnychWRejestrze <= TOKENY_POZA_ZAKRESEM.length; obecnychWRejestrze++) {
      // `obecnychWRejestrze` pierwszych wpisów rejestru "istnieje" w arkuszu —
      // reszta jest nieobecna. Dwie nazwy spoza rejestru (ink, bg) obecne
      // zawsze, żeby przyrząd nie rzucił "0 tokenów pasujących do korzeni"
      // wcześniej, zanim dojdzie do kontroli kompletności rejestru.
      const obecneNazwyZRejestru = TOKENY_POZA_ZAKRESEM.slice(0, obecnychWRejestrze).map((t) => t.nazwa);
      const nazwyOdkryte = ["ink", "bg", ...obecneNazwyZRejestru];

      let brakujacychZgloszonych: number;
      try {
        wyklasyfikujTokenyTresci(nazwyOdkryte);
        brakujacychZgloszonych = 0; // brak wyjątku = przyrząd twierdzi, że zero brakuje
      } catch (err) {
        const komunikat = (err as Error).message;
        brakujacychZgloszonych = TOKENY_POZA_ZAKRESEM.filter(
          (t) => komunikat.includes(`--${t.nazwa}`) && !obecneNazwyZRejestru.includes(t.nazwa),
        ).length;
      }

      const brakujacychOczekiwanych = TOKENY_POZA_ZAKRESEM.length - obecnychWRejestrze;
      tabela.push({
        obecnychWRejestrze,
        brakujacychZgloszonych,
        zgadzaSie: brakujacychZgloszonych === brakujacychOczekiwanych,
      });
      expect(brakujacychZgloszonych).toBe(brakujacychOczekiwanych);
    }

    // Wydrukuj tabelę do dziennika (widoczna w wyjściu `vitest run` dla tego pliku).
    console.log("\n=== przemiotło 0..20 (obecnych w rejestrze -> zgłoszonych brakujących) ===");
    for (const wiersz of tabela) {
      console.log(
        `obecnych=${String(wiersz.obecnychWRejestrze).padStart(2)}  brakujące_oczekiwane=${String(20 - wiersz.obecnychWRejestrze).padStart(2)}  brakujące_zgłoszone=${String(wiersz.brakujacychZgloszonych).padStart(2)}  zgadza_się=${wiersz.zgadzaSie}`,
      );
    }
    expect(tabela.every((w) => w.zgadzaSie)).toBe(true);
    expect(tabela.length).toBe(21); // 0..20 włącznie
  });
});
