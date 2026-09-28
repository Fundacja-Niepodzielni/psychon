#!/usr/bin/env node
// Wołający dla design-system/poligon/pomiar-styl-atomow.mjs — ten sam wzorzec
// co scripts/uruchom-pomiar-celow-dotyku.mjs (build statyczny, `vite preview`
// ze --strict-port, czekanie aż odpowiada, uruchomienie pomiaru, przeniesienie
// jego kodu wyjścia BEZ MAPOWANIA). Kody sterowane tego wołającego — {0, 2, 3,
// 4} (4 dodany później: pokrycie mianownika poniżej progu, patrz
// nagłówek pomiar-styl-atomow.mjs) — 0 zaliczony, 2 NIE ZMIERZONO
// (build/port/serwer/spawn — przyczyna nazwana w stderr), 3 ZMIERZONY ROZJAZD
// (lista w stdout pomiaru), 4 POKRYCIE PONIŻEJ PROGU.
// Kod spoza {0,2,3,4} = narzędzie nie doszło do końca.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = process.env.PORT_POLIGONU || "4173";
process.env.PORT_POLIGONU = PORT;
const URL_PODGLADU = `http://127.0.0.1:${PORT}/`;
const KATALOG_FRONTEND = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KOD_NIE_ZMIERZONO = 2;

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
    return { kod: null, powod: `proces "${polecenie}" zostal przerwany sygnalem ${wynik.signal ?? "nieznanym"}` };
  }
  return { kod: wynik.status, powod: null };
}

// Zmierzone (recznie, przed wpisaniem tego kroku do ci.yml): modul przyrzadu
// oprozniony do zera bajtow konczy sie kodem 0 (pusty modul ES nie rzuca,
// spawnSync zwraca status procesu node, nie tresc). Kod 0 przekazany dalej
// BEZ SPRAWDZENIA sladu pomiaru zamienilby wolajacego w ozdobe: bramka
// przepuscilaby kazdy uszkodzony/oprozniony przyrzad na zielono. Dlatego
// stdout przyrzadu jest PRZECHWYTYWANY (nie tylko dziedziczony) i sprawdzany
// na obecnosc wiersza mianownika ("zmierzonych X z Y pozycji") — jego brak
// jest kodem NIE ZMIERZONO, niezaleznie od kodu wyjscia samego procesu.
function uruchomZPrzechwyceniemStdout(polecenie, argumenty) {
  const wynik = spawnSync(polecenie, argumenty, {
    cwd: KATALOG_FRONTEND,
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (wynik.stdout) process.stdout.write(wynik.stdout);
  if (wynik.stderr) process.stderr.write(wynik.stderr);
  if (wynik.error) {
    return { kod: null, powod: `nie udalo sie uruchomic "${polecenie}": ${wynik.error.message}`, stdout: "" };
  }
  if (wynik.status === null) {
    return {
      kod: null,
      powod: `proces "${polecenie}" zostal przerwany sygnalem ${wynik.signal ?? "nieznanym"}`,
      stdout: wynik.stdout ?? "",
    };
  }
  return { kod: wynik.status, powod: null, stdout: wynik.stdout ?? "" };
}

const WZORZEC_SLADU_POMIARU = /zmierzonych\s+\d+\s+z\s+\d+\s+pozycji/;

const budowa = uruchomSynchronicznie("npx", ["vite", "build", "--config", "vite.config.poligon.ts"]);
if (budowa.kod !== 0) {
  const powodBudowy = budowa.kod === null ? budowa.powod : `budowa poligonu nie powiodla sie (exit ${budowa.kod})`;
  console.error(`WOLAJACY POMIARU STYLU ATOMOW: NIE ZMIERZONO — ${powodBudowy}.`);
  process.exit(KOD_NIE_ZMIERZONO);
}

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
    spawnSync("taskkill", ["/pid", String(serwer.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-serwer.pid, "SIGKILL");
    } catch {
      serwer.kill("SIGKILL");
    }
  }
}

let posprzatnieteJuz = false;
function posprzataj() {
  if (posprzatnieteJuz) return;
  posprzatnieteJuz = true;
  ubijServerCalkowicie();
}
process.on("exit", posprzataj);
for (const sygnal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sygnal, () => {
    console.error(`WOLAJACY POMIARU STYLU ATOMOW: NIE ZMIERZONO — przerwano sygnalem ${sygnal}.`);
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
        // jeszcze nie odpowiada — próbuj dalej, dopóki starcza czasu.
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
  console.error(`WOLAJACY POMIARU STYLU ATOMOW: NIE ZMIERZONO — ${powod}.`);
  kodWyjscia = KOD_NIE_ZMIERZONO;
} else if (wynikCzekania === "timeout") {
  console.error(
    `WOLAJACY POMIARU STYLU ATOMOW: NIE ZMIERZONO — serwer podgladu poligonu nie odpowiedzial pod ${URL_PODGLADU} w ${LIMIT_CZEKANIA_MS / 1000}s.`,
  );
  kodWyjscia = KOD_NIE_ZMIERZONO;
} else {
  const pomiar = uruchomZPrzechwyceniemStdout("node", ["design-system/poligon/pomiar-styl-atomow.mjs"]);
  if (pomiar.kod === null) {
    console.error(`WOLAJACY POMIARU STYLU ATOMOW: NIE ZMIERZONO — ${pomiar.powod}.`);
    kodWyjscia = KOD_NIE_ZMIERZONO;
  } else if (!WZORZEC_SLADU_POMIARU.test(pomiar.stdout)) {
    console.error(
      `WOLAJACY POMIARU STYLU ATOMOW: NIE ZMIERZONO — brak sladu pomiaru ("zmierzonych X z Y pozycji") w wyjsciu przyrzadu (kod procesu byl ${pomiar.kod}); przyrzad pusty albo uszkodzony moze zwrocic 0 bez pomiaru czegokolwiek.`,
    );
    kodWyjscia = KOD_NIE_ZMIERZONO;
  } else {
    kodWyjscia = pomiar.kod;
  }
}

process.exit(kodWyjscia);
