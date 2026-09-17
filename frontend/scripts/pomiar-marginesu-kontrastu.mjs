#!/usr/bin/env node
// Przyrząd pomiarowy: margines kontrastu kolorów stanu (sukces/ostrzeżenie/
// błąd/informacja) i koloru głównego, w spoczynku i po najechaniu na wiersz
// tabeli (F-198, ślad śledztwa F-194).
//
// TO JEST TYLKO POMIAR. Nic tu nie naprawia, niczego nie zmienia w plikach
// źródłowych, nie jest wpięty w bramkę (lint/test/build) ani w żaden test
// blokujący — drukuje tabelę na stdout i kończy się kodem 0 zawsze (nawet
// gdy któraś para jest dziś poniżej progu; to bramka innego zlecenia miałaby
// decydować, czy to ma czerwienić CI, nie ten skrypt).
//
// Skąd biorą się liczby:
//   - Kolory NIE są tu wpisane na sztywno — skrypt czyta je z app/globals.css
//     (blok `--psy-*`) w chwili uruchomienia. Zmiana tokenu w CSS od razu
//     zmienia wynik następnego uruchomienia (patrz `--self-test` niżej —
//     to jest dowód tej własności, nie tylko deklaracja).
//   - Wzór kontrastu WCAG (jasność względna sRGB -> liniowe, (L1+.05)/(L2+.05))
//     i składanie kolorów półprzezroczystych (`#rrggbbaa`) nad tłem to ten
//     sam kod, który był ręcznie zweryfikowany względem axe-core przy F-194
//     (zgodność do 3 miejsc po przecinku — patrz `--self-test`/README niżej
//     oraz raport ze zlecenia).
//
// Użycie:
//   node scripts/pomiar-marginesu-kontrastu.mjs              — sama tabela
//   node scripts/pomiar-marginesu-kontrastu.mjs --self-test   — dowód, że
//     tabela faktycznie zależy od CSS, a nie od stałych w tym pliku: podmienia
//     W PAMIĘCI (plik na dysku nigdy nie jest dotykany) jeden token na wartość
//     o znanym kontraście, pokazuje różnicę, po czym kończy.
//   node scripts/pomiar-marginesu-kontrastu.mjs --para="Odznaka: sukces" --tlo=#f9f8f6
//     — ta sama para co w tabeli głównej, ale na PODANYM realnym tle zamiast
//     domyślnego założenia (karta biała / podkład najechania w tabeli).
//     Dopisane po odkryciu (patrz notatka „TŁA POZA TABELĄ TOKENÓW" niżej),
//     że część par żyje naprawdę na więcej niż jednym tle — to wejście liczy
//     dokładnie to jedno, konkretne tło, bez przebudowy reszty narzędzia.
//
// TŁA POZA TABELĄ TOKENÓW (ustalone czytaniem kodu, nie zgadywaniem):
//   `body { background: var(--psy-bg-page) }` (globals.css) i PanelShell.tsx
//   (`<div class="min-h-screen bg-page ...">`, `<main id="tresc">` BEZ
//   własnego tła) — więc KAŻDY tekst/odznaka, który nie siedzi wprost w
//   `<Card>` (bg-card, biel) albo w `<Table>` (bg-card na kontenerze), renderuje
//   się naprawdę na `--psy-bg-page` (#f9f8f6), nie na bieli. Potwierdzone
//   zajrzeniem do źródła w co najmniej dwóch miejscach:
//     - components/h07/AdminReliability.tsx: `<li class="... bg-page ...">`
//       zawiera bezpośrednio odznakę sukces/błąd (nie w karcie).
//     - components/organisms/NotificationList.tsx: przycisk z odznaką
//       informacyjną ma WŁASNY stan najechania `hover:bg-grey` (płaskie
//       #f5f5f5), inny niż podkład najechania wiersza tabeli (`bg-row-hover`,
//       półprzezroczysty fiolet) — to nie jest to samo najechanie.
//   Pełny opis w raporcie do zlecenia (pytania M1–M4).
//
// Umiejscowienie: obok istniejących narzędzi pomiarowych frontu
// (scripts/pomiar-kc.sh, scripts/check-lock-libc.mjs) — ten sam katalog,
// ta sama konwencja nazywania ("pomiar-*").

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCIEZKA_CSS = fileURLToPath(new URL("../app/globals.css", import.meta.url));

// ---------------------------------------------------------------------------
// Matematyka WCAG — identyczna z ręcznie zweryfikowanym przelicznikiem z F-194
// (zgodność z axe-core do 3 miejsc po przecinku, patrz N5 w raporcie).
// ---------------------------------------------------------------------------

function srgbToLin(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relLum([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function kontrast(rgb1, rgb2) {
  const l1 = relLum(rgb1);
  const l2 = relLum(rgb2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function hexNaRgba(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map((c) => c + c).join("");
  }
  const num = parseInt(h.slice(0, 6), 16);
  const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: alpha };
}

/** Składa kolor (ewentualnie półprzezroczysty) `fgHex` na nieprzezroczystym tle `bgRgb`. */
function zloz(fgHex, bgRgb) {
  const fg = hexNaRgba(fgHex);
  const a = fg.a;
  return [
    fg.r * a + bgRgb[0] * (1 - a),
    fg.g * a + bgRgb[1] * (1 - a),
    fg.b * a + bgRgb[2] * (1 - a),
  ];
}

// Reguła WCAG "duży tekst": pogrubiony od 18,66px albo dowolny od 24px -> próg 3:1, inaczej 4,5:1.
function prog(rozmiarPx, pogrubiony) {
  const duzy = (pogrubiony && rozmiarPx >= 18.66) || (!pogrubiony && rozmiarPx >= 24);
  return duzy ? 3.0 : 4.5;
}

// ---------------------------------------------------------------------------
// Czytanie tokenów z globals.css (N4 — bez wartości na sztywno w tym pliku).
// ---------------------------------------------------------------------------

function wczytajTokeny(tekstCss) {
  const tokeny = {};
  const rx = /--(psy-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
  let m;
  while ((m = rx.exec(tekstCss))) {
    tokeny[m[1]] = m[2];
  }
  // rozmiary tekstu (px) — potrzebne do reguły "duży tekst" wyżej.
  const rxPx = /--(psy-(?:body|small|caption))\s*:\s*(\d+(?:\.\d+)?)px/g;
  const rozmiary = {};
  while ((m = rxPx.exec(tekstCss))) {
    rozmiary[m[1]] = parseFloat(m[2]);
  }
  return { tokeny, rozmiary };
}

function poznajRowHoverNaBieli(tokeny) {
  const biel = [255, 255, 255];
  const rowHoverHex = tokeny["psy-row-hover"] ?? tokeny["psy-violet-dark-06"];
  return zloz(rowHoverHex, biel);
}

// ---------------------------------------------------------------------------
// Definicje par (token tekstu / tło / kontekst) — realne użycia w kodzie:
//   - Badge.tsx warianty success/warning/danger/info/accent, wszystkie
//     wewnątrz Table.tsx w co najmniej 9 plikach (zmierzone grepem:
//     admin/emails, admin/kursy, admin/kursy/[id], panel/dokumenty,
//     h03/ApplicationsTab, h09/CourseAssignmentPanel, h12/InstructorGroup,
//     h18/AdminUsersList, h20/ReportView) — stąd kolumna "po najechaniu"
//     dotyczy ich naprawdę, nie hipotetycznie: Table.tsx nakłada
//     `hover:bg-row-hover` na CAŁY wiersz, więc każda komórka (a więc
//     i odznaka w niej) dziedziczy ten podkład.
//   - Alert.tsx warianty success/info/error — nie żyją w wierszu tabeli,
//     więc kolumna "po najechaniu" = "spoczynek" (brak stanu najechania).
//   - TextLink.tsx tony primary/muted — używany m.in. w komórkach tabel
//     (np. app/(administracja)/admin/kursy/page.tsx), więc "po najechaniu"
//     dotyczy również jego.
// ---------------------------------------------------------------------------

function zbudujPary(tokeny, rozmiary) {
  const rowHoverNaBieli = poznajRowHoverNaBieli(tokeny);
  const biel = [255, 255, 255];

  const CAPTION = rozmiary["psy-caption"] ?? 13;
  const SMALL = rozmiary["psy-small"] ?? 15;

  const t = (nazwa) => {
    const v = tokeny[nazwa];
    if (!v) throw new Error(`brak tokenu --${nazwa} w globals.css`);
    return v;
  };

  // opis: etykieta / tekst(hex) / tło(hex lub null=biel-wprost) / rozmiarPx / pogrubiony / czyWTabeli
  const definicje = [
    ["Odznaka: sukces", t("psy-success"), t("psy-success-bg"), CAPTION, true, true],
    ["Odznaka: ostrzeżenie", t("psy-warning-dark"), t("psy-warning-bg"), CAPTION, true, true],
    ["Odznaka: błąd", t("psy-error"), t("psy-error-bg"), CAPTION, true, true],
    ["Odznaka: informacja", t("psy-info-dark"), t("psy-info-bg"), CAPTION, true, true],
    ["Odznaka: akcent", t("psy-violet-dark"), t("psy-violet-15"), CAPTION, true, true],
    ["Alert: sukces", t("psy-success"), t("psy-success-bg"), SMALL, false, false],
    ["Alert: informacja", t("psy-info-dark"), t("psy-info-bg"), SMALL, false, false],
    ["Alert: błąd", t("psy-error"), t("psy-error-bg"), SMALL, false, false],
    ["Łącze: główny (tone=primary)", t("psy-green-dark"), null, SMALL, false, true],
    ["Łącze: główny po najechaniu na sam link", t("psy-green-deep"), null, SMALL, false, true],
    ["Łącze: przygaszony (tone=muted)", t("psy-text-muted"), null, SMALL, false, true],
  ];

  return definicje.map(([etykieta, textHex, bgHexLubNull, rozmiarPx, pogrubiony, czyWTabeli]) => {
    const tloSpoczynek = bgHexLubNull === null ? biel : zloz(bgHexLubNull, biel);
    const tloNajechanie = !czyWTabeli
      ? tloSpoczynek
      : bgHexLubNull === null
        ? rowHoverNaBieli
        : zloz(bgHexLubNull, rowHoverNaBieli);

    const textRgb = (() => {
      const c = hexNaRgba(textHex);
      return [c.r, c.g, c.b];
    })();

    const kSpoczynek = kontrast(textRgb, tloSpoczynek);
    const kNajechanie = kontrast(textRgb, tloNajechanie);
    const progT = prog(rozmiarPx, pogrubiony);
    const gorszy = Math.min(kSpoczynek, kNajechanie);

    // Surowy kolor tekstu na czystej bieli, BEZ własnego (półprzezroczystego)
    // tła odznaki/alertu — inna liczba niż `kSpoczynek` dla par z własnym
    // tłem (tam tło odznaki jest już wmieszane w białą kartę). Dla par bez
    // własnego tła (łącza) to ta sama wartość co `kSpoczynek`. Dopisane po
    // odkryciu, że cel „≥5,5 na bieli" i „≥4,5 na własnym tle odznaki" to
    // dwie różne, obie realne liczby, nie jedna.
    const kSurowyNaBieli = kontrast(textRgb, biel);

    return {
      etykieta,
      textHex,
      bgHexLubNull,
      tloOpis: bgHexLubNull === null ? "karta biała (bez własnego tła)" : bgHexLubNull,
      czyWTabeli,
      kSpoczynek,
      kNajechanie,
      kSurowyNaBieli,
      prog: progT,
      margines: gorszy - progT,
    };
  });
}

function formatuj(x) {
  return x.toFixed(3);
}

function wypiszTabele(pary, tytul) {
  const posortowane = [...pary].sort((a, b) => a.margines - b.margines);
  console.log(`\n=== ${tytul} ===`);
  console.log(
    "margines".padEnd(9) +
      "spoczynek".padEnd(11) +
      "najechanie".padEnd(12) +
      "na bieli*".padEnd(11) +
      "próg".padEnd(7) +
      "tło".padEnd(24) +
      "etykieta",
  );
  for (const p of posortowane) {
    console.log(
      formatuj(p.margines).padEnd(9) +
        formatuj(p.kSpoczynek).padEnd(11) +
        formatuj(p.kNajechanie).padEnd(12) +
        formatuj(p.kSurowyNaBieli).padEnd(11) +
        p.prog.toFixed(1).padEnd(7) +
        p.tloOpis.slice(0, 22).padEnd(24) +
        p.etykieta +
        (p.czyWTabeli ? "" : "  (poza tabelą, bez stanu najechania)"),
    );
  }
  console.log(
    "* surowy kolor tekstu na czystej bieli, bez własnego tła odznaki/alertu (dla łączy — ta sama liczba co „spoczynek”).",
  );

  const ponizejProgu = pary.filter((p) => p.margines < 0).length;
  const cienkiMargines = pary.filter((p) => p.margines < 0.2).length;
  console.log("");
  console.log(`Par dziś PONIŻEJ progu (margines < 0):        ${ponizejProgu} z ${pary.length}`);
  console.log(`Par z marginesem cieńszym niż 0,2:             ${cienkiMargines} z ${pary.length}`);
  return { ponizejProgu, cienkiMargines, posortowane };
}

// ---------------------------------------------------------------------------
// Główne wykonanie.
// ---------------------------------------------------------------------------

/** Wyciąga wartość z argv w postaci `--klucz=wartość`. */
function argWartosc(klucz) {
  const przedrostek = `--${klucz}=`;
  const arg = process.argv.find((a) => a.startsWith(przedrostek));
  return arg ? arg.slice(przedrostek.length) : null;
}

/** Wszystkie wystąpienia `--nadpisz=--psy-token=#hex` (może być kilka naraz). */
function nadpisaniaZArgv() {
  const przedrostek = "--nadpisz=";
  return process.argv
    .filter((a) => a.startsWith(przedrostek))
    .map((a) => a.slice(przedrostek.length))
    .map((para) => {
      const i = para.indexOf("=");
      return [para.slice(0, i).replace(/^--/, ""), para.slice(i + 1)];
    });
}

function main() {
  const tekstCssZDysku = readFileSync(SCIEZKA_CSS, "utf8");

  // `--nadpisz=--psy-token=#hex` (powtarzalne) — podmiana W PAMIĘCI, ta sama
  // mechanika co `--self-test`, uogólniona: liczenie „co by było, gdyby"
  // (np. inny podkład najechania wiersza) PRZEZ TEN SAM przyrząd, zamiast
  // drugą, osobną ścieżką liczenia. Plik na dysku nigdy nie jest dotykany.
  const nadpisania = nadpisaniaZArgv();
  let tekstCss = tekstCssZDysku;
  for (const [nazwa, wartosc] of nadpisania) {
    const wzorzec = new RegExp(`--${nazwa}:\\s*#[0-9a-fA-F]{3,8}\\s*;`);
    if (!wzorzec.test(tekstCss)) {
      console.error(`--nadpisz: nie znalazłem --${nazwa} do podmiany.`);
      process.exit(2);
    }
    tekstCss = tekstCss.replace(wzorzec, `--${nazwa}: ${wartosc};`);
  }
  if (nadpisania.length > 0) {
    console.log(
      `Uwaga: ${nadpisania.length} token(ów) podmienione W PAMIĘCI na potrzeby tego uruchomienia (${nadpisania.map(([n, w]) => `--${n}=${w}`).join(", ")}). Plik na dysku nietknięty.`,
    );
  }

  const { tokeny, rozmiary } = wczytajTokeny(tekstCss);
  const pary = zbudujPary(tokeny, rozmiary);

  const paraNazwa = argWartosc("para");
  const tloParam = argWartosc("tlo");
  if (paraNazwa && tloParam) {
    // Tryb jednej pary na podanym, realnym tle (M5) — nie zastępuje tabeli
    // głównej, tylko liczy dokładnie to, o co proszono.
    const p = pary.find((x) => x.etykieta === paraNazwa);
    if (!p) {
      console.error(`Nie znam pary "${paraNazwa}". Dostępne etykiety:`);
      for (const x of pary) console.error(`  - ${x.etykieta}`);
      process.exit(2);
    }
    const tloRgb = hexNaRgba(tloParam);
    const tloOpaczne = [tloRgb.r, tloRgb.g, tloRgb.b];
    const tloZlozone =
      p.bgHexLubNull === null ? tloOpaczne : zloz(p.bgHexLubNull, tloOpaczne);
    const textRgb = (() => {
      const c = hexNaRgba(p.textHex);
      return [c.r, c.g, c.b];
    })();
    const k = kontrast(textRgb, tloZlozone);
    console.log(`Para: ${p.etykieta}`);
    console.log(`Podane tło: ${tloParam}`);
    console.log(`Tło złożone (jeśli token miał alfę): rgb(${tloZlozone.map(Math.round).join(", ")})`);
    console.log(`Kontrast na tym tle: ${formatuj(k)}`);
    console.log(`Próg: ${p.prog.toFixed(1)}, margines: ${formatuj(k - p.prog)}`);
    console.log(`Dla porównania w tabeli głównej: spoczynek=${formatuj(p.kSpoczynek)}, najechanie=${formatuj(p.kNajechanie)}, surowy na bieli=${formatuj(p.kSurowyNaBieli)}`);
    return;
  }

  console.log(`Źródło tokenów: ${SCIEZKA_CSS}`);
  console.log(`Odczytano ${Object.keys(tokeny).length} tokenów --psy-* z globals.css.`);
  wypiszTabele(pary, "Margines kontrastu — kolory stanu i kolor główny (posortowane rosnąco wg marginesu)");

  if (process.argv.includes("--self-test")) {
    console.log(
      "\n=== --self-test: dowód, że tabela zależy od CSS na dysku, nie od stałych w tym pliku ===",
    );
    console.log(
      "Plik globals.css NIE jest modyfikowany — podmiana dzieje się wyłącznie na tekście",
    );
    console.log("wczytanym do pamięci, w tym jednym uruchomieniu.");

    // Podmieniamy --psy-success na kolor o znanym, niskim kontraście na bieli
    // (jasnoszary #cccccc na białym tle daje ok. 1,6:1 — dużo poniżej progu
    // 4,5:1), żeby pokazać, że wiersz "Odznaka: sukces" i "Alert: sukces"
    // faktycznie przesuwają się na sam dół listy (najgorszy margines).
    const ZNANY_KIEPSKI_KOLOR = "#cccccc";
    const podmienionyCss = tekstCss.replace(
      /--psy-success:\s*#[0-9a-fA-F]{3,8}\s*;/,
      `--psy-success: ${ZNANY_KIEPSKI_KOLOR};`,
    );
    if (podmienionyCss === tekstCss) {
      console.error("BŁĄD self-testu: nie znalazłem --psy-success do podmiany w pamięci.");
      process.exit(2);
    }

    const { tokeny: tokenyPo } = wczytajTokeny(podmienionyCss);
    const paryPo = zbudujPary(tokenyPo, rozmiary);
    const wynikPo = wypiszTabele(
      paryPo,
      `PO PODMIANIE (tylko w pamięci): --psy-success -> ${ZNANY_KIEPSKI_KOLOR}`,
    );

    const przedWiersz = pary.find((p) => p.etykieta === "Odznaka: sukces");
    const poWiersz = wynikPo.posortowane.find((p) => p.etykieta === "Odznaka: sukces");
    console.log('\nPorównanie wiersza „Odznaka: sukces”:');
    console.log(`  przed podmianą: kontrast spoczynek=${formatuj(przedWiersz.kSpoczynek)}, margines=${formatuj(przedWiersz.margines)}`);
    console.log(`  po podmianie:   kontrast spoczynek=${formatuj(poWiersz.kSpoczynek)}, margines=${formatuj(poWiersz.margines)}`);

    // Kontrola niezależna: kontrast #cccccc na tle złożonym z --psy-success-bg
    // (bez przechodzenia przez zbudujPary/wczytajTokeny) — ta sama liczba co
    // wiersz tabeli wyżej potwierdza, że nie ma tu dwóch rozbieżnych ścieżek
    // liczenia w tym pliku.
    const tloNiezaleznie = zloz(tokeny["psy-success-bg"], [255, 255, 255]);
    const kNiezaleznie = kontrast([204, 204, 204], tloNiezaleznie);
    console.log(
      poWiersz.kSpoczynek < przedWiersz.kSpoczynek
        ? "\nWYNIK: tabela zmieniła się zgodnie z oczekiwaniem po podmianie tokenu — narzędzie faktycznie czyta CSS, nie stałe."
        : "\nWYNIK: BŁĄD — tabela nie zmieniła się po podmianie tokenu.",
    );
    console.log(
      `(kontrola niezależna: kontrast(#cccccc, spoczynek success-bg) liczony osobno = ${formatuj(kNiezaleznie)}, w tabeli wyżej = ${formatuj(poWiersz.kSpoczynek)} — ${kNiezaleznie === poWiersz.kSpoczynek ? "zgodne" : "ROZBIEŻNE"})`,
    );
    console.log("\nPlik na dysku nie był dotknięty — to samo globals.css, ta sama treść, sprawdź: git status --porcelain app/globals.css");
  }
}

main();
