import { CzasNauki } from "@/nowy-front/czas-nauki/CzasNauki";

/**
 * Trasa `/nowy-front/admin/czas-nauki` — ekran „Czas nauki” (administracja):
 * rzetelność nauki osób i szczegóły ukończonych lekcji. Strona tylko wybiera
 * ekran; odczyty `GET /admin/reliability` i `GET /admin/reliability/{userId}`
 * biegną z przeglądarki (`nowy-front/czas-nauki/dane.ts`).
 */
export default function StronaCzasuNauki() {
  return <CzasNauki />;
}
