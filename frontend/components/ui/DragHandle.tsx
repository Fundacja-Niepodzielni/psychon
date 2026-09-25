import type { DragEvent } from "react";

export interface DragHandleProps {
  onDragStart: (event: DragEvent<HTMLSpanElement>) => void;
  onDragEnd: () => void;
  label?: string;
}

/**
 * `DragHandle` — uchwyt przeciągania (U-9): dekoracyjny dla czytników ekranu
 * (`aria-hidden`), bo droga klawiaturowa jest gdzie indziej — zwykle obok
 * niego, jako para przycisków „W górę”/„W dół” (`MoveButtons`). Sam uchwyt
 * nigdy nie jest jedyną drogą do zmiany kolejności.
 */
export default function DragHandle({
  onDragStart,
  onDragEnd,
  label = "Przeciągnij, aby zmienić kolejność",
}: DragHandleProps) {
  return (
    <span
      draggable
      aria-hidden="true"
      title={label}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="cursor-grab select-none px-1 text-icon active:cursor-grabbing"
    >
      ⠿
    </span>
  );
}
