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
 * `StatRow` — organizm C2 wariant C: najwyżej 4 kafle `StatTile`, dokładnie
 * jedna liczba dominująca, zawsze z kontekstem. Trzy naruszenia są błędem
 * programisty, nie cichym renderem — w trybie deweloperskim każde rzuca
 * wyjątek (`throw`, widoczny na ekranie błędu Next), żeby nikt nie
 * przeoczył go na przeglądzie: więcej niż 4 kafle (Z-16), inna liczba
 * dominujących niż dokładnie 1, dominująca bez kontekstu (oba Z-3). W
 * produkcji, żeby nie ubijać ekranu klienta, każde tylko loguje błąd:
 * nadmiar kafli ucina do pierwszych 4, pozostałe dwa renderują dane bez
 * poprawiania ich.
 */
export default function StatRow({ items, className = "" }: StatRowProps) {
  function zglosBlad(wiadomosc: string) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(wiadomosc);
    }
    console.error(wiadomosc);
  }

  if (items.length > 4) {
    zglosBlad(`StatRow: najwyżej 4 kafle (Z-16), otrzymano ${items.length}.`);
  }

  const widoczne = items.slice(0, 4);
  const dominujace = widoczne.filter((item) => item.dominant);

  if (dominujace.length !== 1) {
    zglosBlad(
      `StatRow: dokładnie jedna liczba dominująca (Z-3), otrzymano ${dominujace.length}.`,
    );
  } else if (!dominujace[0].context) {
    zglosBlad("StatRow: liczba dominująca musi mieć kontekst (Z-3).");
  }

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
