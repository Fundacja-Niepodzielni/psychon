import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import DragHandle from "@/components/ui/DragHandle";

describe("DragHandle", () => {
  it("pozytyw: dekoracyjny dla czytników ekranu (aria-hidden) — droga klawiaturowa jest gdzie indziej", () => {
    const { container } = render(
      <DragHandle onDragStart={vi.fn()} onDragEnd={vi.fn()} />,
    );

    const uchwyt = container.querySelector("[draggable='true']");
    expect(uchwyt).toHaveAttribute("aria-hidden", "true");
  });

  it("pozytyw: przeciągnięcie i puszczenie wołają odpowiednio onDragStart/onDragEnd", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { container } = render(
      <DragHandle onDragStart={onDragStart} onDragEnd={onDragEnd} />,
    );
    const uchwyt = container.querySelector("[draggable='true']") as HTMLElement;

    fireEvent.dragStart(uchwyt, {
      dataTransfer: { effectAllowed: "", setData: vi.fn(), getData: vi.fn() },
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.dragEnd(uchwyt);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});
