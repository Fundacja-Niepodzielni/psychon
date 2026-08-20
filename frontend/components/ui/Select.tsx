"use client";

import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** Komunikat błędu — powiązany przez aria-describedby. */
  error?: string;
  /** Opcje jako <option>…</option>. */
  children: ReactNode;
}

export default function Select({
  label,
  error,
  id,
  className = "",
  children,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const errorId = `${selectId}-error`;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={selectId} className="text-small font-medium text-ink">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded-sm border bg-card px-3.5 py-2.5 text-body text-ink focus-visible:focus-ring ${
          error ? "border-danger" : "border-line"
        }`}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
