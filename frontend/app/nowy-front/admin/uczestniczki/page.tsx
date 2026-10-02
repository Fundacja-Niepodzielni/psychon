import { OsobyLista } from "@/nowy-front/osoby-lista/OsobyLista";

/**
 * Trasa `/nowy-front/admin/uczestniczki` — ekran A-06 „Uczestnicy programu”
 * (administracja). Strona tylko wybiera ekran; odczyt `GET /admin/users` i
 * pobranie tabeli biegną z przeglądarki (`nowy-front/osoby-lista/dane.ts`).
 */
export default function StronaOsob() {
  return <OsobyLista adresNowejOsoby="/nowy-front/admin/osoby/nowa" />;
}
