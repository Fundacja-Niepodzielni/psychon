"use client";

import "@/design-system/tokeny/tokeny.css";
import { use } from "react";
import Logo from "@/components/ui/Logo";
import { DokumentPrawny } from "@/nowy-front/dokumenty-publiczne/DokumentPrawny";

/**
 * Ekran nowego frontu pod trasą produktu `/dokumenty-prawne/[typ]` — rodzaj dokumentu z adresu
 * (`params` jako obietnica, rozpakowana `use()` jak w dawnej stronie). Szablon strony publicznej
 * niesie jedyny `main` pod `id="tresc"` i własną stopkę; dawna stopka układu głównego chowa się
 * pod tym adresem przy włączonej grupie. Znak Fundacji i tokeny nowego frontu ładuje ten plik.
 */
export default function DokumentPrawnyNowyEkran({ params }: { params: Promise<{ typ: string }> }) {
  const { typ } = use(params);
  return (
    <div data-theme="light">
      <DokumentPrawny typ={typ} logo={<Logo title="Fundacja Niepodzielni" />} />
    </div>
  );
}
