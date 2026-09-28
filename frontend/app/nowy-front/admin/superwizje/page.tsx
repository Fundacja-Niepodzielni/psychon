import { SuperwizjeTerminy } from "@/nowy-front/superwizje-terminy/SuperwizjeTerminy";

/**
 * Trasa `/nowy-front/admin/superwizje` — edycja i odwołanie terminów
 * superwizji (H12), `AdminSupervisionController::updateSlot`/`cancelSlot`
 * (`backend/routes/api/h12.php:47-49`). Odczyt i zapis biegną z
 * przeglądarki (`SuperwizjeTerminy.tsx`) — powód opisany tam.
 */
export default function StronaTerminowSuperwizji() {
  return <SuperwizjeTerminy />;
}
