import type { ReactNode } from "react";
import StatTile from "@/components/molecules/StatTile";

export interface StatRowItem {
  value: string | number;
  label: string;
  context?: ReactNode;
  /** Dokładnie jeden kafel grupy ma `dominant: true` (Z-3, Z-16). */
  dominant?: boolean;
}

export interface StatRowProps {
  /** Najwyżej 4 kafle (Z-16). */
  items: StatRowItem[];
  className?: string;
}

/**
 * `StatRow` — organizm C2 wariant C (partia P3a): najwyżej 4 kafle
 * `StatTile`, dokładnie jedna liczba dominująca. Piąty kafel jest błędem
 * programisty, nie cichym obcięciem listy — w trybie deweloperskim rzuca
 * wyjątek (`throw`, widoczny na ekranie błędu Next), żeby nikt nie
 * przeoczył naruszenia Z-16 na przeglądzie; w produkcji, żeby nie ubijać
 * ekranu klienta, tylko loguje błąd i pokazuje pierwsze 4 kafle.
 */
export default function StatRow({ items, className = "" }: StatRowProps) {
  if (items.length > 4) {
    const wiadomosc = `StatRow: najwyżej 4 kafle (Z-16), otrzymano ${items.length}.`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(wiadomosc);
    }
    console.error(wiadomosc);
  }

  const widoczne = items.slice(0, 4);

  return (
    <div className={`grid grid-cols-2 gap-6 sm:grid-cols-4 ${className}`}>
      {widoczne.map((item, index) => (
        <StatTile
          key={`${item.label}-${index}`}
          value={item.value}
          label={item.label}
          context={item.context}
          variant={item.dominant ? "dominant" : "regular"}
        />
      ))}
    </div>
  );
}
