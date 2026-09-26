#!/usr/bin/env node
// Wołający dla design-system/poligon/pomiar-celow-dotyku.mjs.
//
// Przed tym plikiem nic nie wołało pomiar-celow-dotyku.mjs: przeszukanie repozytorium
// (*.sh *.yml *.yaml *.json *.md *.mjs *.ps1) dawało 0 trafień — skrypt
// czerwienił się poprawnie, ale nic go nie uruchamiało, więc nikt tego nie
// widział. Ten plik nie mierzy niczego sam — buduje statyczny poligon,
// odpala go lokalnym serwerem podglądu, czeka aż odpowiada, uruchamia
// pomiar-celow-dotyku.mjs i NIE przenosi jego kod wyjścia ślepo: kod 1 ("naruszenia")
// wolno oddać na zewnątrz WYŁĄCZNIE gdy pomiar-celow-dotyku.mjs zwrócił dokładnie 0
// albo 1 (patrz gałąź "else" na końcu tego pliku).
//
// Co konkretnie daje kod 2 = NIE ZMIERZONO — wyliczenie wyprowadzone grepem
// po tym pliku, po trzech kształtach (`process.exit`, `return` z kodem,
// przypisanie do `kodWyjscia`). Metoda pokazuje pozycje tych trzech
// kształtów, nie twierdzi, że innych ścieżek wyjścia nie ma — granica tej
// listy jest nazwana pod nią:
//   - w linii 145: nieudany build poligonu (uruchomSynchronicznie zwraca
//     kod liczbowy != 0),
//   - w linii 278: port zajęty (serwer podglądu odmawia startu z
//     --strict-port),
//   - w linii 278: serwer podglądu kończy się przedwcześnie z INNEGO
//     powodu niż zajęty port (np. błąd jego własnej konfiguracji) — ten
//     sam branch "zakonczony" co punkt wyżej, rozróżniony testem stderr na
//     EADDRINUSE (patrz `portZajety` niżej w tym pliku),
//   - w linii 283: serwer nasłuchuje, ale nie odpowiada w
//     LIMIT_CZEKANIA_MS (20s, liczone OD wejścia w czekajNaSerwer(), czyli
//     PO budowie — patrz ta funkcja),
//   - w linii 220: przerwanie tego procesu sygnałem (SIGINT/SIGTERM/SIGHUP),
//   - w linii 127: błąd samego spawnu dziecka (np. ENOENT) — spawnSync
//     zwraca `error` zamiast statusu (zmierzone sondą, win32:
//     `B_BLAD_SPAWNU={"error":"ENOENT","status":null}`) — wspólne dla
//     kroku budowy i kroku pomiaru, bo oba wołają uruchomSynchronicznie,
//   - w linii 131: dziecko ubite sygnałem — POSIX daje wtedy
//     `status === null` (na Windows sonda dała
//     `A_UBITE={"status":1,"signal":null}`; gałąź `status === null` po
//     sygnale jest POSIX-owa — na tej maszynie nie została zmierzona
//     żadnym biegiem, bo sonda wyżej działała na Windows) — tak samo
//     wspólne dla obu kroków,
//   - w linii 309: pomiar-celow-dotyku.mjs, który zwrócił kod inny niż 0 i 1 (jego
//     jedyna dziś istniejąca taka gałąź to w linii 83 pomiar-celow-dotyku.mjs:
//     exit(3), np. brak przeglądarki — ale warunek w linii 301 tego pliku
//     łapie KAŻDY kod różny od 0 i 1 wracający tą drogą, nie wyłącznie 3).
// Te dwie środkowe pozycje (w linii 127, w linii 131: błąd spawnu, dziecko
// ubite sygnałem) to powód, dla którego uruchomSynchronicznie (patrz niżej)
// zwraca strukturę { kod, powod } zamiast gołej liczby: `kod` jest `null`,
// gdy proces w ogóle nie oddał kodu wyjścia, a oba miejsca drukujące
// (gałąź budowy i gałąź pomiaru) piszą wtedy `powod`, nie zmyślony
// "exit N".
//
// Granica powyższej listy: to są miejsca, gdzie TEN plik (albo, przy
// ostatniej pozycji, wprost pomiar-celow-dotyku.mjs) sam ustawia albo zwraca kod
// wyjścia. Poza nią zostaje `serwer` (spawn w linii 168, asynchroniczny,
// nie spawnSync) — ten plik NIE rejestruje dla niego
// `serwer.on("error", ...)`. Ścieżka nieopisana wyżej: nieobsłużone
// zdarzenie "error" na `serwer` kończy ten proces kodem, który oddaje
// domyślna obsługa nieprzechwyconego wyjątku w Node.js, nie żadna z linii
// wypisanych wyżej; ten kod nie jest pomiarem.
//
// Znana, zmierzona, NIENAPRAWIONA luka (ten commit jej nie zamyka — patrz
// design-system/poligon/pomiar-celow-dotyku.mjs, komentarz przy imporcie): awaria
// ładowania modułu w pomiar-celow-dotyku.mjs (dwa importy na początku pliku, PRZED
// osłoną try niżej w tym samym pliku) kończy dziecko nieprzechwyconym
// wyjątkiem = domyślny kod 1 Node.js. Z punktu widzenia spawnSync to zwykłe,
// kompletne zakończenie (status=1, brak `error`) — nieodróżnialne stąd od
// realnie wykrytego naruszenia, bo rozstrzyga się wcześniej, w samym
// pomiar-celow-dotyku.mjs, poza zasięgiem tego pliku. Zmierzone (odbiór 2bd5f6b, bieg
// M6): `real 0m3.889s`, `KOD_REALNY=1`, `Error [ERR_MODULE_NOT_FOUND]`, zero
// linii `NIE ZMIERZONO`, 0 z 40 oczekiwanych pomiarów.
//
// Uruchamiany poleceniem `npm run pomiar:cele-dotyku`. Wpięty w
// `.github/workflows/ci.yml` jako krok zadania „Frontend (lint + build)” —
// zmierzone: `git grep -c "pomiar:cele-dotyku" -- .github` daje 1 trafienie. Jego
// czerwień (kod 1 lub 2) zatrzymuje więc ten zestaw; krok NIE zastępuje ani
// nie rozluźnia żadnego istniejącego — kontrast koloru w `public-a11y.spec.ts`
// zostaje osobnym, nietkniętym krokiem.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Port pochodzi z PORT_POLIGONU (domyślnie 4173) — JEDYNE miejsce w tym pliku,
// które zna wartość domyślną. Od razu wpisujemy ją z powrotem do
// process.env, żeby pomiar-celow-dotyku.mjs (uruchamiany niżej jako dziecko przez
// uruchomSynchronicznie, które dziedziczy env) czytał DOKŁADNIE tę samą
// wartość tą samą drogą — bez tego byłyby dwa niezależne miejsca ze znajomością
// portu, których nic nie porównuje, i rozjazd byłby możliwy bez żadnego błędu.
const PORT = process.env.PORT_POLIGONU || "4173";
process.env.PORT_POLIGONU = PORT;
const URL_PODGLADU = `http://127.0.0.1:${PORT}/`;
const KATALOG_FRONTEND = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Trzy rozłączne kody wyjścia tego wołającego:
//   0 = zmierzono, poligon czysty
//   1 = zmierzono, pomiar REALNIE wykrył naruszenia (albo rozjazd rejestru
//       celów) — jedyne dopuszczalne źródło tego kodu to własny kod 0 albo 1
//       zwrócony przez pomiar-celow-dotyku.mjs, nigdy domysł ani przepisanie czegoś
//       innego. WYJĄTEK, dziś nienaprawiony i nazwany w nagłówku pliku:
//       awaria ładowania modułu w pomiar-celow-dotyku.mjs też oddaje jego kod 1, bez
//       żadnego pomiaru — z tego miejsca nieodróżnialna od realnego 1.
//   2 = NIE ZMIERZONO — powód nie ma nic wspólnego z jakością poligonu: port,
//       build, brak odpowiedzi serwera, przerwanie, ALBO pomiar-celow-dotyku.mjs, który
//       nie zdołał uruchomić narzędzia pomiarowego (jego własny kod inny niż
//       0/1 — patrz ten plik). Bramka, która pada z cudzego powodu tym samym
//       kodem co prawdziwe naruszenie, uczy zespół ignorować czerwień, a
//       prędzej czy później dostaje `continue-on-error`.
const KOD_NIE_ZMIERZONO = 2;

// Zwraca { kod, powod }, NIE gołą liczbę: `kod` jest `null` dokładnie wtedy,
// gdy proces nie oddał żadnego kodu wyjścia (spawn padł zanim cokolwiek
// wystartowało, albo dziecko zabił sygnał) — czyli gdy nie ma czego przełożyć
// na 0/1, więc dawne `?? 1` ("brak kodu → udawaj, że to 1") pisało "zmierzono
// naruszenie" o biegu, w którym nic się nie zmierzyło. `powod` jest tekstem
// WYŁĄCZNIE gdy `kod === null` — obaj wołający (budowa, pomiar) drukują ten
// tekst zamiast zmyślonego "exit N". Ta funkcja NIE rozróżnia (i nie może)
// kodu 1 "dziecko zmierzyło i zgłosiło naruszenie" od kodu 1 "dziecko padło
// nieprzechwyconym wyjątkiem, zanim zmierzyło cokolwiek" — oba to zwykłe,
// kompletne zakończenie procesu z punktu widzenia spawnSync (status=1, brak
// `error`). Ta druga droga to nazwana w nagłówku pliku, nienaprawiona luka.
function uruchomSynchronicznie(polecenie, argumenty) {
  const wynik = spawnSync(polecenie, argumenty, {
    stdio: "inherit",
    cwd: KATALOG_FRONTEND,
    shell: process.platform === "win32",
  });
  if (wynik.error) {
    return { kod: null, powod: `nie udalo sie uruchomic "${polecenie}": ${wynik.error.message}` };
  }
  if (wynik.status === null) {
    // POSIX: dziecko ubite sygnałem przed oddaniem kodu wyjścia (np. OOM).
    return { kod: null, powod: `proces "${polecenie}" zostal przerwany sygnalem ${wynik.signal ?? "nieznanym"}` };
  }
  return { kod: wynik.status, powod: null };
}

// 1) Statyczny build poligonu — bez niego `vite preview` nie ma czego serwować.
// Nieudany build NIE mówi nic o jakości atomów (jest to awaria narzędzia, nie
// pomiar), więc kończy się kodem 2 = NIE ZMIERZONO, a nie przepisanym kodem
// budowy — inaczej np. kod 127 ("npx" nieznalezione) wyglądałby dla odbiorcy
// bramki identycznie jak dowolny inny, nienazwany błąd.
const budowa = uruchomSynchronicznie("npx", ["vite", "build", "--config", "vite.config.poligon.ts"]);
if (budowa.kod !== 0) {
  const powodBudowy = budowa.kod === null ? budowa.powod : `budowa poligonu nie powiodla sie (exit ${budowa.kod})`;
  console.error(`WOLAJACY POMIARU CELOW DOTYKU: NIE ZMIERZONO — ${powodBudowy}.`);
  process.exit(KOD_NIE_ZMIERZONO);
}

// 2) Serwer podglądu w tle, na porcie z PORT_POLIGONU (patrz wyżej).
// --strict-port: gdy port zajęty, ma być czerwono, nie po cichu przeskoczyć
// na inny — inaczej pomiar-celow-dotyku.mjs pytałby pusty adres, a próba padłaby
// mylącym „brak pomiarów”, nie prawdziwym powodem.
// --host 127.0.0.1: bez tego `vite preview` wiąże się z hostname "localhost",
// co na części maszyn (zmierzone: `netstat` pokazywał `[::1]:PORT LISTENING`,
// nie `127.0.0.1:PORT`) rozstrzyga się WYŁĄCZNIE do IPv6 — `fetch` niżej i
// Playwright w pomiar-celow-dotyku.mjs pytają jawnie o `127.0.0.1`, więc dostawały
// ECONNREFUSED i owijka wychodziła kodem 1 ZAWSZE, niezależnie od realnych
// celów dotyku (fail-closed, ale niemy - bramka, która nigdy nie może przejść,
// prędzej czy później dostanie `continue-on-error` i zniknie). Wymuszam
// IPv4 jawnie w konfiguracji serwera, a nie odwrotnie (`[::1]` po stronie
// klienta), bo 127.0.0.1 istnieje na każdym systemie i każdym runnerze
// (w tym `ubuntu-latest`), a loopback IPv6 bywa wyłączony (kontenery,
// minimalne obrazy) — to jedyny z dwóch adresów, który jest gwarantowany.
// `detached: true` (POSIX) czyni proces wiodącym w jego własnej grupie, żeby dało się
// ubić CAŁE drzewo (npx -> node -> vite) jednym `process.kill(-pid)` niżej —
// bez tego `serwer.kill()` ubijał tylko `npx`, a `vite preview` zostawał
// osierocony i trzymał port na kolejne uruchomienia (zmierzone: proces
// wisiał po zakończeniu tego skryptu, drugi bieg dostawał "port zajęty").
const serwer = spawn(
  "npx",
  ["vite", "preview", "--config", "vite.config.poligon.ts", "--host", "127.0.0.1", "--port", PORT, "--strict-port"],
  {
    cwd: KATALOG_FRONTEND,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  },
);

let serwerZakonczony = false;
let kodZakonczeniaSerwera = null;
serwer.on("exit", (kod) => {
  serwerZakonczony = true;
  kodZakonczeniaSerwera = kod;
});

function ubijServerCalkowicie() {
  if (serwerZakonczony) return;
  if (process.platform === "win32") {
    // `/T` ubija drzewo potomków (npx.cmd -> node -> vite), nie tylko proces wiodący.
    spawnSync("taskkill", ["/pid", String(serwer.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-serwer.pid, "SIGKILL");
    } catch {
      serwer.kill("SIGKILL");
    }
  }
}

// Siatka bezpieczeństwa niezależna od tego, JAK ten proces się kończy: bez
// niej serwer podglądu przeżywał przerwanie tego wołającego (sygnał, limit
// czasu narzędzia wywołującego, awaria dalej w potoku) i zostawał osierocony,
// trzymając PORT na kolejne biegi — dokładnie tak powstał zator zmierzony na
// tej maszynie: proces z osobnego klonu trzymał port od 12:46 do 16:0x i
// zablokował trzy kolejne odbiory pomiaru celow dotyku. `process.on("exit", ...)`
// odpala się przy KAŻDYM wyjściu z tego procesu — normalnym zakończeniu,
// `process.exit()` wywołanym z dowolnego miejsca wyżej, i sygnale obsłużonym
// niżej — i może wykonać WYŁĄCZNIE kod synchroniczny, dlatego
// ubijServerCalkowicie() jest w całości synchroniczne (spawnSync / kill).
let posprzatnieteJuz = false;
function posprzataj() {
  if (posprzatnieteJuz) return;
  posprzatnieteJuz = true;
  ubijServerCalkowicie();
}
process.on("exit", posprzataj);
for (const sygnal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sygnal, () => {
    console.error(`WOLAJACY POMIARU CELOW DOTYKU: NIE ZMIERZONO — przerwano sygnalem ${sygnal}.`);
    process.exit(KOD_NIE_ZMIERZONO);
  });
}

let sluchaNaPorcie = false;
serwer.stdout.on("data", (dane) => {
  process.stdout.write(dane);
  if (String(dane).includes(String(PORT))) sluchaNaPorcie = true;
});
let stderrSerwera = "";
serwer.stderr.on("data", (dane) => {
  process.stderr.write(dane);
  stderrSerwera += String(dane);
});

// Aktywne czekanie (limit LIMIT_CZEKANIA_MS), nie sztywny sleep: pyta serwer,
// nie zgaduje czasu startu. Sprawdza też, czy serwer już się zakończył (np.
// --strict-port odmówił startu, bo port zajęty) — bez tego czekalibyśmy pełny
// limit na proces, który już dawno umarł, i zgłosili mylący powód "nie
// odpowiedział" zamiast prawdziwego "port zajęty".
//
// Pętla liczy CZAS, nie liczbę prób: `fetch` bez `signal` potrafi wisieć
// bez końca, gdy serwer PRZYJMUJE połączenie TCP, ale nigdy nie wysyła
// odpowiedzi (nasłuchuje, ale nie odpowiada — odróżnij od ECONNREFUSED,
// które `catch` niżej łapie natychmiast). Bez `AbortSignal.timeout` na
// pojedynczej próbie ta jedna zawieszona próba blokowałaby pętlę na zawsze i
// udokumentowany limit czasu byłby nieprawdziwy — stąd `Date.now()` jako
// jedyne źródło prawdy o tym, ile czasu zostało, a nie licznik iteracji.
const LIMIT_CZEKANIA_MS = 20_000;
const LIMIT_POJEDYNCZEJ_PROBY_MS = 2_000;
async function czekajNaSerwer() {
  const koniec = Date.now() + LIMIT_CZEKANIA_MS;
  while (Date.now() < koniec) {
    if (serwerZakonczony) return "zakonczony";
    if (sluchaNaPorcie) {
      try {
        const odpowiedz = await fetch(URL_PODGLADU, { signal: AbortSignal.timeout(LIMIT_POJEDYNCZEJ_PROBY_MS) });
        if (odpowiedz.ok) return "ok";
      } catch {
        // serwer jeszcze nie przyjmuje połączeń, albo przyjął połączenie i
        // nie odpowiedział w LIMIT_POJEDYNCZEJ_PROBY_MS — sprobuj ponownie,
        // dopóki starcza czasu z LIMIT_CZEKANIA_MS.
      }
    }
    await delay(500);
  }
  return "timeout";
}

const wynikCzekania = await czekajNaSerwer();

let kodWyjscia;
if (wynikCzekania === "zakonczony") {
  const portZajety = /EADDRINUSE|already in use|port.*(zajety|zajęty)/i.test(stderrSerwera);
  const powod = portZajety
    ? `port ${PORT} jest zajety (serwer podgladu odmowil startu)`
    : `serwer podgladu zakonczyl sie przedwczesnie (kod ${kodZakonczeniaSerwera})`;
  console.error(`WOLAJACY POMIARU CELOW DOTYKU: NIE ZMIERZONO — ${powod}.`);
  kodWyjscia = KOD_NIE_ZMIERZONO;
} else if (wynikCzekania === "timeout") {
  console.error(
    `WOLAJACY POMIARU CELOW DOTYKU: NIE ZMIERZONO — serwer podgladu poligonu nie odpowiedzial pod ${URL_PODGLADU} w ${LIMIT_CZEKANIA_MS / 1000}s.`,
  );
  kodWyjscia = KOD_NIE_ZMIERZONO;
} else {
  const pomiar = uruchomSynchronicznie("node", ["design-system/poligon/pomiar-celow-dotyku.mjs"]);
  // Kod 1 wolno oddać na zewnątrz WYŁĄCZNIE gdy pomiar-celow-dotyku.mjs oddal dokładnie
  // kod 0 albo 1 (warunek niżej równoważny `kodPomiaru === 0 || kodPomiaru
  // === 1`). KAŻDY inny kod (jego jedyna dziś istniejąca gałąź błędu oddaje
  // kod 3, "narzędzie nie wystartowało", ale warunek niżej łapie każdy kod
  // != 0 i != 1, nie wyłącznie 3) NIE jest naruszeniem — zamieniamy na NIE
  // ZMIERZONO z nazwanym powodem,
  // zamiast przepisywać kod dziecka wprost jak poprzednio (ta ślepa
  // passthrough była właśnie wadą: brakująca przeglądarka kończyła się kodem
  // 1 Node.js, nieodróżnialnym od realnych naruszeń). `pomiar.kod === null`
  // (błąd spawnu albo dziecko ubite sygnałem — patrz uruchomSynchronicznie)
  // też trafia tutaj i też dostaje nazwany `powod`, nie zmyślony "exit N".
  // Wyjątek, dziś NIENAPRAWIONY (patrz nagłówek pliku): awaria ładowania
  // modułu w pomiar-celow-dotyku.mjs oddaje jego kod 1 przez tę samą drogę co realne
  // naruszenie — stąd nieodróżnialna i wpadnie w gałąź "kodPomiaru === 1"
  // niżej, mimo że pomiar się nie odbył.
  if (pomiar.kod === 0 || pomiar.kod === 1) {
    kodWyjscia = pomiar.kod;
  } else {
    const powodPomiaru =
      pomiar.kod === null
        ? pomiar.powod
        : `pomiar-celow-dotyku.mjs zakonczyl sie kodem ${pomiar.kod} (ani 0, ani 1), wiec pomiar sie nie odbyl`;
    console.error(`WOLAJACY POMIARU CELOW DOTYKU: NIE ZMIERZONO — ${powodPomiaru}.`);
    kodWyjscia = KOD_NIE_ZMIERZONO;
  }
}

process.exit(kodWyjscia);
