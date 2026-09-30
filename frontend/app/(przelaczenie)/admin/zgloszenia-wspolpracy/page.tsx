import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { ZgloszeniaWspolpracy } from "@/nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy";

/**
 * Trasa produktu `/admin/zgloszenia-wspolpracy` — nowa trasa grupy
 * przełączenia `wspolpraca` (`lib/przelaczenie/grupy.ts`), ekran
 * administracji. Bez starej trasy (funkcji dotąd w starym froncie nie
 * było — „Sprawy”, `/admin/sprawy`, to inny pakiet). Ekran sam
 * (`ZgloszeniaWspolpracy.tsx`, `frontend/nowy-front/zgloszenia-wspolpracy/`)
 * stoi na szablonie listy; odmowę roli pokazuje jego stan „brak uprawnień”
 * (odpowiedź 401 albo 403 z zaplecza), a brak sesji obsługuje klient API.
 * Dopóki grupa jest wyłączona, adres odpowiada jak na bazie (404).
 */
export default function StronaZgloszeniaWspolpracyAdmin() {
  if (!czyNowaTrasaDostepna(GRUPY.wspolpraca)) notFound();

  return <ZgloszeniaWspolpracy />;
}
