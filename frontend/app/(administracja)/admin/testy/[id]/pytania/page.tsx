import type { Metadata } from "next";
import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { PytaniaTestu } from "@/nowy-front/pytania-testu/PytaniaTestu";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/testy/[id]/pytania` — pytania testu końcowego w administracji
 * (H10). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `pytaniaTestu`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany: bank pytań
 * starego frontu, 404 przy złym numerze testu); grupa włączona → ekran
 * „Pytania testu” nowego frontu w powłoce panelu administracji. `id` to numer
 * testu; opcjonalny parametr `kurs` (dopisuje go ekran kursu) prowadzi okruszek
 * z powrotem do kursu. `params` i `searchParams` to Promise (Next.js 16).
 */
export const metadata: Metadata = {
  title: GRUPY.pytaniaTestu.wlaczona ? "Pytania testu — Niepodzielni" : "Bank pytań — Niepodzielni",
};

export default async function StronaPytanTestu({
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
        <PytaniaTestu idTestu={id} panel="administracja" idKursu={typeof kurs === "string" ? kurs : null} />
      </DostawcaPowloki>
    </div>
  );
}
