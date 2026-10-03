"use client";

import "@/design-system/tokeny/tokeny.css";
import { use } from "react";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { TestUczestnikaZAdresu } from "@/nowy-front/test-uczestnika/TestUczestnikaZAdresu";

/**
 * Ekran testu końcowego uczestnika nowego frontu pod trasą produktu
 * `/panel/kursy/[slug]/test`. Układ panelu uczestnika niesie jedyny `main` pod
 * `id="tresc"`, więc ekran jest owinięty w `DostawcaPowloki` — korzeń ekranu
 * renderuje wtedy `div`, nie drugi `main`. Tokeny nowego frontu ładuje ten
 * plik; `app/globals.css` zostaje nietknięty.
 */
export default function TestNowyEkran({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <TestUczestnikaZAdresu slug={slug} />
      </DostawcaPowloki>
    </div>
  );
}
