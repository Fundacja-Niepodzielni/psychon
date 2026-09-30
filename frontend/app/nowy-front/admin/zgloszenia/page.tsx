import { ZgloszeniaLista } from "@/nowy-front/zgloszenia-lista/ZgloszeniaLista";

/**
 * Trasa `/nowy-front/admin/zgloszenia` — ekran A-03 „Zgłoszenia rekrutacyjne”
 * (administracja). Strona tylko wybiera ekran; odczyt `GET /admin/applications`
 * biegnie z przeglądarki (`nowy-front/zgloszenia-lista/dane.ts`).
 */
export default function StronaZgloszen() {
  return <ZgloszeniaLista />;
}
