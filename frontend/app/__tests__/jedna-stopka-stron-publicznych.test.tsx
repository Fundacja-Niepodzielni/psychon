import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KluczGrupy } from "@/lib/przelaczenie/grupy";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Na przełączonej stronie publicznej jest dokładnie jedna stopka. Układ główny
 * (`app/layout.tsx`) dokłada pod każdą stroną dawną stopkę `PublicFooter`, a ekran
 * nowego frontu niesie własną (szablon strony publicznej). Dawna stopka chowa się
 * więc wyłącznie pod adresem strony publicznej, której grupa jest włączona; przy
 * grupie wyłączonej wszystko zostaje jak dotąd (także brak stopki na deklaracji
 * dostępności). Liczymy punkty orientacyjne `contentinfo` i elementy `footer`.
 */

let sciezka = "/";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  usePathname: () => sciezka,
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const LIMIT_CZASU_MS = 30_000;

/** Adres konkretnej strony → grupa przełączenia, która ją zamienia. */
const ADRESY: Array<[string, KluczGrupy]> = [
  ["/logowanie", "logowanie"],
  ["/logowanie/konta", "logowanie"],
  ["/logowanie/niepowiazane", "logowanie"],
  ["/logowanie/zablokowane", "logowanie"],
  ["/aktywacja", "aktywacjaKonta"],
  ["/dostep-wygasl", "dostepWygasl"],
  ["/konto", "twojeKonto"],
];

const WSZYSTKIE_PUBLICZNE: Partial<Record<KluczGrupy, boolean>> = {
  logowanie: true,
  aktywacjaKonta: true,
  dostepWygasl: true,
  twojeKonto: true,
};

async function stopka(): Promise<ComponentType> {
  return (await import("@/components/layout/PublicFooter")).default;
}

async function policzStopki(wezel: () => Promise<React.ReactElement>) {
  const { act, cleanup, render, screen } = await import("@testing-library/react");
  let kontener: HTMLElement | undefined;
  const element = await wezel();
  await act(async () => {
    kontener = render(element).container;
  });
  const wynik = {
    footer: kontener!.querySelectorAll("footer").length,
    contentinfo: screen.queryAllByRole("contentinfo").length,
  };
  cleanup();
  return wynik;
}

afterEach(() => {
  przywrocRejestr();
  sciezka = "/";
});

describe("dawna stopka układu głównego a grupy stron publicznych", () => {
  it.each(ADRESY)(
    "%s przy włączonej grupie %s: dawna stopka się chowa",
    async (adres, klucz) => {
      podmienRejestr({ [klucz]: true });
      sciezka = adres;
      const PublicFooter = await stopka();
      expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 0, contentinfo: 0 });
    },
    LIMIT_CZASU_MS,
  );

  it.each(ADRESY.filter(([adres]) => adres !== "/deklaracja-dostepnosci"))(
    "%s przy wyłączonej grupie %s: dawna stopka jak dotąd",
    async (adres) => {
      podmienRejestr({});
      sciezka = adres;
      const PublicFooter = await stopka();
      expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 1, contentinfo: 1 });
    },
    LIMIT_CZASU_MS,
  );

  it("deklaracja dostępności przy wyłączonej grupie: bez dawnej stopki, jak dotąd", async () => {
    podmienRejestr({});
    sciezka = "/deklaracja-dostepnosci";
    const PublicFooter = await stopka();
    expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 0, contentinfo: 0 });
  });

  it.each(["/", "/nowy-front/publiczne/logowanie", "/dokumenty-prawne", "/logowanie/inne", "/kontokonto"])(
    "%s przy włączonych wszystkich grupach publicznych: dawna stopka bez zmian",
    async (adres) => {
      podmienRejestr(WSZYSTKIE_PUBLICZNE);
      sciezka = adres;
      const PublicFooter = await stopka();
      expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 1, contentinfo: 1 });
    },
    LIMIT_CZASU_MS,
  );

  it.each(ADRESY.filter(([adres]) => adres.startsWith("/logowanie")))(
    "%s przy dzisiejszym stanie rejestru (grupa %s wyłączona): dawna stopka jak dotąd",
    async (adres) => {
      sciezka = adres;
      const PublicFooter = await stopka();
      expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 1, contentinfo: 1 });
    },
    LIMIT_CZASU_MS,
  );

  it.each(ADRESY.filter(([adres]) => !adres.startsWith("/logowanie")))(
    "%s przy dzisiejszym stanie rejestru (grupa %s włączona): dawna stopka się chowa",
    async (adres) => {
      sciezka = adres;
      const PublicFooter = await stopka();
      expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 0, contentinfo: 0 });
    },
    LIMIT_CZASU_MS,
  );

  it("przypadek odwrotny: grupa innego ekranu nie chowa dawnej stopki pod /logowanie", async () => {
    podmienRejestr({ twojeKonto: true, aktywacjaKonta: true });
    sciezka = "/logowanie";
    const PublicFooter = await stopka();
    expect(await policzStopki(async () => <PublicFooter />)).toEqual({ footer: 1, contentinfo: 1 });
  });
});

/**
 * Strona i dawna stopka złożone tak jak w układzie głównym (`{children}` i zaraz po nim
 * `<PublicFooter />`). Ekrany bez żądań przy wejściu: wygasły dostęp, deklaracja, konto zablokowane.
 */
const STRONY: Array<[string, KluczGrupy, () => Promise<{ default: () => React.ReactElement }>, number]> = [
  ["/dostep-wygasl", "dostepWygasl", () => import("@/app/dostep-wygasl/page"), 1],
  ["/logowanie/zablokowane", "logowanie", () => import("@/app/logowanie/zablokowane/page"), 1],
];

describe("strona z układem głównym: liczba stopek", () => {
  it("układ główny dokłada dawną stopkę zaraz po treści strony", () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app", "layout.tsx"), "utf-8");
    expect(zrodlo).toMatch(/\{children\}\s*<PublicFooter \/>/);
  });

  it.each(STRONY)(
    "%s przy włączonej grupie %s: dokładnie jedna stopka (ze stopki szablonu nowego frontu)",
    async (adres, klucz, strona) => {
      podmienRejestr({ [klucz]: true });
      sciezka = adres;
      const { default: Strona } = await strona();
      const PublicFooter = await stopka();
      const liczby = await policzStopki(async () => (
        <>
          {Strona()}
          <PublicFooter />
        </>
      ));
      expect(liczby).toEqual({ footer: 1, contentinfo: 1 });
    },
    LIMIT_CZASU_MS,
  );

  it.each(STRONY)(
    "%s przy wyłączonej grupie %s: liczba stopek jak dotąd",
    async (adres, _klucz, strona, dotad) => {
      podmienRejestr({});
      sciezka = adres;
      const { default: Strona } = await strona();
      const PublicFooter = await stopka();
      const liczby = await policzStopki(async () => (
        <>
          {Strona()}
          <PublicFooter />
        </>
      ));
      expect(liczby).toEqual({ footer: dotad, contentinfo: dotad });
    },
    LIMIT_CZASU_MS,
  );
});
