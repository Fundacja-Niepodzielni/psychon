"use client";

import type { FormHTMLAttributes, ReactNode } from "react";
import useFokusPoOdmowie from "@/lib/hooks/useFokusPoOdmowie";

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  /** Błędy pól z odpowiedzi 422 — nowa porcja przenosi fokus (Z-15). */
  bledyPol?: Record<string, string[]>;
  children: ReactNode;
}

/**
 * `Form` — element `form` z powrotem fokusu po odmowie serwera.
 *
 * Walidację po stronie przeglądarki wyłącza `noValidate`: komunikaty pisze
 * ekran na podstawie odpowiedzi serwera, żeby jedna reguła nie miała dwóch
 * różnych brzmień.
 */
export default function Form({ bledyPol, children, ...rest }: FormProps) {
  const obszar = useFokusPoOdmowie<HTMLFormElement>(bledyPol);

  return (
    <form ref={obszar} noValidate {...rest}>
      {children}
    </form>
  );
}
