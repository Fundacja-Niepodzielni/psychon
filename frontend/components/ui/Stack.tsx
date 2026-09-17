import type { HTMLAttributes, ReactNode } from "react";

export type StackGap = "stack" | "field" | "tight";

const gaps: Record<StackGap, string> = {
  stack: "gap-stack",
  field: "gap-4",
  tight: "gap-2",
};

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** `ol`/`ul` — gdy elementy są pozycjami listy. */
  as?: "div" | "ol" | "ul";
  /** `stack` — między blokami ekranu, `field` — między polami i akapitami
   * w karcie, `tight` — między wierszami jednej listy. */
  gap?: StackGap;
  children: ReactNode;
}

/** `Stack` — elementy jeden pod drugim, ze stałym odstępem. */
export default function Stack({
  as: Tag = "div",
  gap = "field",
  className = "",
  children,
  ...rest
}: StackProps) {
  return (
    <Tag className={`flex flex-col ${gaps[gap]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
