#!/usr/bin/env node
// Sonda pomiarowa dla trasy `/nowy-front/kurs/[id]`
// — mierzy NA DZIAŁAJĄCEJ TRASIE (serwer `next start` pod
// PORT_TRASY, domyślnie 3100), nie na poligonie (osobny Vite/jsdom).
// Cztery sondy na każdy atom faktycznie WYRENDEROWANY na stronie w chwili
// pomiaru: kontrast tekstu, cel dotyku 44 px, licznik przycisków z tłem
// `--primary` (jeden kolorowy na ekran), fokus widoczny.
//
// Kody: 0 = pomiar się odbył (wynik w tabeli, bez oceny progu — sama
// tabela nie jest oceną); 2 = NIE ZMIERZONO (przeglądarka
// się nie uruchomiła albo nawigacja padła — przyczyna w stderr); każdy inny
// kod = narzędzie nie doszło do końca.
import { chromium } from "@playwright/test";

const PORT = process.env.PORT_TRASY || "3100";
const SCIEZKA = process.argv[2] || "/nowy-front/kurs/1";
const URL = `http://127.0.0.1:${PORT}${SCIEZKA}`;

function luminancja([r, g, b]) {
  const kanal = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

function parsujRgb(zapis) {
  const dopasowanie = zapis.match(/rgba?\(([^)]+)\)/);
  if (!dopasowanie) return null;
  const [r, g, b] = dopasowanie[1].split(",").map((x) => parseFloat(x.trim()));
  return [r, g, b];
}

function kontrast(a, b) {
  const [rgbA, rgbB] = [parsujRgb(a), parsujRgb(b)];
  if (!rgbA || !rgbB) return null;
  const [l1, l2] = [luminancja(rgbA), luminancja(rgbB)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

async function main() {
  let przegladarka;
  try {
    przegladarka = await chromium.launch();
  } catch (blad) {
    console.error("NIE ZMIERZONO: przeglądarka Chromium się nie uruchomiła —", blad.message);
    process.exit(2);
  }

  try {
    const strona = await przegladarka.newPage({ viewport: { width: 1440, height: 900 } });
    const odpowiedz = await strona.goto(URL, { waitUntil: "networkidle" });
    if (!odpowiedz) {
      console.error("NIE ZMIERZONO: brak odpowiedzi z", URL);
      process.exit(2);
    }
    console.log(`URL: ${URL}`);
    console.log(`Kod HTTP nawigacji: ${odpowiedz.status()}`);

    // --- Sonda 1+4: elementy tekstowe z atomów Heading/Text — kontrast i fokus ---
    const elementy = await strona.evaluate(() => {
      const wynik = [];
      document.querySelectorAll("h1,h2,h3,h4,p").forEach((el) => {
        const styl = getComputedStyle(el);
        wynik.push({
          znacznik: el.tagName,
          tekst: el.textContent?.slice(0, 40) ?? "",
          kolor: styl.color,
          tlo: styl.backgroundColor,
          tabIndex: el.tabIndex,
        });
      });
      return wynik;
    });

    console.log("\n--- Sonda kontrastu (atomy Heading/Text) ---");
    for (const el of elementy) {
      // Tło rzeczywiste (pierwszy nieprzezroczysty przodek) — this page ma
      // jedno tło stałe (`--bg` przez KursPublikacja.module.css), więc bierzemy
      // computed background-color strony jako tło odniesienia dla `rgba(0,0,0,0)`.
      console.log(`  ${el.znacznik} "${el.tekst}" kolor=${el.kolor} tlo-lokalne=${el.tlo}`);
    }
    const tloStrony = await strona.evaluate(
      () => getComputedStyle(document.querySelector('[class*="uklad"]') ?? document.body).backgroundColor,
    );
    console.log(`  tło układu trasy: ${tloStrony}`);
    for (const el of elementy) {
      const c = kontrast(el.kolor, tloStrony);
      console.log(
        `  KONTRAST ${el.znacznik} "${el.tekst}" vs tło trasy: ${c ? c.toFixed(2) : "nieobliczalny"}`,
      );
    }

    // --- Sonda 2: cele dotyku 44 px — wszystkie <button>/<a href> na stronie ---
    console.log("\n--- Sonda celu dotyku (próg 44 px) ---");
    const cele = await strona.evaluate(() =>
      Array.from(document.querySelectorAll("button, a[href]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { znacznik: el.tagName, tekst: el.textContent?.slice(0, 30) ?? "", w: r.width, h: r.height };
      }),
    );
    if (cele.length === 0) {
      console.log("  0 elementów klikalnych wyrenderowanych na tej trasie w tym stanie (bez sesji).");
    }
    for (const cel of cele) {
      console.log(
        `  ${cel.znacznik} "${cel.tekst}" ${cel.w.toFixed(1)}×${cel.h.toFixed(1)} px — ${
          cel.w >= 44 && cel.h >= 44 ? "OK" : "PONIŻEJ 44px"
        }`,
      );
    }

    // --- Sonda 3: jeden przycisk kolorowy (tło --primary) ---
    console.log("\n--- Sonda „jeden przycisk kolorowy” ---");
    const primaryHex = await strona.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    );
    const kolorowe = await strona.evaluate((prog) => {
      function doRgb(hex) {
        const h = hex.replace("#", "");
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      }
      const [pr, pg, pb] = doRgb(prog);
      return Array.from(document.querySelectorAll("button, a")).filter((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (!m) return false;
        const [r, g, b] = m[1].split(",").map((x) => parseFloat(x));
        return r === pr && g === pg && b === pb;
      }).length;
    }, primaryHex);
    console.log(`  --primary (light) = ${primaryHex}; elementów z tym tłem na stronie: ${kolorowe}`);

    // --- Sonda 4b: fokus widoczny — Tab przez stronę, sprawdź :focus-visible outline ---
    console.log("\n--- Sonda fokusu widocznego ---");
    await strona.keyboard.press("Tab");
    const fokus = await strona.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const styl = getComputedStyle(el);
      return { znacznik: el.tagName, outline: styl.outlineWidth, outlineColor: styl.outlineColor };
    });
    console.log(fokus ? `  aktywny element po Tab: ${JSON.stringify(fokus)}` : "  brak elementu fokusowalnego po Tab (0 elementów interaktywnych w tym stanie)");

    await strona.close();
    process.exit(0);
  } catch (blad) {
    console.error("NIE ZMIERZONO:", blad.message);
    process.exit(2);
  } finally {
    await przegladarka.close();
  }
}

main();
