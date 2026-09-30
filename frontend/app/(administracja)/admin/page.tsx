import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { PulpitAdministracji } from "@/nowy-front/pulpit-administracji/PulpitAdministracji";
import AdminHomeStaraTresc from "./StaraTresc";

/**
 * Tytuł karty przy włączonej grupie = nagłówek ekranu („Pulpit
 * administracji”, para ze słownika interfejsu z pozycją menu „Pulpit”).
 * Przy wyłączonej — brak własnego tytułu, jak dotąd (tytuł z korzenia).
 */
export const metadata: Metadata = GRUPY.pulpitAdministracji.wlaczona
  ? { title: "Pulpit administracji — Niepodzielni" }
  : {};

/**
 * Strona startowa administracji `/admin` — korzeń panelu. Adres się nie
 * zmienia, zmienia się treść: bramka czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `pulpitAdministracji`). Grupa wyłączona
 * → dokładnie stara treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa
 * włączona → ekran „Pulpit administracji” nowego frontu
 * (`frontend/nowy-front/pulpit-administracji/`). Jedyny `main#tresc` i link
 * skoku daje `PanelShell` układu administracji; `DostawcaPowloki` mówi
 * szablonowi ekranu, że `main` niesie już powłoka (korzeń ekranu to wtedy
 * `div`). Powłoka `data-theme="light"` i arkusz tokenów są te same co w grupie
 * tras `(przelaczenie)` — ekrany nowego frontu bez nich nie mają zmiennych
 * stylu.
 */
export default function AdminHomePage() {
  if (!GRUPY.pulpitAdministracji.wlaczona) return <AdminHomeStaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <PulpitAdministracji />
      </DostawcaPowloki>
    </div>
  );
}
