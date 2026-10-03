import type { Metadata } from "next";
import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { PytaniaTestu } from "@/nowy-front/pytania-testu/PytaniaTestu";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/prowadzacy/testy/[id]/pytania` — pytania testu końcowego w panelu
 * prowadzącego (H10). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `pytaniaTestu`, ta sama flaga co
 * w administracji). Grupa wyłączona → dotychczasowa treść (`StaraTresc.tsx`,
 * przeniesiona bez zmiany); grupa włączona → ten sam ekran „Pytania testu” co
 * w administracji, w powłoce panelu prowadzącego, na trasach prowadzącego
 * (`/instructor/…`): prowadzący układa pytania testu swojego kursu, a test
 * obcego kursu widzi jako „Nie znaleziono testu”. `id` to numer testu; opcjonalny parametr
 * `kurs` prowadzi okruszek z powrotem do kursu. `params` i `searchParams`
 * to Promise (Next.js 16).
 */
export const metadata: Metadata = {
  title: GRUPY.pytaniaTestu.wlaczona
    ? "Pytania testu — Panel prowadzącego — Niepodzielni"
    : "Bank pytań — Panel prowadzącego — Niepodzielni",
};

export default async function StronaPytanTestuProwadzacego({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ kurs?: string | string[] }>;
}) {
  const { id } = await params;

  if (!GRUPY.pytaniaTestu.wlaczona) return <StaraTresc params={Promise.resolve({ id })} />;

  const { kurs } = (await searchParams) ?? {};

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <PytaniaTestu idTestu={id} panel="prowadzacy" idKursu={typeof kurs === "string" ? kurs : null} />
      </DostawcaPowloki>
    </div>
  );
}
