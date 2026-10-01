import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { KursyAdministracji } from "@/nowy-front/kursy-administracji/KursyAdministracji";
import StaraTresc from "./StaraTresc";

/**
 * Tytuł karty przy włączonej grupie = nagłówek ekranu („Kursy”). Przy wyłączonej —
 * brak własnego tytułu, jak dotąd (tytuł z korzenia).
 */
export const metadata: Metadata = GRUPY.kursyAdministracji.wlaczona ? { title: "Kursy — Niepodzielni" } : {};

/**
 * Trasa `/admin/kursy` — lista kursów administracji (H08). Adres się nie zmienia:
 * strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `kursyAdministracji`). Grupa wyłączona → dotychczasowa treść (`StaraTresc.tsx`,
 * przeniesiona bez zmiany); grupa włączona → ekran „Kursy” nowego frontu
 * (`frontend/nowy-front/kursy-administracji/`) w powłoce panelu administracji.
 * Szczegół kursu (`/admin/kursy/[id]`) zostaje dotychczasowym ekranem.
 */
export default function AdminCoursesPage() {
  if (!GRUPY.kursyAdministracji.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <KursyAdministracji />
      </DostawcaPowloki>
    </div>
  );
}
