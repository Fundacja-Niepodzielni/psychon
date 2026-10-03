import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { PowlokaProwadzacego } from "./PowlokaProwadzacego";

/**
 * Układ segmentu `/prowadzacy` w grupie tras `(przelaczenie)` — nowa ramka
 * panelu prowadzącego z makiety (`PowlokaProwadzacego`: menu boczne, górny
 * pasek, link skoku, jedyny `main` pod `id="tresc"`) wokół ekranu nowego
 * frontu, wewnątrz tego samego strażnika ról co stary układ prowadzącego
 * (`instructor`). Dziś niesie jedną stronę: lekcję kursu
 * (`kursy/[id]/lekcje/[idLekcji]`). `DostawcaPowloki` mówi szablonowi
 * ekranu, że `main` niesie już powłoka.
 */
export default function UkladProwadzacego({ children }: { children: ReactNode }) {
  return (
    <RequireRole allowedRoles={["instructor"]}>
      <PowlokaProwadzacego>
        <DostawcaPowloki>{children}</DostawcaPowloki>
      </PowlokaProwadzacego>
    </RequireRole>
  );
}
