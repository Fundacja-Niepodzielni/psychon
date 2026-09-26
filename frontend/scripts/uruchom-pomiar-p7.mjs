#!/usr/bin/env node
// Wołający dla design-system/poligon/pomiar-p7.mjs.
//
// Przed tym plikiem nic nie wołało pomiar-p7.mjs: przeszukanie repozytorium
// (*.sh *.yml *.yaml *.json *.md *.mjs *.ps1) dawało 0 trafień — skrypt
// czerwienił się poprawnie, ale nic go nie uruchamiało, więc nikt tego nie
// widział. Ten plik nie mierzy niczego sam — buduje statyczny poligon,
// odpala go lokalnym serwerem podglądu, czeka aż odpowiada, uruchamia
// pomiar-p7.mjs i PRZENOSI jego kod wyjścia na zewnątrz (patrz `process.exit`
// na końcu). Uruchamiany poleceniem `npm run pomiar:p7`. W TYM DRZEWIE NIE JEST
// wpięty w `.github/workflows/ci.yml` — zmierzone: `git grep "pomiar:p7" -- .github`
// daje 0 trafień. Jego czerwień nie zatrzymuje więc żadnego zestawu; wpięcie to
// osobna zmiana, która ma dodać krok, a nie wymienić żaden istniejący.
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = 4173; // musi się zgadzać z URL zaszytym w pomiar-p7.mjs
const URL_PODGLADU = `http://127.0.0.1:${PORT}/`;
const KATALOG_FRONTEND = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function uruchomSynchronicznie(polecenie, argumenty) {
  const wynik = spawnSync(polecenie, argumenty, {
    stdio: "inherit",
    cwd: KATALOG_FRONTEND,
    shell: process.platform === "win32",
  });
  if (wynik.error) {
    console.error(`WOLAJACY P-7: nie udalo sie uruchomic "${polecenie}": ${wynik.error.message}`);
    return 1;
  }
  return wynik.status ?? 1;
}

// 1) Statyczny build poligonu — bez niego `vite preview` nie ma czego serwować.
const kodBudowy = uruchomSynchronicznie("npx", ["vite", "build", "--config", "vite.config.poligon.ts"]);
if (kodBudowy !== 0) {
  console.error(`WOLAJACY P-7: budowa poligonu nie powiodla sie (exit ${kodBudowy}) — pomiar NIE zostal odpalony.`);
  process.exit(kodBudowy);
}

// 2) Serwer podglądu w tle, na porcie zaszytym w pomiar-p7.mjs.
// --strict-port: gdy port zajęty, ma być czerwono, nie po cichu przeskoczyć
// na inny — inaczej pomiar-p7.mjs pytałby pusty adres, a próba padłaby
// mylącym „brak pomiarów”, nie prawdziwym powodem.
// --host 127.0.0.1: bez tego `vite preview` wiąże się z hostname "localhost",
// co na części maszyn (zmierzone: `netstat` pokazywał `[::1]:PORT LISTENING`,
// nie `127.0.0.1:PORT`) rozstrzyga się WYŁĄCZNIE do IPv6 — `fetch` niżej i
// Playwright w pomiar-p7.mjs pytają jawnie o `127.0.0.1`, więc dostawały
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
  ["vite", "preview", "--config", "vite.config.poligon.ts", "--host", "127.0.0.1", "--port", String(PORT), "--strict-port"],
  {
    cwd: KATALOG_FRONTEND,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  },
);

function ubijServerCalkowicie() {
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

let sluchaNaPorcie = false;
serwer.stdout.on("data", (dane) => {
  process.stdout.write(dane);
  if (String(dane).includes(String(PORT))) sluchaNaPorcie = true;
});
serwer.stderr.on("data", (dane) => process.stderr.write(dane));

// Aktywne czekanie (do 20s), nie sztywny sleep: pyta serwer, nie zgaduje czasu startu.
async function czekajNaSerwer() {
  for (let probuj = 0; probuj < 40; probuj++) {
    if (sluchaNaPorcie) {
      try {
        const odpowiedz = await fetch(URL_PODGLADU);
        if (odpowiedz.ok) return true;
      } catch {
        // serwer jeszcze nie przyjmuje połączeń — spróbuj ponownie
      }
    }
    await delay(500);
  }
  return false;
}

const wystartowal = await czekajNaSerwer();

let kodPomiaru;
if (!wystartowal) {
  console.error(`WOLAJACY P-7: serwer podgladu poligonu nie odpowiedzial pod ${URL_PODGLADU} w 20s.`);
  kodPomiaru = 1;
} else {
  kodPomiaru = uruchomSynchronicznie("node", ["design-system/poligon/pomiar-p7.mjs"]);
}

ubijServerCalkowicie();

// To jest cały sens tego pliku: kod wyjścia wołającego = kod wyjścia pomiaru
// (albo błędu startu serwera powyżej), więc czerwień P-7 zatrzymuje zestaw
// npm/CI, w którym ten plik stoi, a nie tylko samą siebie.
process.exit(kodPomiaru);
