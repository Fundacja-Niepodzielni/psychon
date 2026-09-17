import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Stan ładowania: blokuje przycisk i pokazuje spinner. */
  loading?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex min-h-control items-center justify-center gap-2 rounded-pill px-6 py-2 " +
  "text-body font-semibold transition-colors duration-150 ease-out-quint " +
  "focus-visible:focus-ring disabled:cursor-not-allowed disabled:disabled-state " +
  // Ikona w przycisku ma zawsze ten sam rozmiar; strona nie ustawia go sama.
  "[&_svg]:size-5 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-light hover:bg-primary-hover",
  secondary:
    "border border-primary bg-card text-primary hover:bg-nav-active hover:text-primary-hover",
  ghost: "bg-transparent text-body hover:bg-nav-hover hover:text-nav-hover-ink",
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
        <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      )}
      {children}
    </button>
  );
}
