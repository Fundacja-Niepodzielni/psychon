// Przyrząd pomiarowy śladu okruszków (Breadcrumbs, wariant "pelne", fixture
// "slad-ciasny") — mierzy TRAFIENIEM (elementFromPoint), nie pudełkiem
// (boundingBox()). Poprzednie narzędzie (boundingBox, próg
// 44px, dwa rozłączne prostokąty) było ślepe na to, że warstwy trafienia
// (::after, position:absolute) mogą się nakładać, mimo że pudełka <li> się
// nie stykają. To narzędzie odpowiada na pytanie "w co
// użytkownik trafi", nie "jak duże jest pudełko".
//
// Wcześniejszy przegląd tego pliku wykazał, że poprzednia wersja dalej
// pytała "jak duże jest pudełko"
// w przebraniu — obie decyzje (kryterium A: kontrola ujemna, kryterium B:
// próg 24px) liczyły się z `getComputedStyle(...,"::after").width`, a
// `elementFromPoint` służył tylko do logu informacyjnego. Kontrola ujemna
// sprawdzała JEDEN punkt w stałej odległości 12px za własnym `<li>` — a to
// jest SUFIT nadmiaru dla `width: max(24px, 100%)` przy DOWOLNYM niezerowym
// `<li>` ((24-szerLi)/2 < 12px), więc realna kradzież 7,8px trafień sąsiada
// (zmierzona na `<li>` 29,39px) trafiała w punkt, który już należy do
// sąsiada z pełnym prawem, i przechodziła zielono.
//
// Naprawa: zamiast jednego stałego punktu, cztery skany trafieniem
// od środka celu na zewnątrz (lewo/prawo/góra/dół), krok 1px,
// `elementFromPoint` na KAŻDYM kroku — promień w danym kierunku to
// największe `d`, dla którego trafienie WCIĄŻ jest MOIM testid. To jest
// realny, zmierzony zasięg własnego hit-boxa, nie CSS:
//   - szerokość/wysokość UŻYWANA W DECYZJI (kryterium B, próg 24px) to suma
//     dwóch przeciwległych promieni — zmierzona trafieniem.
//   - kontrola ujemna (kryterium A) to: czy promień w stronę sąsiada
//     WYCHODZI POZA WŁASNE `<li>` (`liLeft`/`liRight`) — jeśli tak, to
//     dowolny nadmiar > 0px jest realną inwazją (żaden sufit, żaden stały
//     próg odległości). Ten sam skan, jedna liczba, dwie decyzje.
// `getComputedStyle(...,"::after")` zostaje WYŁĄCZNIE jako log informacyjny
// do porównania — nie wchodzi w żadną gałąź `if` tego pliku.
//
// Kody sterowane, dokładnie trzy — {0, 2, 3}, ten sam wzorzec co
// pomiar-celow-dotyku.mjs:
//   0 = zaliczony: obie kontrole (dodatnia, ujemna) przeszły dla KAŻDEGO
//       celu, wszystkie 4 cele ≥ 24px w obu wymiarach (zmierzone trafieniem).
//   2 = NIE ZMIERZONO — przyrząd sam jest niesprawny: brak elementu w DOM,
//       `elementFromPoint` zwrócił null w dowolnym punkcie skanu/kontroli,
//       skan promienia nie zakończył się w limicie (możliwa pętla), ALBO
//       kontrola dodatnia nie trafiła w siebie (
//       "jeśli choć raz nie trafia, przyrząd jest zepsuty i NIC więcej nie
//       mierzysz"). Żadna liczba zbiorcza w tej gałęzi — tylko nazwana
//       przyczyna w stderr i wiersz, którego dotyczy.
//   3 = ZMIERZONE NARUSZENIE — przyrząd jest sprawny (obie kontrole
//       przeszły), ale realnie znalazł cel < 24px w którymś wymiarze
//       (zmierzonym trafieniem), albo kontrolę ujemną, która wykryła realne
//       zachodzenie na sąsiada (promień wykroczył poza własne `<li>`).
// Kod spoza {0,2,3} = narzędzie nie doszło do końca (przeglądarka się nie
// uruchomiła, nawigacja padła) — przyczyna w stderr, jeśli środowisko ją
// wypisało; ta gałąź jest w try/catch z tego samego powodu co w
// pomiar-celow-dotyku.mjs: kod 3 ma znaczyć WYŁĄCZNIE "pomiar się odbył i
// wykrył naruszenie", nigdy "narzędzie nie wystartowało".
import { chromium } from "@playwright/test";
import { OCZEKIWANE_CELE_SLADU } from "./cele-sladu-oczekiwane.mjs";

const PORT = process.env.PORT_POLIGONU || "4173";
const URL = `http://127.0.0.1:${PORT}/`;
const PROG_PX = 24; // AA 2.5.8: ślad jest nawigacją
// zapasową — próg 44px POZA śladem (pomiar-celow-dotyku.mjs) się nie zmienia.
const KROK_SKANU_PX = 1; // px, rozdzielczość skanu promienia trafieniem —
// celowo drobniejsza niż dawna siatka (2px), bo decyzja o naruszeniu teraz
// zależy od TEGO kroku wprost (nadmiar > 0px po tym kroku = naruszenie), a
// nie od stałego punktu kontrolnego — drobniejszy krok = ostrzejsza granica.
const MAKS_ZASIEG_SKANU_PX = 100; // px, bezpiecznik przeciw nieskończonej
// pętli/hit-boxowi bez końca — hojny margines ponad każdą zmierzoną wartość
// w tym pomiarze i w przeglądzie (nawet podłoga 80px z przeglądu daje promień ~40).
const TOLERANCJA_RENDEROWANIA_PX = 2; // px — NIE jest to sufit CSS jak w
// dawnej wadzie (ODSTEP_KONTROLI_UJEMNEJ=12, sufitujące (24-szerLi)/2
// dla KAŻDEGO niezerowego <li>). Zmierzone bezpośrednio (ten
// plik, skan promienia): nawet w uczciwym, zero-inwazyjnym układzie (`gap`
// dodany tymczasowo między `<li>`, potwierdzenie: TA SAMA wartość z i bez
// gapu — więc źródłem NIE jest sąsiad) skan trafieniem znajduje własny testid
// do ok. 0,07-0,8px POZA geometryczną połową własnego `<li>` — subpikselowe
// zaokrąglanie renderowania (flex rozdziela ułamkowe px między dzieci,
// `<a>` i `::after` liczą swoją geometrię niezależnie, każde zaokrągla przy
// malowaniu osobno). To NIE jest realna kradzież trafień (żaden użytkownik
// nie celuje z dokładnością poniżej 1px) i NIE zależy od CSS, który ta
// zmiana kontroluje — 2px to margines z zapasem ponad każdą zmierzoną
// wartość szumu (maks. 0,8px), wciąż 6x mniejszy niż zmierzona realna
// inwazja z odbioru (7,8px) i 16x mniejszy niż próg kryterium (24px) — więc
// realne inwazje tej skali i większe pozostają wykrywalne kodem 3.


// Geometria fixture "slad-ciasny" (main.tsx): 5 pozycji, ostatnia (Quiz) nie
// jest odnośnikiem (Breadcrumbs.tsx: ostatnia NIGDY nie jest linkiem), więc
// nie jest celem dotyku — mierzona osobno, informacyjnie, bez sąsiadów do
// kontroli ujemnej i bez wpisu w OCZEKIWANE_CELE_SLADU.
const KONTENER = '[data-style-id="m7-breadcrumbs-slad-ciasny"]';
const CELE = [
  { nazwa: "Kursy", testid: "slad-cel-0", indeks: 0, kierunki: ["prawo"] },
  { nazwa: "P1", testid: "slad-cel-1", indeks: 1, kierunki: ["lewo", "prawo"] },
  { nazwa: "M2", testid: "slad-cel-2", indeks: 2, kierunki: ["lewo", "prawo"] },
  { nazwa: "L5", testid: "slad-cel-3", indeks: 3, kierunki: ["lewo"] },
];
const POZYCJA_INFORMACYJNA = { nazwa: "Quiz (Text, nie jest celem dotyku)", indeks: 4, liTestid: "slad-pozycja-4" };

let wynikiSurowe;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  // Jeden viewport (412, najciaśniejszy realny — mobile), nie dwa jak w
  // pomiar-celow-dotyku.mjs: szerokość `.pozycja > a::after` jest funkcją
  // TREŚCI (tekst etykiety) i layoutu flex bez wzrostu/skurczu procentowego
  // względem kontenera, nie funkcją szerokości viewportu — 1440px dałoby
  // identyczne piksele tego konkretnego pomiaru, drugi bieg byłby
  // powtórzeniem, nie nowym pomiarem. Jeden motyw (domyślny, "light" przez
  // brak parametru) z tego samego powodu: kolor nie zmienia geometrii.
  await page.goto(URL);
  await page.waitForSelector(KONTENER);
  // Poligon montuje WSZYSTKIE atomy/molekuły jeden pod drugim (main.tsx) —
  // fixture "slad-ciasny" jest daleko poniżej pierwszego ekranu (viewport
  // 412x900). getBoundingClientRect() zwraca współrzędne WZGLĘDEM
  // VIEWPORTU po aktualnym przewinięciu — bez przewinięcia kontenera w
  // widok rectLi.top/cx/cy wypadały poza {0..900}, więc
  // elementFromPoint(cx,cy) zwracał null dla KAŻDEGO celu (zmierzone: bieg
  // 1, kod 2, "elementFromPoint(srodek) zwrocil null" dla wszystkich
  // czterech). To jest dokładnie właściwość, którą ma łapać zapadka noga 4
  // — przyczyna nazwana, zero liczb zbiorczych w tamtym biegu.
  await page.locator(KONTENER).scrollIntoViewIfNeeded();

  wynikiSurowe = await page.evaluate(
    ({ kontenerSel, cele, pozycjaInfo, krokSkanu, maksZasieg, tolerancjaRenderowania }) => {
      function identyfikujCel(el) {
        if (!el) return { rodzaj: "null" };
        const cel = el.closest('[data-testid^="slad-cel-"]');
        if (cel) return { rodzaj: "cel", testid: cel.getAttribute("data-testid") };
        return { rodzaj: "inny" };
      }

      const kontener = document.querySelector(kontenerSel);
      if (!kontener) {
        return { blad: `kontener "${kontenerSel}" nie istnieje w DOM` };
      }
      // WSZYSTKIE dalsze wyszukania MUSZĄ być zakresowane do `kontener`, nie
      // do `document` — Breadcrumbs.tsx renderuje się na tej samej stronie
      // poligonu w kilku mountach (pelne/skrocone/slad-ciasny), więc
      // `data-testid="slad-pozycja-2"` istnieje wielokrotnie w DOM (ten sam
      // indeks w każdym mouncie). `document.querySelector` (bez zakresu)
      // łapał PIERWSZE wystąpienie w całym dokumencie — czyli element z
      // INNEGO mountu, nie z "slad-ciasny". Zmierzone: bieg 2 tego
      // przyrządu złapał to dokładnie przez kontrolę dodatnią (noga 2) —
      // "M2 (slad-cel-2): punkt w srodku NIE trafil w ten element" — bo
      // `zmierzWymiary` policzył środek <li> z JEDNEGO mountu, a
      // `elementFromPoint` na tym punkcie trafiał w element z INNEGO
      // mountu renderowanego w zupełnie innym miejscu strony. Przyrząd
      // zrobił dokładnie to, co miał zrobić: zatrzymał się, zanim
      // wypisałby fałszywą liczbę.

      function zmierzReferencje(elCel, elLi) {
        const rectLi = elLi.getBoundingClientRect();
        // Informacyjnie WYŁĄCZNIE — porównanie z tym, co realnie mierzy skan
        // trafieniem niżej. Ta wartość NIE wchodzi w żadną decyzję
        // (patrz nagłówek pliku — to był dokładnie dawny błąd tego narzędzia).
        const styleAfter = getComputedStyle(elCel, "::after");
        const szerokoscCss = parseFloat(styleAfter.width);
        const wysokoscCss = parseFloat(styleAfter.height);
        if (!Number.isFinite(szerokoscCss) || !Number.isFinite(wysokoscCss) || rectLi.width === 0 || rectLi.height === 0) {
          return null;
        }
        return {
          szerokoscCss,
          wysokoscCss,
          cx: rectLi.left + rectLi.width / 2,
          cy: rectLi.top + rectLi.height / 2,
          liLeft: rectLi.left,
          liRight: rectLi.right,
        };
      }

      // Skan promienia trafieniem od (cx,cy) w kierunku jednostkowym
      // (dx0,dy0), krok `krokSkanu` px, do `maksZasieg` px. Promień = ostatnie
      // `d`, dla którego elementFromPoint(cx+dx0*d, cy+dy0*d) trafia WE
      // WŁASNY `testid`. Pierwszy punkt, który trafia w COKOLWIEK INNEGO
      // (sąsiad, separator, tło), kończy skan — to jest realna, zmierzona
      // granica własnego hit-boxa w tym kierunku, bez udziału CSS.
      function skanujPromien(testid, cx, cy, dx0, dy0) {
        let promien = 0;
        for (let d = 0; d <= maksZasieg; d += krokSkanu) {
          const x = cx + dx0 * d;
          const y = cy + dy0 * d;
          const trafiony = document.elementFromPoint(x, y);
          if (trafiony === null) {
            return { blad: `elementFromPoint zwrocil null w skanie promienia (d=${d}px, kierunek ${dx0},${dy0})` };
          }
          const id = identyfikujCel(trafiony);
          if (id.rodzaj === "cel" && id.testid === testid) {
            promien = d;
            continue;
          }
          return { promien };
        }
        return {
          blad: `skan promienia (kierunek ${dx0},${dy0}) nie zakonczyl sie w limicie ${maksZasieg}px — mozliwa petla albo hit-box bez konca`,
        };
      }

      const wyniki = [];

      for (const cel of cele) {
        const elCel = kontener.querySelector(`[data-testid="${cel.testid}"]`);
        const elLi = kontener.querySelector(`[data-testid="slad-pozycja-${cel.indeks}"]`);
        if (!elCel || !elLi) {
          wyniki.push({ nazwa: cel.nazwa, testid: cel.testid, blad: "element celu albo jego <li> nie istnieje w DOM" });
          continue;
        }
        const ref = zmierzReferencje(elCel, elLi);
        if (!ref) {
          wyniki.push({ nazwa: cel.nazwa, testid: cel.testid, blad: "wymiar niezmierzalny (NaN albo <li> zerowej wielkosci)" });
          continue;
        }
        const { szerokoscCss, wysokoscCss, cx, cy, liLeft, liRight } = ref;

        // Kontrola dodatnia (noga 2, niezmieniona): punkt
        // DOKLADNIE w srodku musi trafic w SIEBIE, inaczej przyrzad jest
        // zepsuty (kod 2), zanim policzymy cokolwiek dalej.
        const trafionySrodek = document.elementFromPoint(cx, cy);
        if (trafionySrodek === null) {
          wyniki.push({ nazwa: cel.nazwa, testid: cel.testid, blad: "elementFromPoint(srodek) zwrocil null" });
          continue;
        }
        const idSrodka = identyfikujCel(trafionySrodek);
        const kontrolaDodatniaOk = idSrodka.rodzaj === "cel" && idSrodka.testid === cel.testid;

        // Cztery skany promienia trafieniem — jedna liczba, dwie decyzje
        // (patrz naglowek pliku). Kazdy moze zglosic blad (null w
        // elementFromPoint albo petla bez konca) — zapadka noga 4.
        const promLewo = skanujPromien(cel.testid, cx, cy, -1, 0);
        const promPrawo = skanujPromien(cel.testid, cx, cy, 1, 0);
        const promGora = skanujPromien(cel.testid, cx, cy, 0, -1);
        const promDol = skanujPromien(cel.testid, cx, cy, 0, 1);
        const bladySkanu = [promLewo, promPrawo, promGora, promDol].filter((p) => p.blad);
        if (bladySkanu.length > 0) {
          wyniki.push({ nazwa: cel.nazwa, testid: cel.testid, blad: bladySkanu.map((b) => b.blad).join(" | ") });
          continue;
        }

        // Kryterium B: szerokosc/wysokosc UZYWANA W DECYZJI to suma
        // przeciwleglych promieni trafieniem — nie CSS.
        const szerokoscTrafieniem = promLewo.promien + promPrawo.promien;
        const wysokoscTrafieniem = promGora.promien + promDol.promien;

        // Kryterium A: nadmiar promienia POZA WLASNYM <li> w strone kazdego
        // zgloszonego sasiada. `liRight-cx`/`cx-liLeft` to polowa szerokosci
        // WLASNEGO <li> (granica strukturalna, patrz komentarz w
        // Breadcrumbs.module.css) — kazdy promien, ktory ja przekracza,
        // realnie wszedl na terytorium sasiada. Zero sufitu, zero stalego
        // punktu: dowolny nadmiar > 0px (przy rozdzielczosci skanu 1px) jest
        // NARUSZENIEM, wlacznie z tym, co dawna kontrola (stale 12px)
        // strukturalnie nie mogla zobaczyc (7,8px na waskim <li>, patrz
        // naglowek pliku).
        const polowaLi = { lewo: cx - liLeft, prawo: liRight - cx };
        const promienie = { lewo: promLewo.promien, prawo: promPrawo.promien };
        const kontroleUjemne = [];
        for (const kierunek of cel.kierunki) {
          const nadmiarPx = Math.round((promienie[kierunek] - polowaLi[kierunek]) * 100) / 100;
          kontroleUjemne.push({ kierunek, nadmiarPx, naruszenie: nadmiarPx > tolerancjaRenderowania });
        }

        wyniki.push({
          nazwa: cel.nazwa,
          testid: cel.testid,
          szerokoscCss: Math.round(szerokoscCss * 100) / 100,
          wysokoscCss: Math.round(wysokoscCss * 100) / 100,
          szerokoscTrafieniem,
          wysokoscTrafieniem,
          kontrolaDodatniaOk,
          kontroleUjemne,
        });
      }

      // Pozycja informacyjna (Quiz) — wymiar bez oceny, nie jest celem dotyku.
      let infoPozycja = null;
      const elLiInfo = kontener.querySelector(`[data-testid="${pozycjaInfo.liTestid}"]`);
      if (elLiInfo) {
        const rect = elLiInfo.getBoundingClientRect();
        infoPozycja = { nazwa: pozycjaInfo.nazwa, szerokoscLi: Math.round(rect.width * 100) / 100, wysokoscLi: Math.round(rect.height * 100) / 100 };
      }

      return { wyniki, infoPozycja };
    },
    {
      kontenerSel: KONTENER,
      cele: CELE,
      pozycjaInfo: POZYCJA_INFORMACYJNA,
      krokSkanu: KROK_SKANU_PX,
      maksZasieg: MAKS_ZASIEG_SKANU_PX,
      tolerancjaRenderowania: TOLERANCJA_RENDEROWANIA_PX,
    },
  );

  await browser.close();
} catch (blad) {
  console.error(`POMIAR CELOW SLADU: NARZEDZIE NIE URUCHOMIONE — ${blad.message}`);
  process.exit(2);
}

if (wynikiSurowe.blad) {
  console.error(`POMIAR CELOW SLADU: NIE ZMIERZONO — ${wynikiSurowe.blad}`);
  process.exit(2);
}

const { wyniki, infoPozycja } = wynikiSurowe;

// Zapadka (noga 4): kazdy wiersz z `blad` (element brakujacy, wymiar
// niezmierzalny, elementFromPoint null, skan promienia bez konca) konczy
// caly pomiar kodem 2 — PRZED jakimkolwiek zbiorczym podliczeniem. Pusty
// wynik to nie zero.
const bledy = wyniki.filter((w) => w.blad);
if (bledy.length > 0) {
  console.error("POMIAR CELOW SLADU: NIE ZMIERZONO — przyrzad nie doszedl do konca dla:");
  for (const b of bledy) {
    console.error(`  NIE ZMIERZONO: ${b.nazwa} (${b.testid}) — ${b.blad}`);
  }
  process.exit(2);
}

// Rozjazd wobec rejestru niezaleznego (ten sam wzorzec co brakujaceWCELE w
// pomiar-celow-dotyku.mjs) — element z rejestru, ktorego nie ma wsrod
// zmierzonych, jest NIE ZMIERZONO, nie cichym pominieciem.
const zmierzoneTestidy = new Set(wyniki.map((w) => w.testid));
const brakujaceWRejestrze = OCZEKIWANE_CELE_SLADU.filter((testid) => !zmierzoneTestidy.has(testid));
if (brakujaceWRejestrze.length > 0) {
  console.error(`POMIAR CELOW SLADU: NIE ZMIERZONO — brakuje w wynikach celow z rejestru: ${brakujaceWRejestrze.join(", ")}`);
  process.exit(2);
}

// Kontrola dodatnia (noga 2): jesli KTORYKOLWIEK cel nie trafia w siebie w
// wlasnym srodku, przyrzad jest zepsuty — kod 2, ZERO liczb zbiorczych
// nizej ("jesli choc raz nie trafia (...) konczysz kodem
// 2 i nic wiecej nie mierzysz").
const dodatniaPadla = wyniki.filter((w) => !w.kontrolaDodatniaOk);
if (dodatniaPadla.length > 0) {
  console.error("POMIAR CELOW SLADU: PRZYRZAD ZEPSUTY — kontrola dodatnia nie trafila w siebie dla:");
  for (const d of dodatniaPadla) {
    console.error(`  ${d.nazwa} (${d.testid}): punkt w srodku NIE trafil w ten element.`);
  }
  process.exit(2);
}

console.log(`POMIAR CELOW SLADU — fixture "slad-ciasny", viewport 412px, skan promienia trafieniem co ${KROK_SKANU_PX}px:\n`);

// Kontrola ujemna (kryterium A): NARUSZENIE = promien wlasnego hit-boxa w
// strone sasiada przekroczyl POLOWE WLASNEGO <li> (patrz komentarz przy jej
// liczeniu wyzej) — to jest realna inwazja zmierzona trafieniem, bez sufitu.
let ujemnaPadla = false;
for (const w of wyniki) {
  for (const k of w.kontroleUjemne) {
    if (k.naruszenie) ujemnaPadla = true;
  }
}

// Kryterium B: prog 24px liczony z trafienia (szerokoscTrafieniem/
// wysokoscTrafieniem), NIE z CSS.
const ponizejProgu = wyniki.filter((w) => w.szerokoscTrafieniem < PROG_PX || w.wysokoscTrafieniem < PROG_PX);

for (const w of wyniki) {
  const ocena = w.szerokoscTrafieniem >= PROG_PX && w.wysokoscTrafieniem >= PROG_PX ? "OK" : `PONIZEJ ${PROG_PX}px`;
  console.log(
    `  ${w.nazwa} (${w.testid}): trafieniem szer=${w.szerokoscTrafieniem}px wys=${w.wysokoscTrafieniem}px — ${ocena} | informacyjnie CSS ::after szer=${w.szerokoscCss}px wys=${w.wysokoscCss}px`,
  );
  for (const k of w.kontroleUjemne) {
    console.log(
      `      kontrola ujemna (${k.kierunek}, promien vs polowa wlasnego <li>, tolerancja renderowania ${TOLERANCJA_RENDEROWANIA_PX}px): nadmiar=${k.nadmiarPx}px — ${k.naruszenie ? "NARUSZENIE (promien wyszedl poza wlasne <li> ponad tolerancje)" : "OK (w granicach wlasnego <li> +/- szum renderowania)"}`,
    );
  }
}

if (infoPozycja) {
  console.log(
    `\n  [informacyjnie, NIE jest celem dotyku] ${infoPozycja.nazwa}: <li> szer=${infoPozycja.szerokoscLi}px wys=${infoPozycja.wysokoscLi}px (Text, nie odnosnik — Breadcrumbs.tsx: ostatnia pozycja nigdy nie jest linkiem)`,
  );
}

console.log(`\nCELE ZMIERZONE: ${wyniki.length} / OCZEKIWANE: ${OCZEKIWANE_CELE_SLADU.length}`);
console.log(`PONIZEJ ${PROG_PX}px (trafieniem): ${ponizejProgu.length}`);
console.log(`KONTROLA UJEMNA NARUSZONA (trafieniem): ${ujemnaPadla ? "TAK" : "nie"}`);

const zawiodl = ponizejProgu.length > 0 || ujemnaPadla;
if (zawiodl) {
  console.error(
    `POMIAR CELOW SLADU NIEUDANY: ${ponizejProgu.length} celow ponizej ${PROG_PX}px (trafieniem), kontrola ujemna ${ujemnaPadla ? "NARUSZONA" : "czysta"}.`,
  );
}
process.exit(zawiodl ? 3 : 0);
