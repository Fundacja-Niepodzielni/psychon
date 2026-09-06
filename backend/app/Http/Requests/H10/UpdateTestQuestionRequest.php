<?php

namespace App\Http\Requests\H10;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * PATCH /admin/questions/{question} — edycja treści pytania i/lub odpowiedzi.
 *
 * Gdy `answers` jest podane, zastępuje cały zestaw: pozycje z `id` aktualizują
 * istniejące odpowiedzi, pozycje bez `id` tworzą nowe, brakujące są usuwane.
 * Edycja nie zmienia historii — podejścia trzymają własny snapshot (kryt. 3/6).
 */
class UpdateTestQuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'body' => ['sometimes', 'required', 'string', 'max:2000'],
            'sequence_order' => ['sometimes', 'integer', 'min:1'],
            'answers' => ['sometimes', 'required', 'array', 'min:2'],
            'answers.*.id' => ['sometimes', 'integer'],
            'answers.*.body' => ['required', 'string', 'max:1000'],
            'answers.*.is_correct' => ['required', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->has('answers')) {
                return;
            }

            $answers = (array) $this->input('answers', []);
            $correct = array_filter($answers, static fn ($a): bool => (bool) ($a['is_correct'] ?? false));

            if (count($correct) !== 1) {
                $validator->errors()->add('answers', 'Zaznacz dokładnie jedną poprawną odpowiedź.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'answers.min' => 'Pytanie musi mieć co najmniej :min odpowiedzi.',
        ];
    }
}
