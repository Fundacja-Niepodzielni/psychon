import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { CertyfikatyLista } from "@/nowy-front/certyfikaty-lista/CertyfikatyLista";
import StaraTresc from "./StaraTresc";

/**
 * Tytuł karty przy włączonej grupie = nazwa pozycji menu = nagłówek ekranu.
 * Przy wyłączonej — brak własnego tytułu, jak dotąd (tytuł z korzenia).
 */
export const metadata: Metadata = GRUPY.certyfikaty.wlaczona ? { title: "Certyfikaty — Niepodzielni" } : {};

/**
 * Trasa `/admin/certyfikaty` — lista wydanych certyfikatów i ich unieważnianie
 * (H13). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `certyfikaty`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa
 * włączona → ekran nowego frontu w powłoce panelu administracji. Strona starej
 * wersji nie miała własnego tytułu karty i przy wyłączonej grupie dalej go nie ma.
 */
export default function StronaCertyfikatowAdministracji() {
  if (!GRUPY.certyfikaty.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <CertyfikatyLista />
      </DostawcaPowloki>
    </div>
  );
}
