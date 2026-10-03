"use client";

import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { DziennikStazu } from "@/nowy-front/dziennik-stazu/DziennikStazu";

/**
 * Dziennik stażu nowego frontu pod trasą produktu `/panel/staz`. Układ panelu
 * uczestnika (nowa ramka) niesie jedyny `main` pod `id="tresc"`, więc ekran
 * jest owinięty w `DostawcaPowloki` — szablon listy renderuje wtedy `div`,
 * nie drugi `main`. Tokeny nowego frontu ładuje ten plik, tak jak pulpit
 * uczestnika; `app/globals.css` zostaje nietknięty. Bramkę roli
 * (wyłącznie wolontariusz) niesie `layout.tsx` tego katalogu.
 */
export default function StazNowyEkran() {
  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <DziennikStazu />
      </DostawcaPowloki>
    </div>
  );
}
