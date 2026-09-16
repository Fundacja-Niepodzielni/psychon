<?php

namespace App\Http\Requests\H10;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/courses/{course}/tests — zakłada wiersz testu dla kursu.
 *
 * Wszystkie pola opcjonalne: pominięte `pass_threshold` / `attempts_limit`
 * zostają `null` (wartość edycji, `TestGrader`), pominięte `question_count`
 * dostaje wartość domyślną kolumny (10).
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
            'pass_threshold' => ['sometimes', 'nullable', 'integer', 'between:1,100'],
            'attempts_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'question_count' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'pass_threshold.integer' => 'Próg zaliczenia musi być liczbą całkowitą.',
            'pass_threshold.between' => 'Próg zaliczenia musi mieścić się między :min a :max procent.',
            'attempts_limit.integer' => 'Limit podejść musi być liczbą całkowitą.',
            'attempts_limit.min' => 'Limit podejść musi wynosić co najmniej :min.',
            'question_count.integer' => 'Liczba pytań musi być liczbą całkowitą.',
            'question_count.min' => 'Liczba pytań musi wynosić co najmniej :min.',
        ];
    }
}
