import type { ReactNode } from "react";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { PowlokaUczestnika } from "./PowlokaUczestnika";

/**
 * Układ segmentu `/panel` w grupie tras `(przelaczenie)` — nowa ramka panelu
 * uczestnika z makiety 2.0.4 (`PowlokaUczestnika`: menu boczne filtrowane
 * rolą z `/me`, górny pasek, link skoku, jedyny `main` pod `id="tresc"`)
 * wokół ekranu nowego frontu. `DostawcaPowloki` mówi szablonowi ekranu, że
 * `main` niesie już powłoka, więc szablon renderuje zwykły `div`.
 *
 * Menu jest filtrowane rolą z `/me` tak samo jak w starym układzie panelu:
 * wpisy dopuszczone tylko dla części ról (np. superwizja — wyłącznie
 * `volunteer`) są ukryte, dopóki `/me` nie odpowie (fail closed). Serwer
 * odmawia im i tak — to tylko chowa odnośnik.
 */
export default function UkladPanelu({ children }: { children: ReactNode }) {
  return (
    <PowlokaUczestnika>
      <DostawcaPowloki>{children}</DostawcaPowloki>
    </PowlokaUczestnika>
  );
}
