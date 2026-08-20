"use client";

import { useId, type InputHTMLAttributes } from "react";

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
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-small font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink placeholder:text-subtle focus-visible:focus-ring ${
          error ? "border-danger" : "border-line"
        }`}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-caption text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
