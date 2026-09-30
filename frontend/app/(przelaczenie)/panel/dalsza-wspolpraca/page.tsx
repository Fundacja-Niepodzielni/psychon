import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { PoProgramieWspolpraca } from "@/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca";

/**
 * Trasa produktu `/panel/dalsza-wspolpraca` — nowa trasa grupy przełączenia
 * `wspolpraca` (`lib/przelaczenie/grupy.ts`), ekran uczestnika. Ekran sam
 * (`PoProgramieWspolpraca.tsx`, `frontend/nowy-front/po-programie-wspolpraca/`)
 * jest niezmieniony wobec trasy poligonu; odmowę roli pokazuje jego własny
 * stan „Brak dostępu” (odpowiedź 403 z zaplecza), a brak sesji obsługuje
 * klient API. Dopóki grupa jest wyłączona, adres odpowiada jak na bazie (404).
 */
export default function StronaDalszaWspolpraca() {
  if (!czyNowaTrasaDostepna(GRUPY.wspolpraca)) notFound();

  return <PoProgramieWspolpraca />;
}
