import type { ReactNode } from "react";

export interface FieldProps {
  /** `id` kontrolki wewnątrz — etykieta i komunikaty wskazują na ten sam `id` (Z-15, Z-9). */
  id: string;
  label: string;
  /** Komunikat błędu — renderowany pod kontrolką, `id={`${id}-error`}`. */
  error?: string;
  /** Tekst pomocniczy pod polem, `id={`${id}-hint`}`. */
  hint?: string;
  className?: string;
  /** Kontrolka (input/select/textarea) — dostaje `id`, `aria-invalid` i
   * `aria-describedby` od wołającego (`Input`, `Select`, …). */
  children: ReactNode;
}

/**
 * `Field` — atom C2 wariant C: etykieta + kontrolka + błąd + podpowiedź pod
 * jednym `id` (dziś 19 ręcznych kopii w ekranach, C2 §3). Nie renderuje samej
 * kontrolki — to robi wołający (`Input`, `Select`), żeby `Field` działał z
 * dowolnym typem pola bez rozgałęzień `type`.
 */
export default function Field({
  id,
  label,
  error,
  hint,
  className = "",
  children,
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      {children}
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
