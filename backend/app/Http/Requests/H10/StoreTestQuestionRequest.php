<?php

namespace App\Http\Requests\H10;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * POST /admin/tests/{test}/questions — nowe pytanie z kompletem odpowiedzi.
 * Dokładnie jedna odpowiedź poprawna.
 */
class StoreTestQuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'max:2000'],
            'answers' => ['required', 'array', 'min:2'],
            'answers.*.body' => ['required', 'string', 'max:1000'],
            'answers.*.is_correct' => ['required', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
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
