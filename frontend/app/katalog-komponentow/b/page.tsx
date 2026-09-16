import { notFound } from "next/navigation";
import KatalogPrzykladyB from "./KatalogPrzykladyB";

/**
 * Katalog przykładów organizmów partii P3b (`ConfirmDialog`, `PanelNav`,
 * `NotificationList`, `MainBlock`, `SupportBlock`, `RecordForm`) — narzędzie
 * pracy zespołu, nie ekran produktu (Z-11). W produkcji trasa zwraca 404,
 * żeby katalog wewnętrzny nie trafiał do osoby korzystającej z platformy.
 */
export default function KatalogKomponentowBPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <KatalogPrzykladyB />;
}
