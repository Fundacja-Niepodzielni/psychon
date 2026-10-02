import { Suspense } from "react";
import { DziennikDzialanZAdresu } from "@/nowy-front/dziennik-dzialan/DziennikDzialanZAdresu";

/**
 * Trasa `/nowy-front/admin/dziennik` — ekran „Dziennik działań” (H20,
 * `AuditController`) w nowym wyglądzie. Odczyt i pobranie pliku biegną
 * z przeglądarki (`nowy-front/dziennik-dzialan/dane.ts`). Parametr
 * `?dotyczy=<id>` czyta `DziennikDzialanZAdresu`; granica `Suspense` jest
 * wymagana przez odczyt parametrów adresu na stronie statycznej.
 */
export default function StronaDziennikaDzialan() {
  return (
    <Suspense fallback={null}>
      <DziennikDzialanZAdresu />
    </Suspense>
  );
}
