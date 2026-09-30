import { PulpitProwadzacego } from "@/nowy-front/pulpit-prowadzacego/PulpitProwadzacego";

/**
 * Trasa `/nowy-front/prowadzacy` — ekran „Pulpit prowadzącego” na szablonie
 * `DashboardTemplate`. Trzy odczyty (pytania, grupa, kursy) biegną z
 * przeglądarki (`pulpit-prowadzacego/dane.ts`) — powód opisany tam.
 */
export default function StronaPulpitProwadzacego() {
  return <PulpitProwadzacego />;
}
