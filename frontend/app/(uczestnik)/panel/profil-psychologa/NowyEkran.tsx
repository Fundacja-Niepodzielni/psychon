"use client";

import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { ProfilPsychologa } from "@/nowy-front/profil-psychologa-formularz/ProfilPsychologa";

/**
 * Ekran „Profil psychologa” nowego frontu pod trasą produktu
 * `/panel/profil-psychologa`. Układ panelu uczestnika niesie jedyny `main` pod
 * `id="tresc"`, więc ekran jest owinięty w `DostawcaPowloki` — szablon
 * formularza renderuje wtedy `div`, nie drugi `main`. Tokeny nowego frontu
 * ładuje ten plik; `app/globals.css` zostaje nietknięty.
 */
export default function ProfilPsychologaNowyEkran() {
  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <ProfilPsychologa />
      </DostawcaPowloki>
    </div>
  );
}
