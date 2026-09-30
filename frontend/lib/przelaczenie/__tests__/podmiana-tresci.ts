import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import type { KluczGrupy } from "@/lib/przelaczenie/grupy";
import { podmienRejestr, przywrocRejestr } from "./podmien-rejestr";

/**
 * Wspólny zestaw sprawdzeń dla grup przełączenia rodzaju „podmiana treści”
 * (stara i nowa trasa mają ten sam adres): strona pod starym adresem czyta
 * rejestr i przy wyłączonej grupie zwraca dotychczasową treść
 * (`StaraTresc.tsx`), a przy włączonej — ekran nowego frontu owinięty w
 * `DostawcaPowloki`. Wołać raz na plik testowy strony.
 */

interface OpisPodmiany {
  nazwa: string;
  klucz: KluczGrupy;
  /** Plik `page.tsx` względem `frontend/app/` — do sprawdzenia importów. */
  plikStrony: string;
  /** Argumenty wywołania strony (np. `{ params }` dla trasy z segmentem dynamicznym). */
  argumenty?: Record<string, unknown>;
  zaladujStrone: () => Promise<{ default: (argumenty: never) => unknown }>;
  zaladujStara: () => Promise<{ default: ComponentType<never> }>;
  zaladujNowy: () => Promise<ComponentType<never>>;
}

/** Pierwszy import strony z zimną pamięcią podręczną transformacji przekracza domyślne 5 s. */
const LIMIT_CZASU_MS = 30_000;

interface Element {
  type: unknown;
  props: { children?: { type?: unknown } | null; [klucz: string]: unknown };
}

async function wywolaj(opis: OpisPodmiany): Promise<Element> {
  const { default: Strona } = await opis.zaladujStrone();
  return (await (Strona as (a: unknown) => unknown)(opis.argumenty ?? {})) as Element;
}

export function opiszPodmianeTresci(opis: OpisPodmiany): void {
  describe(`trasa ${opis.nazwa} a rejestr przełączenia (grupa ${opis.klucz})`, () => {
    afterEach(() => {
      przywrocRejestr();
    });

    it("grupa wyłączona: strona zwraca dotychczasową treść (StaraTresc), nie nowy ekran", async () => {
      podmienRejestr({});
      const element = await wywolaj(opis);
      const { default: StaraTresc } = await opis.zaladujStara();
      const Nowy = await opis.zaladujNowy();

      expect(element.type).toBe(StaraTresc);
      expect(element.type).not.toBe(Nowy);
    }, LIMIT_CZASU_MS);

    it("grupa włączona: strona zwraca nowy ekran owinięty w DostawcaPowloki", async () => {
      podmienRejestr({ [opis.klucz]: true });
      const element = await wywolaj(opis);
      const { DostawcaPowloki } = await import("@/design-system/szablony/KontekstPowloki");
      const { default: StaraTresc } = await opis.zaladujStara();
      const Nowy = await opis.zaladujNowy();

      expect(element.type).toBe(DostawcaPowloki);
      expect(element.type).not.toBe(StaraTresc);
      expect(element.props.children?.type).toBe(Nowy);
    }, LIMIT_CZASU_MS);

    it("przypadek odwrotny: włączona inna grupa nie zmienia tej strony", async () => {
      const inna: KluczGrupy = opis.klucz === "wspolpraca" ? "formyStazu" : "wspolpraca";
      podmienRejestr({ [inna]: true });
      const element = await wywolaj(opis);
      const { default: StaraTresc } = await opis.zaladujStara();

      expect(element.type).toBe(StaraTresc);
    }, LIMIT_CZASU_MS);

    it("plik strony nie importuje niczego z warstwy components/", () => {
      const zrodlo = readFileSync(path.join(process.cwd(), "app", opis.plikStrony), "utf-8");
      const importy = zrodlo
        .split(/\r?\n/)
        .filter((linia) => /^\s*import\b.*from\s+["']@\/components\//.test(linia));
      expect(importy).toEqual([]);
    });
  });
}
