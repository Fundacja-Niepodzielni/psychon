"use client";

import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { Pulpit } from "@/nowy-front/pulpit/Pulpit";

/**
 * Pulpit nowego frontu pod trasą produktu `/panel/pulpit`. Układ panelu
 * uczestnika (`PanelShell`) niesie jedyny `main` pod `id="tresc"`, więc ekran
 * jest owinięty w `DostawcaPowloki` — szablon pulpitu renderuje wtedy `div`,
 * nie drugi `main`. Tokeny nowego frontu ładuje ten plik, tak jak układ grupy
 * tras `(przelaczenie)` robi to dla nowych tras produktu; `app/globals.css`
 * zostaje nietknięty.
 */
export default function PulpitNowyEkran() {
  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <Pulpit />
      </DostawcaPowloki>
    </div>
  );
}
