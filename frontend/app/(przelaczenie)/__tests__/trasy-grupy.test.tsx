import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Nowe trasy produktu w grupie tras `(przelaczenie)`: przy wyłączonej grupie
 * adres odpowiada jak na bazie (404), po włączeniu strona osadza ekran
 * nowego frontu bez żadnego opakowania w pliku strony. Powłokę panelu
 * (menu, nagłówek) niesie układ segmentu `panel/` albo `admin/`.
 */

type Blad = Error & { digest?: string };

function przechwycRzucony(funkcja: () => unknown): Blad | null {
  try {
    funkcja();
    return null;
  } catch (blad) {
    return blad as Blad;
  }
}

const TRASY = [
  {
    nazwa: "/panel/dalsza-wspolpraca",
    grupa: "wspolpraca",
    zaladuj: () => import("../panel/dalsza-wspolpraca/page"),
    plik: "panel/dalsza-wspolpraca/page.tsx",
    ekran: () => import("@/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca").then((m) => m.PoProgramieWspolpraca),
  },
  {
    nazwa: "/admin/zgloszenia-wspolpracy",
    grupa: "wspolpraca",
    zaladuj: () => import("../admin/zgloszenia-wspolpracy/page"),
    plik: "admin/zgloszenia-wspolpracy/page.tsx",
    ekran: () => import("@/nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy").then((m) => m.ZgloszeniaWspolpracy),
  },
  {
    nazwa: "/admin/formy-stazu",
    grupa: "formyStazu",
    zaladuj: () => import("../admin/formy-stazu/page"),
    plik: "admin/formy-stazu/page.tsx",
    ekran: () => import("@/nowy-front/formy-stazu/FormyStazu").then((m) => m.FormyStazu),
  },
] as const;

afterEach(() => {
  przywrocRejestr();
});

describe.each(TRASY)("nowa trasa produktu $nazwa", ({ zaladuj, ekran, plik, grupa }) => {
  it("grupa wyłączona: adres kończy się notFound() jak na bazie", async () => {
    podmienRejestr({});
    const { default: Strona } = await zaladuj();

    const rzucony = przechwycRzucony(() => Strona());

    expect(rzucony?.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("grupa włączona: strona zwraca sam ekran nowego frontu i nic nie rzuca", async () => {
    podmienRejestr({ [grupa]: true });
    const { default: Strona } = await zaladuj();
    const Ekran = await ekran();

    let element: unknown;
    const rzucony = przechwycRzucony(() => {
      element = Strona();
    });

    expect(rzucony).toBeNull();
    expect((element as { type: unknown }).type).toBe(Ekran);
  });

  it("plik strony nie importuje niczego z warstwy components/", () => {
    const zrodlo = readFileSync(path.join(process.cwd(), "app", "(przelaczenie)", plik), "utf-8");
    expect(importujeZComponents(zrodlo)).toBe(false);
  });
});

function importujeZComponents(zrodlo: string): boolean {
  return zrodlo.split(/\r?\n/).some((linia) => /^\s*import\b.*from\s+["']@\/components\//.test(linia));
}

describe("wykrywacz importów z warstwy components/", () => {
  it("przypadek odwrotny: rozpoznaje import z components/ i pomija komentarz", () => {
    expect(importujeZComponents('import X from "@/components/permissions/RequireRole";\n')).toBe(true);
    expect(importujeZComponents('// import X from "@/components/x";\n')).toBe(false);
    expect(importujeZComponents('import { Y } from "@/nowy-front/y/Y";\n')).toBe(false);
  });
});

describe("strona /admin/formy-stazu — tytuł i brak starej trasy", () => {
  it("niesie tytuł w tej samej formie co pozostałe strony administracji", async () => {
    podmienRejestr({ formyStazu: true });
    const modul = await import("../admin/formy-stazu/page");
    expect(modul.metadata).toEqual({ title: "Formy stażu — Niepodzielni" });
  });

  it("grupa nie ma starej trasy: czyStaraTrasaPrzekierowuje jest fałszem także po włączeniu", async () => {
    const { czyStaraTrasaPrzekierowuje, GRUPY } = await import("@/lib/przelaczenie/grupy");
    expect(GRUPY.formyStazu.ekrany[0].staraTrasa).toBeNull();
    expect(czyStaraTrasaPrzekierowuje({ ...GRUPY.formyStazu, wlaczona: true }, "administracja")).toBe(false);
  });
});
