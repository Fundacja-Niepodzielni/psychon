import type { ReactNode } from "react";

export interface ActionRowProps {
  /** `end` — przyciski formularza i karty, `start` — przyciski w wierszu tabeli. */
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}

const aligns = {
  start: "justify-start",
  end: "justify-end",
} as const;

/**
 * `ActionRow` — rząd przycisków, zawijany na telefonie. Najwyżej jeden
 * przycisk główny w rzędzie (Z-13) pilnuje ekran wywołujący.
 */
export default function ActionRow({
  align = "end",
  className = "",
  children,
}: ActionRowProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${aligns[align]} ${className}`}
    >
      {children}
    </div>
  );
}
