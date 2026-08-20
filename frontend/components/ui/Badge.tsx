import type { ReactNode } from "react";

type Variant = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variants: Record<Variant, string> = {
  neutral: "bg-grey text-muted",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning-dark",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info-dark",
  accent: "bg-accent-15 text-accent",
};

export default function Badge({
  variant = "neutral",
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-3 py-1 text-caption font-bold ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
