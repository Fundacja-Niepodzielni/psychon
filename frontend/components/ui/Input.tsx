"use client";

import { useId, type InputHTMLAttributes } from "react";
import Field from "@/components/ui/Field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Komunikat błędu — powiązany przez aria-describedby. */
  error?: string;
  /** Tekst pomocniczy pod polem. */
  hint?: string;
}

export default function Input({
  label,
  error,
  hint,
  id,
  className = "",
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field id={inputId} label={label} error={error} hint={hint} className={className}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-control w-full rounded-control border bg-card px-4 py-2 text-body text-ink transition-colors duration-150 placeholder:text-subtle focus-visible:focus-ring disabled:cursor-not-allowed disabled:disabled-state ${
          error ? "border-danger" : "border-control hover:border-control-hover"
        }`}
        {...rest}
      />
    </Field>
  );
}
