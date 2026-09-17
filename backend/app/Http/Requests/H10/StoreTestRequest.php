<?php

namespace App\Http\Requests\H10;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/courses/{course}/tests — zakłada wiersz testu dla kursu.
 *
 * `pass_threshold` / `attempts_limit` opcjonalne: pominięte lub `null`
 * zostają `null` (wartość edycji, `TestGrader`). `question_count` opcjonalne,
 * ale gdy podane, nie może być `null` (kolumna nie przyjmuje `NULL`);
 * pominięte dostaje wartość domyślną kolumny (10).
 */
class StoreTestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'pass_threshold' => ['sometimes', 'nullable', 'integer', 'between:1,100', $this->notBoolean('Próg zaliczenia musi być liczbą całkowitą.')],
            'attempts_limit' => ['sometimes', 'nullable', 'integer', 'between:1,255', $this->notBoolean('Limit podejść musi być liczbą całkowitą.')],
            'question_count' => ['sometimes', 'integer', 'between:1,255', $this->notBoolean('Liczba pytań musi być liczbą całkowitą.')],
        ];
    }

    public function messages(): array
    {
        return [
            'pass_threshold.integer' => 'Próg zaliczenia musi być liczbą całkowitą.',
            'pass_threshold.between' => 'Próg zaliczenia musi mieścić się między :min a :max procent.',
            'attempts_limit.integer' => 'Limit podejść musi być liczbą całkowitą.',
            'attempts_limit.between' => 'Limit podejść musi mieścić się między :min a :max.',
            'question_count.integer' => 'Liczba pytań musi być liczbą całkowitą.',
            'question_count.between' => 'Liczba pytań musi mieścić się między :min a :max.',
        ];
    }

    private function notBoolean(string $message): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($message): void {
            if (is_bool($value)) {
                $fail($message);
            }
        };
    }
}
