import type { HTMLAttributes, ReactNode } from "react";

export type ColumnsFrom = "sm" | "md";

const breakpoints: Record<ColumnsFrom, string> = {
  sm: "sm:grid-cols-2",
  md: "md:grid-cols-2",
};

export interface ColumnsProps extends HTMLAttributes<HTMLDivElement> {
  /** Od jakiej szerokości treść staje w dwóch kolumnach; węziej zawsze jedna. */
  from?: ColumnsFrom;
  children: ReactNode;
}

/** `Columns` — dwie kolumny na szerszym ekranie, jedna na telefonie. */
export default function Columns({
  from = "sm",
  className = "",
  children,
  ...rest
}: ColumnsProps) {
  return (
    <div className={`grid gap-4 ${breakpoints[from]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
