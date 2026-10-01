import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { uruchomAxe } from "./_axe";

/**
 * Pomiar bloku „Konto” i przycisku „Wyloguj” w menu ramy panelu — wspólny dla trzech
 * powłok (administracja, uczestnik, prowadzący), bo wszystkie biorą blok z jednego szablonu.
 *
 * Kontener to menu boczne (od 1024 px) albo otwarte okno menu (poniżej 1024 px).
 * Liczby pochodzą ze stylu obliczonego przez przeglądarkę:
 * - blok bez treści pod spodem: bez ramki, bez cienia, bez obrysu, na tle menu;
 * - blok nad treścią przewijaną pod nim: jedna cienka linia u góry, nadal bez cienia;
 * - przycisk w spoczynku: bez ramki, bez cienia, bez obrysu, bez tła, wysokość co najmniej 44 px;
 * - napis i ikona w barwie działań niebezpiecznych, kontrast do tła menu i do tła najechania co najmniej 4,5;
 * - tło najechania i pierścień fokusu takie same jak w pozycji menu;
 * - axe bez naruszeń na ramie z widocznym menu.
 *
 * Zrzuty powstają tylko przy ustawionej zmiennej `PW_ZRZUTY_WYLOGUJ` (katalog poza repozytorium)
 * i są robione przed pierwszym sprawdzeniem.
 */

function katalogZrzutow(): string | null {
  const katalog = process.env.PW_ZRZUTY_WYLOGUJ;
  if (!katalog) return null;
  mkdirSync(katalog, { recursive: true });
  return katalog;
}

/** Styl obliczony bloku „Konto”, przycisku „Wyloguj”, ikony i napisu oraz barwy wzorcowe z tokenów. */
async function odczyt(kontener: Locator) {
  return kontener.evaluate((el) => {
    const blok = el.querySelector("[data-konto-menu]") as HTMLElement;
    const przycisk = blok.querySelector("button") as HTMLButtonElement;
    const ikona = przycisk.querySelector("svg") as SVGElement;
    const napis = przycisk.querySelector("span") as HTMLElement;

    type Barwa = { r: number; g: number; b: number; a: number };
    const barwa = (zapis: string): Barwa => {
      const [r = 0, g = 0, b = 0, a = 1] = (zapis.match(/[\d.]+/g) ?? []).map(Number);
      return { r, g, b, a };
    };
    const naTle = (gora: Barwa, dol: Barwa): Barwa => ({
      r: gora.r * gora.a + dol.r * (1 - gora.a),
      g: gora.g * gora.a + dol.g * (1 - gora.a),
      b: gora.b * gora.a + dol.b * (1 - gora.a),
      a: 1,
    });
    const jasnosc = ({ r, g, b }: Barwa) => {
      const kanal = (wartosc: number) => {
        const c = wartosc / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
    };
    const kontrast = (a: Barwa, b: Barwa) => {
      const [jasna, ciemna] = [jasnosc(a), jasnosc(b)].sort((x, y) => y - x);
      return Math.round(((jasna + 0.05) / (ciemna + 0.05)) * 100) / 100;
    };
    /** Tło, na którym element faktycznie stoi: warstwy przodków złożone od najbliższego nieprzezroczystego. */
    const tloPod = (start: Element): Barwa => {
      const warstwy: Barwa[] = [];
      for (let wezel: Element | null = start; wezel; wezel = wezel.parentElement) {
        const tlo = barwa(getComputedStyle(wezel).backgroundColor);
        if (tlo.a > 0) warstwy.push(tlo);
        if (tlo.a === 1) break;
      }
      return warstwy.reverse().reduce((dol, gora) => naTle(gora, dol), { r: 255, g: 255, b: 255, a: 1 });
    };
    /** Barwa tokenu rozwiązana w tym samym miejscu drzewa, w którym stoi przycisk. */
    const zTokenu = (nazwa: string) => {
      const sonda = document.createElement("span");
      sonda.style.color = `var(--${nazwa})`;
      blok.appendChild(sonda);
      const wynik = getComputedStyle(sonda).color;
      sonda.remove();
      return wynik;
    };
    const ramki = (s: CSSStyleDeclaration) => [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];

    const sb = getComputedStyle(blok);
    const sp = getComputedStyle(przycisk);
    const si = getComputedStyle(ikona);
    const tlo = tloPod(przycisk);
    return {
      nadTrescia: /kontoNadTrescia/.test(blok.getAttribute("class") ?? ""),
      trescPodSpodem: el.scrollHeight - el.clientHeight - el.scrollTop > 1,
      tloMenu: getComputedStyle(el).backgroundColor,
      blok: { cien: sb.boxShadow, obrys: sb.outlineStyle, ramki: ramki(sb), barwaLinii: sb.borderTopColor, tlo: sb.backgroundColor },
      przycisk: {
        cien: sp.boxShadow,
        obrys: sp.outlineStyle,
        gruboscObrysu: sp.outlineWidth,
        barwaObrysu: sp.outlineColor,
        odstepObrysu: sp.outlineOffset,
        ramki: ramki(sp),
        tlo: sp.backgroundColor,
        barwa: sp.color,
        wysokosc: Math.round(przycisk.getBoundingClientRect().height * 100) / 100,
        szerokosc: Math.round(przycisk.getBoundingClientRect().width * 100) / 100,
        tekst: (przycisk.textContent ?? "").trim(),
      },
      ikona: { kreska: si.stroke, barwa: si.color },
      napis: getComputedStyle(napis).color,
      wzorzec: { blad: zTokenu("error"), linia: zTokenu("border") },
      tloPodPrzyciskiem: `rgb(${Math.round(tlo.r)}, ${Math.round(tlo.g)}, ${Math.round(tlo.b)})`,
      kontrast: kontrast(barwa(sp.color), tlo),
    };
  });
}

/** Tło i pierścień fokusu pierwszej pozycji menu, która nie jest pozycją bieżącą. */
async function stylPozycji(pozycja: Locator) {
  return pozycja.evaluate((el) => {
    const s = getComputedStyle(el);
    return { tlo: s.backgroundColor, obrys: s.outlineStyle, gruboscObrysu: s.outlineWidth, barwaObrysu: s.outlineColor, odstepObrysu: s.outlineOffset };
  });
}

export async function sprawdzWylogujWMenu(page: Page, kontener: Locator, opis: string): Promise<void> {
  const blok = kontener.locator("[data-konto-menu]");
  const przycisk = blok.getByRole("button", { name: "Wyloguj", exact: true });
  const pozycja = kontener.locator('nav a:not([aria-current="page"])').first();
  await expect(przycisk).toBeVisible();
  await expect(pozycja).toBeVisible();
  // Stan wejścia ustalony: sygnał treści pod blokiem zgadza się z tym, czy pod blokiem zostało coś do przewinięcia.
  await expect.poll(async () => {
    const o = await odczyt(kontener);
    return o.nadTrescia === o.trescPodSpodem;
  }, { timeout: 5000 }).toBe(true);
  const okno = page.viewportSize()!;
  const pozaMenu = async () => page.mouse.move(okno.width - 4, okno.height - 4);

  const katalog = katalogZrzutow();
  if (katalog) {
    await page.screenshot({ path: path.join(katalog, `wyloguj-${opis}.png`) });
    await przycisk.hover();
    await page.screenshot({ path: path.join(katalog, `wyloguj-${opis}-najechany.png`) });
    await pozaMenu();
  }

  const wejscie = await odczyt(kontener);
  if (wejscie.nadTrescia) {
    // Pod blokiem jest treść menu: jedna cienka linia u góry, nic po bokach i u dołu, bez cienia.
    expect(wejscie.blok.ramki, `${opis}: linia tylko u góry ${JSON.stringify(wejscie.blok)}`).toEqual(["1px", "0px", "0px", "0px"]);
    expect(wejscie.blok.barwaLinii, `${opis}: linia w barwie krawędzi z tokenów`).toBe(wejscie.wzorzec.linia);
    expect(wejscie.blok.cien, `${opis}: blok nad treścią bez cienia`).toBe("none");
  }

  // Bez treści pod spodem (menu przewinięte do końca albo mieszczące się w oknie): blok nie ma żadnej krawędzi.
  await kontener.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
  await expect.poll(async () => (await odczyt(kontener)).nadTrescia, { timeout: 5000 }).toBe(false);
  const spoczynek = await odczyt(kontener);
  const zapis = JSON.stringify(spoczynek);
  expect(spoczynek.blok.ramki, `${opis}: blok bez ramki ${zapis}`).toEqual(["0px", "0px", "0px", "0px"]);
  expect(spoczynek.blok.cien, `${opis}: blok bez cienia ${zapis}`).toBe("none");
  expect(spoczynek.blok.obrys, `${opis}: blok bez obrysu ${zapis}`).toBe("none");
  expect(spoczynek.blok.tlo, `${opis}: tło bloku jest tłem menu ${zapis}`).toBe(spoczynek.tloMenu);
  expect(spoczynek.przycisk.ramki, `${opis}: przycisk bez ramki ${zapis}`).toEqual(["0px", "0px", "0px", "0px"]);
  expect(spoczynek.przycisk.cien, `${opis}: przycisk bez cienia ${zapis}`).toBe("none");
  expect(spoczynek.przycisk.obrys, `${opis}: przycisk bez obrysu w spoczynku ${zapis}`).toBe("none");
  expect(spoczynek.przycisk.tlo, `${opis}: przycisk bez tła w spoczynku ${zapis}`).toBe("rgba(0, 0, 0, 0)");
  expect(spoczynek.przycisk.wysokosc, `${opis}: cel dotyku ${zapis}`).toBeGreaterThanOrEqual(44);
  expect(spoczynek.przycisk.barwa, `${opis}: napis w barwie działań niebezpiecznych ${zapis}`).toBe(spoczynek.wzorzec.blad);
  expect(spoczynek.napis, `${opis}: napis dziedziczy barwę przycisku ${zapis}`).toBe(spoczynek.wzorzec.blad);
  expect(spoczynek.ikona.kreska, `${opis}: ikona w barwie napisu ${zapis}`).toBe(spoczynek.wzorzec.blad);
  expect(spoczynek.kontrast, `${opis}: kontrast napisu i ikony do tła menu ${zapis}`).toBeGreaterThanOrEqual(4.5);

  // Najechanie: to samo tło co najechana pozycja menu; napis i ikona nadal czytelne.
  await pozycja.hover();
  await expect.poll(async () => (await stylPozycji(pozycja)).tlo, { timeout: 5000 }).not.toBe("rgba(0, 0, 0, 0)");
  const pozycjaNajechana = await stylPozycji(pozycja);
  await przycisk.hover();
  await expect.poll(async () => (await odczyt(kontener)).przycisk.tlo, { timeout: 5000 }).toBe(pozycjaNajechana.tlo);
  const najechany = await odczyt(kontener);
  expect(najechany.przycisk.barwa, `${opis}: najechany napis nadal w barwie działań niebezpiecznych`).toBe(najechany.wzorzec.blad);
  expect(najechany.kontrast, `${opis}: kontrast na tle najechania ${JSON.stringify(najechany)}`).toBeGreaterThanOrEqual(4.5);
  await pozaMenu();

  // Fokus z klawiatury: ten sam pierścień co na pozycji menu.
  await page.keyboard.press("Tab");
  await pozycja.focus();
  await expect.poll(async () => (await stylPozycji(pozycja)).obrys, { timeout: 5000 }).toBe("solid");
  const pozycjaWFokusie = await stylPozycji(pozycja);
  const pierscienPozycji = {
    obrys: pozycjaWFokusie.obrys,
    gruboscObrysu: pozycjaWFokusie.gruboscObrysu,
    barwaObrysu: pozycjaWFokusie.barwaObrysu,
    odstepObrysu: pozycjaWFokusie.odstepObrysu,
  };
  await przycisk.focus();
  await expect.poll(async () => (await odczyt(kontener)).przycisk.obrys, { timeout: 5000 }).toBe("solid");
  const wFokusie = (await odczyt(kontener)).przycisk;
  const pierscienPrzycisku = {
    obrys: wFokusie.obrys,
    gruboscObrysu: wFokusie.gruboscObrysu,
    barwaObrysu: wFokusie.barwaObrysu,
    odstepObrysu: wFokusie.odstepObrysu,
  };
  expect(pierscienPrzycisku, `${opis}: pierścień fokusu jak na pozycji menu`).toEqual(pierscienPozycji);
  expect(pierscienPrzycisku.gruboscObrysu, `${opis}: grubość pierścienia fokusu`).toBe("3px");
  await przycisk.blur();

  // Axe na ramie z widocznym menu, stan spoczynku.
  const naruszenia = await uruchomAxe(page);
  console.log(
    `POMIAR-WYLOGUJ ${opis} ${JSON.stringify({
      nadTresciaNaWejsciu: wejscie.nadTrescia,
      blokNaWejsciu: wejscie.blok,
      blok: spoczynek.blok,
      przycisk: spoczynek.przycisk,
      ikona: spoczynek.ikona,
      wzorzec: spoczynek.wzorzec,
      tloMenu: spoczynek.tloMenu,
      kontrastSpoczynek: spoczynek.kontrast,
      tloNajechania: najechany.przycisk.tlo,
      tloNajechaniaZlozone: najechany.tloPodPrzyciskiem,
      kontrastNajechanie: najechany.kontrast,
      pierscien: pierscienPrzycisku,
      axe: naruszenia.length,
    })}`,
  );
  expect(naruszenia.map((n) => `${n.id} (${n.impact}): ${n.selektory.join(" | ")}`), `${opis}: axe`).toEqual([]);
}
