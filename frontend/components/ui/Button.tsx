import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Stan ładowania: blokuje przycisk i pokazuje spinner. */
  loading?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-2.5 " +
  "text-body font-medium transition-colors duration-200 " +
  "focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-light hover:bg-ink",
  secondary:
    "border border-primary bg-card text-primary hover:bg-brand-10",
  ghost: "bg-transparent text-body hover:bg-grey",
};

export default function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <svg
          className="size-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="4"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
