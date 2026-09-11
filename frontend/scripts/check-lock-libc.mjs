#!/usr/bin/env node
// Straznik pola "libc" w package-lock.json (przypis do trafienia F-100).
//
// npm 10.9.8 potrafi przy regeneracji zgubic pole "libc" na pakietach
// platformowych pod node_modules/*-linux-*. Na node:22-alpine to pole
// odroznia glibc od musla - bez niego npm instaluje OBIE odmiany naraz
// (zmierzone: @next/swc-linux-x64-gnu razem z @next/swc-linux-x64-musl,
// tak samo dla @img/sharp-*linux*), a lockfile puchnie i przestaje byc
// deterministyczny miedzy maszynami. Commit 533ef98 przywrocil pole na
// 52 wpisach (32 glibc, 20 musl). Ten skrypt pilnuje, zeby nikt tego
// nie zgubil po raz drugi.
//
// Regula "czy wpis POWINIEN miec libc" jest wyprowadzona z danych na
// c6e98f5 - na tym commicie kazdy wpis, ktory powinien miec libc, je ma:
//   - "os" zawiera "linux",
//   - nazwa pakietu niesie slad odmiany libc ("-gnu", "-musl", albo
//     "linuxmusl" bez myslnika) ALBO nalezy do rodziny sharp/libvips,
//     ktora wydaje wariant glibc bez zadnego przyrostka w nazwie,
//   - z wyjatkiem garstki pakietow (oxide/unrs/lightningcss, wariant
//     32-bitowy ARM), ktorych WLASNY package.json nigdy pola libc nie
//     niosl - to jest stan zastany na c6e98f5, nie ubytek po regeneracji,
//     wiec go nie liczymy.
//
// Uzycie:  node scripts/check-lock-libc.mjs [sciezka-do-package-lock.json]
// albo:    LOCK_PATH=/inna/sciezka node scripts/check-lock-libc.mjs
// Bez argumentu i bez LOCK_PATH czyta package-lock.json obok tego skryptu.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DOMYSLNA_SCIEZKA = fileURLToPath(new URL("../package-lock.json", import.meta.url));
const SCIEZKA = process.argv[2] || process.env.LOCK_PATH || DOMYSLNA_SCIEZKA;

// Wyjatki zmierzone na c6e98f5: te wpisy maja "os": ["linux"] i nazwe z
// "-gnu"/"-musl" w sobie, a mimo to nigdy nie niosly pola libc - bo ich
// wlasny package.json go nie deklaruje. Ten sam przyrostek ("-gnueabihf")
// u @rollup/rollup-linux-arm-gnueabihf JEST niesiony, wiec to nie jest
// regula po przyrostku, tylko lista czterech konkretnych pakietow.
const WYJATKI = new Set([
    "@tailwindcss/oxide-linux-arm-gnueabihf",
    "@unrs/resolver-binding-linux-arm-gnueabihf",
    "@unrs/resolver-binding-linux-arm-musleabihf",
    "lightningcss-linux-arm-gnueabihf",
]);

const ZNACZNIKI_LIBC = ["-gnu", "-musl", "linuxmusl", "sharp-linux", "libvips-linux"];

function nazwaZWezla(sciezkaWezla) {
    // "node_modules/@scope/nazwa" -> "@scope/nazwa"; "node_modules/nazwa" -> "nazwa"
    return sciezkaWezla.split("node_modules/").pop();
}

function powinienMiecLibc(nazwa) {
    if (WYJATKI.has(nazwa)) return false;
    return ZNACZNIKI_LIBC.some((z) => nazwa.includes(z));
}

let dane;
try {
    dane = JSON.parse(readFileSync(SCIEZKA, "utf8"));
} catch (e) {
    console.error(`nie odczytalem ${SCIEZKA}: ${e.message}`);
    process.exit(2);
}

const pakiety = dane.packages || {};
let sprawdzone = 0;
const bezLibc = [];

for (const [wezel, info] of Object.entries(pakiety)) {
    if (!wezel.startsWith("node_modules/")) continue;
    const os = info.os;
    if (!Array.isArray(os) || !os.some((o) => typeof o === "string" && o.includes("linux"))) continue;

    const nazwa = nazwaZWezla(wezel);
    if (!powinienMiecLibc(nazwa)) continue;

    sprawdzone += 1;
    if (!info.libc) bezLibc.push(nazwa);
}

if (bezLibc.length > 0) {
    console.error('brak pola "libc" w:');
    for (const nazwa of bezLibc) console.error(`  ! ${nazwa}`);
}

console.log(`libc: sprawdzone ${sprawdzone} wpisow, bez libc ${bezLibc.length}`);
process.exit(bezLibc.length > 0 ? 1 : 0);
