"use client";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  MIN_ANSWERS,
  type AnswerDraft,
  type QuestionDraft,
} from "@/lib/h10/types";

export interface QuestionFormProps {
  draft: QuestionDraft;
  onChange: (draft: QuestionDraft) => void;
  /** Błędy pól z odpowiedzi 422 serwera (klucze jak w regułach walidacji). */
  fieldErrors?: Record<string, string[]>;
  /** Prefiks identyfikatorów — na jednym ekranie stoi kilka takich formularzy. */
  idPrefix: string;
  disabled?: boolean;
}

/**
 * Formularz jednego pytania: treść + lista odpowiedzi z dokładnie jedną
 * poprawną. Używany tak samo przy dodawaniu, jak przy edycji — dzięki temu
 * reguła „jedna poprawna" ma jedno miejsce w kodzie, a nie dwa rozjeżdżające się.
 *
 * Poprawną odpowiedź wskazuje grupa `radio`, nie pola wyboru: reguła serwera
 * mówi „dokładnie jedna", a radio jest jedyną kontrolką, która tego nie pozwala
 * złamać myszą. Formularz nie zawiera `<form>` — bywa renderowany w wierszu
 * listy obok innych formularzy.
 */
export default function QuestionForm({
  draft,
  onChange,
  fieldErrors = {},
  idPrefix,
  disabled = false,
}: QuestionFormProps) {
  function updateAnswer(index: number, patch: Partial<AnswerDraft>) {
    onChange({
      ...draft,
      answers: draft.answers.map((answer, i) =>
        i === index ? { ...answer, ...patch } : answer,
      ),
    });
  }

  function markCorrect(index: number) {
    onChange({
      ...draft,
      answers: draft.answers.map((answer, i) => ({
        ...answer,
        is_correct: i === index,
      })),
    });
  }

  function addAnswer() {
    onChange({
      ...draft,
      answers: [...draft.answers, { body: "", is_correct: false }],
    });
  }

  function removeAnswer(index: number) {
    const answers = draft.answers.filter((_, i) => i !== index);

    onChange({
      ...draft,
      // Usunięcie poprawnej odpowiedzi nie może zostawić pytania bez klucza —
      // wskazanie przechodzi na pierwszą pozostałą.
      answers: answers.some((answer) => answer.is_correct)
        ? answers
        : answers.map((answer, i) => ({ ...answer, is_correct: i === 0 })),
    });
  }

  const bodyId = `${idPrefix}-body`;
  const bodyError = fieldErrors.body?.[0];
  const answersError = fieldErrors.answers?.[0];

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={bodyId}
          className="mb-1 block text-small font-medium text-ink"
        >
          Treść pytania
        </label>
        <textarea
          id={bodyId}
          value={draft.body}
          onChange={(event) => onChange({ ...draft, body: event.target.value })}
          disabled={disabled}
          rows={3}
          maxLength={2000}
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={bodyError ? `${bodyId}-error` : undefined}
          className="w-full rounded-sm border border-line bg-card px-4 py-2.5 text-body text-ink transition-colors duration-200 focus-visible:focus-ring disabled:opacity-50"
        />
        {bodyError && (
          <p id={`${bodyId}-error`} className="mt-1 text-caption text-danger">
            {bodyError}
          </p>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-small font-medium text-ink">
          Odpowiedzi — zaznacz jedną poprawną
        </legend>

        {draft.answers.map((answer, index) => (
          <div
            key={answer.id ?? `nowa-${index}`}
            className="flex items-start gap-3"
          >
            <input
              type="radio"
              name={`${idPrefix}-poprawna`}
              checked={answer.is_correct}
              onChange={() => markCorrect(index)}
              disabled={disabled}
              aria-label={`Odpowiedź ${index + 1} jest poprawna`}
              className="mt-3 size-4 shrink-0 accent-primary focus-visible:focus-ring"
            />

            <div className="flex-1">
              <Input
                label={`Odpowiedź ${index + 1}`}
                value={answer.body}
                onChange={(event) =>
                  updateAnswer(index, { body: event.target.value })
                }
                disabled={disabled}
                maxLength={1000}
                error={fieldErrors[`answers.${index}.body`]?.[0]}
              />
            </div>

            <Button
              variant="ghost"
              onClick={() => removeAnswer(index)}
              // Poniżej minimum serwera formularz nie pozwala zejść — inaczej
              // jedyną informacją zwrotną byłoby 422 po wysłaniu.
              disabled={disabled || draft.answers.length <= MIN_ANSWERS}
              aria-label={`Usuń odpowiedź ${index + 1}`}
              className="mt-6 px-3"
            >
              Usuń
            </Button>
          </div>
        ))}

        {answersError && (
          <p className="text-caption text-danger" role="alert">
            {answersError}
          </p>
        )}

        <Button variant="secondary" onClick={addAnswer} disabled={disabled}>
          Dodaj odpowiedź
        </Button>
      </fieldset>
    </div>
  );
}
