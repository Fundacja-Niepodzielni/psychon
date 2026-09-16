"use client";

import { useEffect, useId, useRef, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";

export interface RecordFormField {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea";
  required?: boolean;
  hint?: string;
}

export interface RecordFormProps {
  fields: RecordFormField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Mapa pole → komunikat: odmowa serwera trafia na konkretne pole, nie na
   * ogólny alert (Z-15). */
  fieldErrors?: Record<string, string>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * `RecordForm` — organizm C2 wariant C: formularz mapujący odmowę serwera na
 * konkretne pole (`aria-invalid`, `aria-describedby`), z podsumowaniem
 * błędów u góry i odnośnikami do pól (Z-15). Po pojawieniu się błędów fokus
 * wraca na pierwsze błędne pole — trzeci warunek Z-15, którego dotąd nie
 * miał żaden formularz w tym drzewie.
 */
export default function RecordForm({
  fields,
  values,
  onChange,
  fieldErrors = {},
  onSubmit,
  submitLabel = "Zapisz",
  loading = false,
  disabled = false,
  className = "",
}: RecordFormProps) {
  const formId = useId();
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const errorEntries = Object.entries(fieldErrors).filter(([, message]) => Boolean(message));
  const errorKey = errorEntries.map(([name]) => name).join(",");

  useEffect(() => {
    if (errorEntries.length === 0) return;
    const [firstName] = errorEntries[0];
    fieldRefs.current[firstName]?.focus();
    // errorKey zastępuje errorEntries w zależnościach: errorEntries to nowa
    // tablica przy każdym renderze, więc wpisanie jej wprost odpalałoby ten
    // efekt (i kradło fokus) przy każdym renderze, nie tylko po zmianie błędów.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey]);

  function fieldId(name: string) {
    return `${formId}-${name}`;
  }

  return (
    <form onSubmit={onSubmit} noValidate className={`flex flex-col gap-4 ${className}`}>
      {errorEntries.length > 0 && (
        <Alert variant="error" title="Popraw błędy w formularzu">
          <ul className="list-disc pl-5">
            {errorEntries.map(([name, message]) => {
              const field = fields.find((candidate) => candidate.name === name);
              return (
                <li key={name}>
                  <a
                    href={`#${fieldId(name)}`}
                    className="underline underline-offset-2 hover:no-underline focus-visible:focus-ring"
                  >
                    {field?.label ?? name}
                  </a>
                  {": "}
                  {message}
                </li>
              );
            })}
          </ul>
        </Alert>
      )}

      {fields.map((field) => {
        const id = fieldId(field.name);
        const error = fieldErrors[field.name];
        const errorElId = `${id}-error`;
        const hintElId = `${id}-hint`;
        const describedBy =
          [error ? errorElId : null, field.hint ? hintElId : null].filter(Boolean).join(" ") ||
          undefined;
        const value = values[field.name] ?? "";
        const controlClassName = `rounded-sm border bg-card px-4 py-2.5 text-body text-ink placeholder:text-subtle focus-visible:focus-ring ${
          error ? "border-danger" : "border-line"
        }`;

        return (
          <Field key={field.name} id={id} label={field.label} error={error} hint={field.hint}>
            {field.type === "textarea" ? (
              <textarea
                id={id}
                ref={(element) => {
                  fieldRefs.current[field.name] = element;
                }}
                rows={4}
                required={field.required}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(field.name, event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className={controlClassName}
              />
            ) : (
              <input
                id={id}
                ref={(element) => {
                  fieldRefs.current[field.name] = element;
                }}
                type={field.type ?? "text"}
                required={field.required}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(field.name, event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className={controlClassName}
              />
            )}
          </Field>
        );
      })}

      <div>
        <Button type="submit" loading={loading} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
