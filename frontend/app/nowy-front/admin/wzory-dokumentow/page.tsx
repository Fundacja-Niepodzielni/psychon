import { WzoryDokumentow } from "@/nowy-front/wzory-dokumentow/WzoryDokumentow";

/**
 * Trasa `/nowy-front/admin/wzory-dokumentow` — jeden ekran na wszystkie trzy
 * rodzaje wzorów; rodzaj wybiera się w nagłówku, bez zmiany adresu, dzięki
 * czemu przełączenie z niezapisaną treścią da się zatrzymać pytaniem.
 * Dane czytane są z przeglądarki (`WzoryDokumentow.tsx`), tokenem sesji.
 */
export default function StronaWzorowDokumentow() {
  return <WzoryDokumentow />;
}
