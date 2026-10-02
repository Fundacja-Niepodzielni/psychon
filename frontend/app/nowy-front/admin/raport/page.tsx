import { RaportRokuProgramu } from "@/nowy-front/raport-roku-programu/RaportRokuProgramu";

/**
 * Trasa `/nowy-front/admin/raport` — ekran „Raport roku programu”
 * (`GET /admin/report`). Odczyt i pobieranie plików biegną z przeglądarki
 * (`RaportRokuProgramu.tsx`), tak jak na pozostałych stronach administracji
 * nowego frontu; stara trasa to `app/(administracja)/admin/raport/page.tsx`.
 */
export default function StronaRaportuRokuProgramu() {
  return <RaportRokuProgramu />;
}
