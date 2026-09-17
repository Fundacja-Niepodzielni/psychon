<?php

namespace App\Http\Requests\H10;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/tests/{test} — zmiana progu zaliczenia, limitu podejść
 * i liczby pytań na wierszu testu. Pola nieobecne w żądaniu pozostają
 * bez zmian; `null` cofa nadpisanie do wartości edycji (`pass_threshold`,
 * `attempts_limit` — zob. `TestGrader`). `question_count` nie przyjmuje
 * `null` (kolumna nie przyjmuje `NULL`).
 */
class UpdateTestRequest extends FormRequest
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
