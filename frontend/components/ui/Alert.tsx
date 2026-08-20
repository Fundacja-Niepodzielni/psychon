import type { ReactNode } from "react";

type Variant = "info" | "success" | "error";

export interface AlertProps {
  variant?: Variant;
  /** Pogrubiony tytuł (opcjonalny). */
  title?: string;
  children: ReactNode;
  className?: string;
}

const variants: Record<Variant, string> = {
  info: "border-info bg-info-bg text-info-dark",
  success: "border-brand bg-success-bg text-success",
  error: "border-danger-border bg-danger-bg text-danger",
};

export default function Alert({
  variant = "info",
  title,
  className = "",
  children,
}: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`rounded-sm border px-4 py-3 text-small ${variants[variant]} ${className}`}
    >
      {title && <p className="mb-1 font-bold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
