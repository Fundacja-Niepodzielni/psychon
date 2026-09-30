import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { ProfilDecyzja } from "@/nowy-front/profil-decyzja/ProfilDecyzja";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/profile/[id]` — decyzja o wniosku o profil psychologa (H15).
 * Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `decyzjaProfilu`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany; komponent
 * kliencki odpakowuje `params` przez `use()`); grupa włączona → ekran nowego
 * frontu w powłoce panelu administracji. `params` to Promise (Next.js 16).
 * Strona starej wersji nie miała własnego tytułu karty, więc nowa też nie ma.
 */
export default async function StronaWniosku({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!GRUPY.decyzjaProfilu.wlaczona) return <StaraTresc params={Promise.resolve({ id })} />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <ProfilDecyzja id={id} />
      </DostawcaPowloki>
    </div>
  );
}
