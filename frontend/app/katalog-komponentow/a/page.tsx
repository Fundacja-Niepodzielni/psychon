import { notFound } from "next/navigation";
import KatalogA from "./KatalogA";

/**
 * Katalog przykładów C2 wariant C, partia P3a — 5 molekuł i 3 organizmy,
 * każdy w stanach spoczynek/fokus/błąd/wyłączony. Trasa istnieje tylko poza
 * produkcją: w `next build && next start` zwraca 404 (K8), żeby katalog
 * roboczy nie wyciekł do klienta jako część produktu (Z-11).
 */
export default function KatalogKomponentowAPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <KatalogA />;
}
