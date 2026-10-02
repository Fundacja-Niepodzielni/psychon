import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { NowaOsoba } from "@/nowy-front/nowa-osoba/NowaOsoba";
import StaraTresc from "./StaraTresc";

/** Tytuł karty tylko przy włączonej grupie; przy wyłączonej jak dotąd (bez własnego tytułu). */
export const metadata: Metadata = GRUPY.noweKonto.wlaczona ? { title: "Nowa osoba — Niepodzielni" } : {};

/**
 * Trasa `/admin/uczestniczki/nowa` — zakładanie konta poza rekrutacją (H18).
 * Strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `noweKonto`). Grupa wyłączona → adres zachowuje się jak dotąd
 * (`StaraTresc.tsx`); grupa włączona → ekran „Nowa osoba” nowego frontu
 * w powłoce panelu administracji.
 */
export default function AdminNewUserPage() {
  if (!GRUPY.noweKonto.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <NowaOsoba />
      </DostawcaPowloki>
    </div>
  );
}
