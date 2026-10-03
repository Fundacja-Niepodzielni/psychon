import { readFileSync } from "node:fs";
import path from "node:path";
import { Suspense, type ComponentType, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KluczGrupy } from "@/lib/przelaczenie/grupy";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Dwanaście stron pod tymi samymi adresami co dziś czyta rejestr przełączenia
 * (siedem grup: `logowanie`, `aktywacjaKonta`, `dostepWygasl`, `twojeKonto`,
 * `certyfikatPubliczny`, `dokumentyPubliczne`, `zacznijTutaj`). Grupa wyłączona →
 * strona zwraca dotychczasową treść (`StaraTresc.tsx`, przeniesioną bez zmiany);
 * grupa włączona → ekran nowego frontu (`NowyEkran.tsx`) w jasnym motywie, ze
 * znakiem Fundacji na stronach publicznych i w `DostawcaPowloki` pod ramką panelu
 * uczestnika. Plik strony nie importuje niczego z `components/`.
 */

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** Pierwszy import strony z zimną pamięcią podręczną transformacji przekracza domyślne 5 s. */
const LIMIT_CZASU_MS = 30_000;

type Modul = { default: ComponentType<never> | ((argumenty: never) => unknown) };

interface Trasa {
  adres: string;
  klucz: KluczGrupy;
  /** Katalog strony względem `frontend/app/`. */
  katalog: string;
  strona: () => Promise<Modul>;
  stara: () => Promise<Modul>;
  nowy: () => Promise<Modul>;
  /** Ekran nowego frontu, który `NowyEkran` ma pokazać. */
  ekran: () => Promise<unknown>;
  /** Strona z parametrem z adresu (`params`); reszta stron nie dostaje argumentów. */
  zParametrem?: boolean;
  /** Ekran pod ramką panelu (owinięty w `DostawcaPowloki`, bez znaku Fundacji). */
  wRamcePanelu?: boolean;
}

const TRASY: Trasa[] = [
  {
    adres: "/logowanie",
    klucz: "logowanie",
    katalog: "logowanie",
    strona: () => import("@/app/logowanie/page"),
    stara: () => import("@/app/logowanie/StaraTresc"),
    nowy: () => import("@/app/logowanie/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/logowanie/Logowanie")).Logowanie,
  },
  {
    adres: "/logowanie/konta",
    klucz: "logowanie",
    katalog: "logowanie/konta",
    strona: () => import("@/app/logowanie/konta/page"),
    stara: () => import("@/app/logowanie/konta/StaraTresc"),
    nowy: () => import("@/app/logowanie/konta/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/logowanie/PrzekierowanieKont")).PrzekierowanieKont,
  },
  {
    adres: "/logowanie/niepowiazane",
    klucz: "logowanie",
    katalog: "logowanie/niepowiazane",
    strona: () => import("@/app/logowanie/niepowiazane/page"),
    stara: () => import("@/app/logowanie/niepowiazane/StaraTresc"),
    nowy: () => import("@/app/logowanie/niepowiazane/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/logowanie/Niepowiazane")).Niepowiazane,
  },
  {
    adres: "/logowanie/zablokowane",
    klucz: "logowanie",
    katalog: "logowanie/zablokowane",
    strona: () => import("@/app/logowanie/zablokowane/page"),
    stara: () => import("@/app/logowanie/zablokowane/StaraTresc"),
    nowy: () => import("@/app/logowanie/zablokowane/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/logowanie/Zablokowane")).Zablokowane,
  },
  {
    adres: "/aktywacja",
    klucz: "aktywacjaKonta",
    katalog: "aktywacja",
    strona: () => import("@/app/aktywacja/page"),
    stara: () => import("@/app/aktywacja/StaraTresc"),
    nowy: () => import("@/app/aktywacja/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/aktywacja/Aktywacja")).Aktywacja,
  },
  {
    adres: "/dostep-wygasl",
    klucz: "dostepWygasl",
    katalog: "dostep-wygasl",
    strona: () => import("@/app/dostep-wygasl/page"),
    stara: () => import("@/app/dostep-wygasl/StaraTresc"),
    nowy: () => import("@/app/dostep-wygasl/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/dostep-wygasl/DostepWygasl")).DostepWygasl,
  },
  {
    adres: "/konto",
    klucz: "twojeKonto",
    katalog: "konto",
    strona: () => import("@/app/konto/page"),
    stara: () => import("@/app/konto/StaraTresc"),
    nowy: () => import("@/app/konto/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/konto/Konto")).Konto,
  },
  {
    adres: "/weryfikacja",
    klucz: "certyfikatPubliczny",
    katalog: "weryfikacja",
    strona: () => import("@/app/weryfikacja/page"),
    stara: () => import("@/app/weryfikacja/StaraTresc"),
    nowy: () => import("@/app/weryfikacja/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/certyfikat-publiczny/Weryfikacja")).Weryfikacja,
  },
  {
    adres: "/certyfikat",
    klucz: "certyfikatPubliczny",
    katalog: "certyfikat",
    strona: () => import("@/app/certyfikat/page"),
    stara: () => import("@/app/certyfikat/StaraTresc"),
    nowy: () => import("@/app/certyfikat/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/certyfikat-publiczny/CertyfikatPubliczny")).CertyfikatPubliczny,
  },
  {
    adres: "/deklaracja-dostepnosci",
    klucz: "dokumentyPubliczne",
    katalog: "deklaracja-dostepnosci",
    strona: () => import("@/app/deklaracja-dostepnosci/page"),
    stara: () => import("@/app/deklaracja-dostepnosci/StaraTresc"),
    nowy: () => import("@/app/deklaracja-dostepnosci/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/dokumenty-publiczne/DeklaracjaDostepnosci")).DeklaracjaDostepnosci,
  },
  {
    adres: "/dokumenty-prawne/[typ]",
    klucz: "dokumentyPubliczne",
    katalog: "dokumenty-prawne/[typ]",
    strona: () => import("@/app/dokumenty-prawne/[typ]/page"),
    stara: () => import("@/app/dokumenty-prawne/[typ]/StaraTresc"),
    nowy: () => import("@/app/dokumenty-prawne/[typ]/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/dokumenty-publiczne/DokumentPrawny")).DokumentPrawny,
    zParametrem: true,
  },
  {
    adres: "/panel/start",
    klucz: "zacznijTutaj",
    katalog: "(uczestnik)/panel/start",
    strona: () => import("@/app/(uczestnik)/panel/start/page"),
    stara: () => import("@/app/(uczestnik)/panel/start/StaraTresc"),
    nowy: () => import("@/app/(uczestnik)/panel/start/NowyEkran"),
    ekran: async () => (await import("@/nowy-front/zacznij-tutaj/ZacznijTutaj")).ZacznijTutaj,
    wRamcePanelu: true,
  },
];

interface Element {
  type: unknown;
  props: Record<string, unknown> & { children?: Element };
}

function argumenty(trasa: Trasa): Record<string, unknown> {
  return trasa.zParametrem ? { params: Promise.resolve({ typ: "regulamin" }) } : {};
}

async function wywolajStrone(trasa: Trasa, wejscie: Record<string, unknown>): Promise<Element> {
  const { default: Strona } = await trasa.strona();
  return (Strona as (a: unknown) => unknown)(wejscie) as Element;
}

afterEach(() => {
  przywrocRejestr();
});

describe.each(TRASY)("trasa $adres a rejestr przełączenia (grupa $klucz)", (trasa) => {
  it(
    "grupa wyłączona: strona zwraca dotychczasową treść z tymi samymi argumentami",
    async () => {
      podmienRejestr({});
      const wejscie = argumenty(trasa);
      const element = await wywolajStrone(trasa, wejscie);
      const { default: StaraTresc } = await trasa.stara();
      const { default: NowyEkran } = await trasa.nowy();
      expect(element.type).toBe(StaraTresc);
      expect(element.type).not.toBe(NowyEkran);
      expect(element.props).toEqual(wejscie);
      if (trasa.zParametrem) expect(element.props.params).toBe(wejscie.params);
    },
    LIMIT_CZASU_MS,
  );

  it(
    "grupa włączona: strona zwraca ekran nowego frontu z tymi samymi argumentami",
    async () => {
      podmienRejestr({ [trasa.klucz]: true });
      const wejscie = argumenty(trasa);
      const element = await wywolajStrone(trasa, wejscie);
      const { default: StaraTresc } = await trasa.stara();
      const { default: NowyEkran } = await trasa.nowy();
      expect(element.type).toBe(NowyEkran);
      expect(element.type).not.toBe(StaraTresc);
      expect(element.props).toEqual(wejscie);
      if (trasa.zParametrem) expect(element.props.params).toBe(wejscie.params);
    },
    LIMIT_CZASU_MS,
  );

  it(
    "przypadek odwrotny: włączona inna grupa nie zmienia tej strony",
    async () => {
      const inna: KluczGrupy = trasa.klucz === "logowanie" ? "twojeKonto" : "logowanie";
      podmienRejestr({ [inna]: true });
      const element = await wywolajStrone(trasa, argumenty(trasa));
      const { default: StaraTresc } = await trasa.stara();
      expect(element.type).toBe(StaraTresc);
    },
    LIMIT_CZASU_MS,
  );

  it("plik strony nie importuje niczego z warstwy components/", () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app", ...trasa.katalog.split("/"), "page.tsx"), "utf-8");
    expect(zrodlo.split(/\r?\n/).filter((linia) => /^\s*import\b.*from\s+["']@\/components\//.test(linia))).toEqual([]);
  });
});

describe.each(TRASY.filter((trasa) => !trasa.zParametrem))("ekran nowego frontu pod $adres", (trasa) => {
  it(
    "jasny motyw i właściwy ekran: znak Fundacji na stronie publicznej, DostawcaPowloki pod ramką panelu",
    async () => {
      const { default: NowyEkran } = await trasa.nowy();
      const Ekran = await trasa.ekran();
      const element = (NowyEkran as () => Element)();
      expect(element.type).toBe("div");
      expect(element.props["data-theme"]).toBe("light");
      const dziecko = element.props.children as Element;
      if (trasa.wRamcePanelu) {
        const { DostawcaPowloki } = await import("@/design-system/szablony/KontekstPowloki");
        expect(dziecko.type).toBe(DostawcaPowloki);
        expect((dziecko.props.children as Element).type).toBe(Ekran);
        return;
      }
      const { default: Logo } = await import("@/components/ui/Logo");
      expect(dziecko.type).toBe(Ekran);
      const logo = dziecko.props.logo as Element;
      expect(logo.type).toBe(Logo);
      expect(logo.props.title).toBe("Fundacja Niepodzielni");
    },
    LIMIT_CZASU_MS,
  );
});

async function wyrenderuj(element: ReactElement) {
  const { act, render } = await import("@testing-library/react");
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Suspense fallback={null}>{element}</Suspense>);
  });
  const html = wynik!.container.innerHTML;
  const kontener = wynik!.container;
  return { html, kontener, odmontuj: () => wynik!.unmount() };
}

describe("ekrany bez żądań: DOM przy grupie wyłączonej to bit w bit dawna treść", () => {
  it.each(TRASY.filter((trasa) => trasa.adres === "/dostep-wygasl" || trasa.adres === "/deklaracja-dostepnosci"))(
    "$adres",
    async (trasa) => {
      podmienRejestr({});
      const { default: StaraTresc } = await trasa.stara();
      const Stara = StaraTresc as ComponentType;
      const strona = await wyrenderuj((await wywolajStrone(trasa, {})) as unknown as ReactElement);
      strona.odmontuj();
      const stara = await wyrenderuj(<Stara />);
      stara.odmontuj();
      expect(strona.html).toBe(stara.html);
      expect(strona.html).not.toContain('data-theme="light"');
    },
    LIMIT_CZASU_MS,
  );
});

describe("dokument prawny w nowym wyglądzie: rodzaj z adresu", () => {
  it(
    "nieznany rodzaj z adresu: ekran „nie znaleziono” bez żądania, jasny motyw, jeden main i znak Fundacji",
    async () => {
      podmienRejestr({ dokumentyPubliczne: true });
      const oryginal = globalThis.fetch;
      const zadania = vi.fn();
      globalThis.fetch = zadania as unknown as typeof fetch;
      try {
        const trasa = TRASY.find((t) => t.zParametrem)!;
        const element = await wywolajStrone(trasa, { params: Promise.resolve({ typ: "nie-ma-takiego" }) });
        const { kontener, odmontuj } = await wyrenderuj(element as unknown as ReactElement);
        const { screen } = await import("@testing-library/react");
        await screen.findByRole("heading", { level: 1 });
        expect(kontener.querySelector('[data-theme="light"]')).not.toBeNull();
        expect(kontener.querySelectorAll("main#tresc")).toHaveLength(1);
        expect(screen.getByRole("img", { name: "Fundacja Niepodzielni" })).toBeTruthy();
        expect(zadania).not.toHaveBeenCalled();
        odmontuj();
      } finally {
        globalThis.fetch = oryginal;
      }
    },
    LIMIT_CZASU_MS,
  );
});
