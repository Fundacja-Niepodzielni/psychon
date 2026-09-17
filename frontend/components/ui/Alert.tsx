import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

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

/** Ikona w kolorze tekstu komunikatu — kontrast ikony równy kontrastowi tekstu (≥ 4,5:1). */
const icons: Record<Variant, typeof Info> = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
};

export default function Alert({
  variant = "info",
  title,
  className = "",
  children,
}: AlertProps) {
  const Icon = icons[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-control border px-4 py-3 text-small ${variants[variant]} ${className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="mb-1 font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
