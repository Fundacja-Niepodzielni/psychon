"use client";

import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import Field from "@/components/ui/Field";

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
    <Field id={selectId} label={label} error={error} className={className}>
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
    </Field>
  );
}
