"use client";

import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { Lekcja } from "@/nowy-front/lekcja/Lekcja";

/**
 * Ekran lekcji nowego frontu pod trasą produktu `/panel/lekcje/[id]`. Układ
 * panelu uczestnika (`PanelShell`) niesie jedyny `main` pod `id="tresc"`, więc
 * ekran jest owinięty w `DostawcaPowloki` — szablon lekcji renderuje wtedy
 * `div`, nie drugi `main`. Tokeny nowego frontu ładuje ten plik (jak układ
 * grupy tras `(przelaczenie)`); `app/globals.css` zostaje nietknięty.
 */
export default function LekcjaNowyEkran({ id }: { id: string }) {
  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <Lekcja id={id} />
      </DostawcaPowloki>
    </div>
  );
}
