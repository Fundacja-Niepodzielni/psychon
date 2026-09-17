import { ArrowDown, ArrowUp } from "lucide-react";
import ActionRow from "@/components/molecules/ActionRow";
import Button from "@/components/ui/Button";

export interface MoveButtonsProps {
  /** Nazwa przestawianego elementu — trafia do nazwy przycisku dla czytnika. */
  label: string;
  index: number;
  count: number;
  onMove: (index: number, delta: -1 | 1) => void;
}

/**
 * `MoveButtons` — para „W górę” / „W dół” dla elementu listy o ustalanej
 * kolejności. Skrajne pozycje mają wyłączony odpowiedni przycisk.
 */
export default function MoveButtons({
  label,
  index,
  count,
  onMove,
}: MoveButtonsProps) {
  return (
    <ActionRow align="start">
      <Button
        variant="ghost"
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
        aria-label={`Przesuń w górę: ${label}`}
      >
        <ArrowUp aria-hidden="true" />W górę
      </Button>
      <Button
        variant="ghost"
        onClick={() => onMove(index, 1)}
        disabled={index === count - 1}
        aria-label={`Przesuń w dół: ${label}`}
      >
        <ArrowDown aria-hidden="true" />W dół
      </Button>
    </ActionRow>
  );
}
