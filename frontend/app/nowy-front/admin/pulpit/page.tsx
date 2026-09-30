import { PulpitAdministracji } from "@/nowy-front/pulpit-administracji/PulpitAdministracji";

/**
 * Trasa `/nowy-front/admin/pulpit` — ekran „Pulpit administracji”
 * (`GET /admin/dashboard`). Odczyt biegnie z przeglądarki
 * (`PulpitAdministracji.tsx`), tak jak na pozostałych stronach administracji
 * nowego frontu; stara trasa to `app/(administracja)/admin/page.tsx`.
 */
export default function StronaPulpituAdministracji() {
  return <PulpitAdministracji />;
}
