import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

/**
 * Strona kursu prowadzącego pod zwykłym adresem i strona lekcji pod adresem
 * z kursem w ścieżce wobec rejestru przełączenia (grupa `kurs`): flaga grupy
 * jest tu podmieniona, a ekrany — zastąpione znacznikami, więc próba mierzy
 * wyłącznie to, którą treść strona wybiera.
 */

const przelacznik = vi.hoisted(() => ({ wlaczona: false }));

vi.mock("@/lib/przelaczenie/grupy", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/przelaczenie/grupy")>();
  return {
    ...oryginal,
    GRUPY: {
      ...oryginal.GRUPY,
      get kurs() {
        return { ...oryginal.GRUPY.kurs, wlaczona: przelacznik.wlaczona };
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("../StaraTresc", () => ({ default: function StaraTresc() { return null; } }));
vi.mock("../EkranKursuZAdresu", () => ({ EkranKursuZAdresu: function EkranKursuZAdresu() { return null; } }));
vi.mock("@/nowy-front/lekcja-edycja/LekcjaEdycja", () => ({ LekcjaEdycja: function LekcjaEdycja() { return null; } }));
vi.mock("@/design-system/tokeny/tokeny.css", () => ({}));

const { default: StronaKursu } = await import("../page");
const { default: StronaLekcji } = await import("../../../../../(przelaczenie)/prowadzacy/kursy/[id]/lekcje/[idLekcji]/page");
const { default: StaraTresc } = await import("../StaraTresc");
const { EkranKursuZAdresu } = await import("../EkranKursuZAdresu");
const { LekcjaEdycja } = await import("@/nowy-front/lekcja-edycja/LekcjaEdycja");
const { DostawcaPowloki } = await import("@/design-system/szablony/KontekstPowloki");

type Element = ReactElement<{ children?: unknown; params?: unknown; [klucz: string]: unknown }>;

function dzieckoJedyne(element: Element): Element {
  const dziecko = element.props.children;
  expect(isValidElement(dziecko)).toBe(true);
  return dziecko as Element;
}

beforeEach(() => {
  przelacznik.wlaczona = false;
});

describe("kurs prowadzącego pod zwykłym adresem", () => {
  it("grupa wyłączona: dotychczasowa treść z tym samym `params`", () => {
    const params = Promise.resolve({ id: "4" });
    const wynik = StronaKursu({ params }) as Element;

    expect(wynik.type).toBe(StaraTresc);
    expect(wynik.props.params).toBe(params);
  });

  it("grupa włączona: wspólny ekran kursu w powłoce panelu, jasny motyw", () => {
    przelacznik.wlaczona = true;
    const params = Promise.resolve({ id: "4" });
    const wynik = StronaKursu({ params }) as Element;

    expect(wynik.type).toBe("div");
    expect(wynik.props["data-theme"]).toBe("light");
    const powloka = dzieckoJedyne(wynik);
    expect(powloka.type).toBe(DostawcaPowloki);
    const ekran = dzieckoJedyne(powloka);
    expect(ekran.type).toBe(EkranKursuZAdresu);
    expect(ekran.props.params).toBe(params);
  });
});

describe("strona lekcji prowadzącego pod adresem z kursem", () => {
  it("grupa wyłączona: 404", async () => {
    await expect(StronaLekcji({ params: Promise.resolve({ id: "4", idLekcji: "21" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("grupa włączona: strona lekcji w roli prowadzącego z liczbami z adresu i nazwą kursu", async () => {
    przelacznik.wlaczona = true;
    const wynik = (await StronaLekcji({ params: Promise.resolve({ id: "4", idLekcji: "21" }) })) as Element;

    expect(wynik.type).toBe(LekcjaEdycja);
    expect(wynik.props).toEqual({ rola: "instructor", idLekcji: 21, idKursu: 4, zNazwaKursu: true });
  });

  it("identyfikator spoza liczb: `null`, ekran pokaże „nie znaleziono”", async () => {
    przelacznik.wlaczona = true;
    const wynik = (await StronaLekcji({ params: Promise.resolve({ id: "4", idLekcji: "abc" }) })) as Element;

    expect(wynik.props.idLekcji).toBeNull();
  });
});
