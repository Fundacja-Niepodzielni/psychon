#!/usr/bin/env node
// Wołający dla design-system/poligon/pomiar-celow-sladu.mjs — TEN SAM wzorzec
// co scripts/uruchom-pomiar-celow-dotyku.mjs (build statycznego poligonu,
// serwer podglądu na PORT_POLIGONU, uruchomienie pomiaru jako dziecka,
// przeniesienie jego kodu wyjścia BEZ MAPOWANIA), świadomie zduplikowany
// zamiast wydzielony do współdzielonej funkcji: przyjęta zasada wymaga
// wprost "przyrząd ma zostać PLIKIEM w gałęzi, uruchamialnym JEDNYM
// poleceniem" — poprzedni przyrząd w tym strumieniu (148 pomiarów) nie
// został zachowany wcale; commitowanie DWÓCH plików w znanym, już
// sprawdzonym kształcie jest tańsze i pewniejsze niż
// refaktor współdzielonej infrastruktury, który ryzykowałby złamanie
// istniejącego pomiar:cele-dotyku (wpiętego w CI) w tym samym commicie.
//
// Kody sterowane, dokładnie trzy — {0, 2, 3} — z tym samym znaczeniem co w
// uruchom-pomiar-celow-dotyku.mjs: 0 = zaliczony, 2 = NIE ZMIERZONO (nazwana
// przyczyna w stderr), 3 = ZMIERZONE NARUSZENIE. Kod spoza {0,2,3} = to
// narzędzie nie doszło do końca (build, port, timeout serwera, sygnał, błąd
// spawnu) — przyczyna w stderr.
//
// Uruchamiany poleceniem `npm run pomiar:cele-sladu` (frontend/package.json).
// NIE jest dziś wpięty w .github/workflows/ci.yml — to POZA zakresem tej
// zmiany (ZLECENIE nie prosi o wpięcie w bramkę CI, tylko o przyrząd
// uruchamialny jednym poleceniem); pomiar:cele-dotyku (próg 44px poza
// śladem) zostaje jedynym krokiem celów dotyku w CI, nietknięty.
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

// 1) Statyczny build poligonu.
const budowa = uruchomSynchronicznie("npx", ["vite", "build", "--config", "vite.config.poligon.ts"]);
if (budowa.kod !== 0) {
  const powodBudowy = budowa.kod === null ? budowa.powod : `budowa poligonu nie powiodla sie (exit ${budowa.kod})`;
  console.error(`WOLAJACY POMIARU CELOW SLADU: NIE ZMIERZONO — ${powodBudowy}.`);
  process.exit(KOD_NIE_ZMIERZONO);
}

// 2) Serwer podglądu na PORT_POLIGONU, --strict-port + --host 127.0.0.1 —
// patrz uruchom-pomiar-celow-dotyku.mjs dla pełnego uzasadnienia obu flag
// (port zajęty ma być czerwony, nie cichy skok na inny; IPv4 jawnie, bo
// loopback IPv6 bywa wyłączony na części maszyn/runnerów).
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
    console.error(`WOLAJACY POMIARU CELOW SLADU: NIE ZMIERZONO — przerwano sygnalem ${sygnal}.`);
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
        // jeszcze nie odpowiada, sprobuj ponownie do LIMIT_CZEKANIA_MS
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
  console.error(`WOLAJACY POMIARU CELOW SLADU: NIE ZMIERZONO — ${powod}.`);
  kodWyjscia = KOD_NIE_ZMIERZONO;
} else if (wynikCzekania === "timeout") {
  console.error(
    `WOLAJACY POMIARU CELOW SLADU: NIE ZMIERZONO — serwer podgladu poligonu nie odpowiedzial pod ${URL_PODGLADU} w ${LIMIT_CZEKANIA_MS / 1000}s.`,
  );
  kodWyjscia = KOD_NIE_ZMIERZONO;
} else {
  const pomiar = uruchomSynchronicznie("node", ["design-system/poligon/pomiar-celow-sladu.mjs"]);
  if (pomiar.kod === null) {
    console.error(`WOLAJACY POMIARU CELOW SLADU: NIE ZMIERZONO — ${pomiar.powod}.`);
    kodWyjscia = KOD_NIE_ZMIERZONO;
  } else {
    kodWyjscia = pomiar.kod;
  }
}

process.exit(kodWyjscia);
